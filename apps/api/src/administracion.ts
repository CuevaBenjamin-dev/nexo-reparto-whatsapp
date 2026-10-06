import { BadRequestException, Body, ConflictException, Controller, Get, Inject, NotFoundException, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import * as argon2 from 'argon2';
import { Rol } from '@prisma/client';
import { BaseDatos } from './base-datos';
import { Roles, UsuarioActual, UsuarioSesion } from './auth';
import { ServicioReparto } from './reparto';
import { Configuracion } from './config';

class GrupoDto { @IsString() @MaxLength(100) nombre!: string; @IsOptional() @IsString() @MaxLength(500) descripcion?: string; }
class GrupoPatchDto { @IsOptional() @IsString() @MaxLength(100) nombre?: string; @IsOptional() @IsString() @MaxLength(500) descripcion?: string; @IsOptional() @IsBoolean() activo?: boolean; }
class AsesorDto { @IsInt() usuarioId!: number; @IsInt() grupoId!: number; @IsOptional() @IsBoolean() activoReparto?: boolean; }
class AsesorPatchDto { @IsOptional() @IsInt() grupoId?: number; @IsOptional() @IsBoolean() activoReparto?: boolean; }
class DisponibilidadDto { @IsBoolean() activoReparto!: boolean; }
class OpcionDto { @IsString() @MaxLength(24) titulo!: string; @IsOptional() @IsString() @MaxLength(72) descripcion?: string; @IsString() @MaxLength(200) identificadorExterno!: string; @IsInt() grupoId!: number; @IsInt() orden!: number; @IsOptional() @IsBoolean() activo?: boolean; }
class OpcionPatchDto { @IsOptional() @IsString() @MaxLength(24) titulo?: string; @IsOptional() @IsString() @MaxLength(72) descripcion?: string; @IsOptional() @IsString() @MaxLength(200) identificadorExterno?: string; @IsOptional() @IsInt() grupoId?: number; @IsOptional() @IsInt() orden?: number; @IsOptional() @IsBoolean() activo?: boolean; }
class UsuarioDto { @IsString() @MaxLength(80) nombre!: string; @IsString() @MaxLength(80) apellido!: string; @IsEmail() correo!: string; @IsString() @MinLength(12) password!: string; @IsEnum(Rol) rol!: Rol; }
class UsuarioPatchDto { @IsOptional() @IsBoolean() activo?: boolean; @IsOptional() @IsEnum(Rol) rol?: Rol; @IsOptional() @IsString() @MinLength(12) password?: string; }

@Controller('grupos')
export class GruposController {
  constructor(private readonly db: BaseDatos) {}
  @Get() @Roles('ADMIN', 'SUPERVISOR', 'RRHH') listar() { return this.db.grupo.findMany({ orderBy: { nombre: 'asc' } }); }
  @Post() @Roles('ADMIN') async crear(@Body() dto: GrupoDto, @UsuarioActual() usuario: UsuarioSesion) {
    return this.db.$transaction(async tx => { const grupo = await tx.grupo.create({ data: dto }); await tx.auditoria.create({ data: { usuarioId: usuario.id, accion: 'CREAR', entidad: 'grupos', entidadId: String(grupo.id), datos: { ...dto } } }); return grupo; });
  }
  @Patch(':id') @Roles('ADMIN') async editar(@Param('id', ParseIntPipe) id: number, @Body() dto: GrupoPatchDto, @UsuarioActual() usuario: UsuarioSesion) {
    return this.db.$transaction(async tx => { const grupo = await tx.grupo.update({ where: { id }, data: dto }); await tx.auditoria.create({ data: { usuarioId: usuario.id, accion: 'EDITAR', entidad: 'grupos', entidadId: String(id), datos: { ...dto } } }); return grupo; });
  }
}

@Controller('asesores')
export class AsesoresController {
  constructor(private readonly db: BaseDatos, private readonly reparto: ServicioReparto) {}
  @Get() @Roles('ADMIN', 'SUPERVISOR', 'RRHH') listar() { return this.db.asesor.findMany({ include: { usuario: { select: { id: true, nombre: true, apellido: true, correo: true, activo: true } }, grupo: true }, orderBy: { id: 'asc' } }); }
  @Post() @Roles('ADMIN') async crear(@Body() dto: AsesorDto, @UsuarioActual() usuario: UsuarioSesion) {
    return this.db.$transaction(async tx => {
      await this.reparto.bloquearGrupo(tx, dto.grupoId);
      const cuenta = await tx.usuario.findUnique({ where: { id: dto.usuarioId } });
      if (!cuenta || cuenta.rol !== 'ASESOR') throw new BadRequestException('Usuario asesor inexistente');
      const minimo = await tx.asesor.aggregate({ where: { grupoId: dto.grupoId, activoReparto: true }, _min: { contadorReparto: true } });
      const asesor = await tx.asesor.create({ data: { usuarioId: dto.usuarioId, grupoId: dto.grupoId, activoReparto: dto.activoReparto ?? true, contadorReparto: minimo._min.contadorReparto ?? 0 } });
      await tx.auditoria.create({ data: { usuarioId: usuario.id, accion: 'CREAR', entidad: 'asesores', entidadId: String(asesor.id), datos: { ...dto } } });
      return asesor;
    });
  }
  @Patch(':id/disponibilidad') @Roles('ADMIN', 'RRHH') async disponibilidad(@Param('id', ParseIntPipe) id: number, @Body() dto: DisponibilidadDto, @UsuarioActual() usuario: UsuarioSesion) {
    return this.editar(id, { activoReparto: dto.activoReparto }, usuario);
  }
  @Patch(':id') @Roles('ADMIN') async actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: AsesorPatchDto, @UsuarioActual() usuario: UsuarioSesion) { return this.editar(id, dto, usuario); }
  private async editar(id: number, dto: AsesorPatchDto, usuario: UsuarioSesion) {
    return this.db.$transaction(async tx => {
      const actual = await tx.asesor.findUnique({ where: { id } });
      if (!actual) throw new NotFoundException('Asesor inexistente');
      for (const grupoId of [...new Set([actual.grupoId, dto.grupoId].filter((x): x is number => x !== undefined))].sort((a, b) => a - b)) await this.reparto.bloquearGrupo(tx, grupoId);
      let contadorReparto = actual.contadorReparto;
      if (dto.grupoId && dto.grupoId !== actual.grupoId) {
        const abiertas = await tx.conversacion.count({ where: { asesorId: id, estado: { not: 'CERRADA' } } });
        if (abiertas) throw new ConflictException('Reasigna o cierra sus conversaciones antes de cambiarlo de grupo');
        const minimo = await tx.asesor.aggregate({ where: { grupoId: dto.grupoId, activoReparto: true }, _min: { contadorReparto: true } });
        contadorReparto = minimo._min.contadorReparto ?? 0;
      }
      const asesor = await tx.asesor.update({ where: { id }, data: { ...dto, contadorReparto } });
      await tx.auditoria.create({ data: { usuarioId: usuario.id, accion: dto.activoReparto === false ? 'DESACTIVAR_REPARTO' : dto.activoReparto === true ? 'ACTIVAR_REPARTO' : 'EDITAR', entidad: 'asesores', entidadId: String(id), datos: { ...dto } } });
      return asesor;
    });
  }
}

@Controller('opciones-whatsapp')
export class OpcionesController {
  constructor(private readonly db: BaseDatos) {}
  @Get() @Roles('ADMIN', 'SUPERVISOR') listar() { return this.db.opcionWhatsapp.findMany({ include: { grupo: true }, orderBy: [{ orden: 'asc' }, { id: 'asc' }] }); }
  @Post() @Roles('ADMIN') async crear(@Body() dto: OpcionDto, @UsuarioActual() usuario: UsuarioSesion) {
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(42019, 1)::text`;
      if (dto.activo !== false && await tx.opcionWhatsapp.count({ where: { activo: true } }) >= 10) throw new ConflictException('Máximo 10 opciones activas para la lista de WhatsApp');
      const opcion = await tx.opcionWhatsapp.create({ data: dto });
      await tx.auditoria.create({ data: { usuarioId: usuario.id, accion: 'CREAR', entidad: 'opciones_whatsapp', entidadId: String(opcion.id), datos: { ...dto } } });
      return opcion;
    });
  }
  @Patch(':id') @Roles('ADMIN') async editar(@Param('id', ParseIntPipe) id: number, @Body() dto: OpcionPatchDto, @UsuarioActual() usuario: UsuarioSesion) {
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(42019, 1)::text`;
      const actual = await tx.opcionWhatsapp.findUnique({ where: { id } });
      if (!actual) throw new NotFoundException('Opción inexistente');
      if (dto.activo === true && !actual.activo && await tx.opcionWhatsapp.count({ where: { activo: true } }) >= 10) throw new ConflictException('Máximo 10 opciones activas');
      const opcion = await tx.opcionWhatsapp.update({ where: { id }, data: dto });
      await tx.auditoria.create({ data: { usuarioId: usuario.id, accion: 'EDITAR', entidad: 'opciones_whatsapp', entidadId: String(id), datos: { ...dto } } });
      return opcion;
    });
  }
}

@Controller('usuarios') @Roles('ADMIN')
export class UsuariosController {
  constructor(private readonly db: BaseDatos) {}
  @Get() listar() { return this.db.usuario.findMany({ select: { id: true, nombre: true, apellido: true, correo: true, rol: true, activo: true, fechaCreacion: true }, orderBy: { id: 'asc' } }); }
  @Post() async crear(@Body() dto: UsuarioDto, @UsuarioActual() usuario: UsuarioSesion) {
    return this.db.$transaction(async tx => {
      const cuenta = await tx.usuario.create({ data: { nombre: dto.nombre, apellido: dto.apellido, correo: dto.correo.toLowerCase(), rol: dto.rol, passwordHash: await argon2.hash(dto.password, { type: argon2.argon2id }) }, select: { id: true, nombre: true, apellido: true, correo: true, rol: true, activo: true } });
      await tx.auditoria.create({ data: { usuarioId: usuario.id, accion: 'CREAR', entidad: 'usuarios', entidadId: String(cuenta.id), datos: { rol: dto.rol } } });
      return cuenta;
    });
  }
  @Patch(':id') async editar(@Param('id', ParseIntPipe) id: number, @Body() dto: UsuarioPatchDto, @UsuarioActual() usuario: UsuarioSesion) {
    return this.db.$transaction(async tx => {
      if (id === usuario.id && dto.activo === false) throw new BadRequestException('No puedes desactivar tu propia cuenta');
      const cuenta = await tx.usuario.update({ where: { id }, data: { activo: dto.activo, rol: dto.rol, passwordHash: dto.password ? await argon2.hash(dto.password, { type: argon2.argon2id }) : undefined }, select: { id: true, nombre: true, apellido: true, correo: true, rol: true, activo: true } });
      await tx.auditoria.create({ data: { usuarioId: usuario.id, accion: 'EDITAR', entidad: 'usuarios', entidadId: String(id), datos: { activo: dto.activo, rol: dto.rol, passwordCambiado: Boolean(dto.password) } } });
      return cuenta;
    });
  }
}

@Controller('dashboard') @Roles('ADMIN', 'SUPERVISOR')
export class DashboardController {
  constructor(private readonly db: BaseDatos) {}
  @Get() async obtener() {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const [abiertas, pendientes, activos, inactivos, asignacionesHoy] = await Promise.all([
      this.db.conversacion.count({ where: { estado: 'ABIERTA' } }), this.db.conversacion.count({ where: { estado: 'PENDIENTE_ASIGNACION' } }),
      this.db.asesor.count({ where: { activoReparto: true, usuario: { activo: true } } }), this.db.asesor.count({ where: { activoReparto: false } }),
      this.db.asignacion.count({ where: { fechaCreacion: { gte: hoy } } }),
    ]);
    return { abiertas, pendientes, activos, inactivos, asignacionesHoy };
  }
}

@Controller('auditoria') @Roles('ADMIN', 'SUPERVISOR')
export class AuditoriaController {
  constructor(private readonly db: BaseDatos) {}
  @Get() listar() { return this.db.auditoria.findMany({ orderBy: { fecha: 'desc' }, take: 100, include: { usuario: { select: { nombre: true, apellido: true } } } }); }
}

@Controller('configuracion') @Roles('ADMIN')
export class ConfiguracionController {
  constructor(@Inject('CONFIG') private readonly config: Configuracion) {}
  @Get('estado') @Roles('ADMIN', 'SUPERVISOR', 'RRHH', 'ASESOR') estado() { return { modo: this.config.whatsappMode, simuladorDisponible: this.config.nodeEnv !== 'production' && this.config.whatsappMode === 'mock' }; }
  @Get('whatsapp') whatsapp() { return { modo: this.config.whatsappMode, phoneNumberIdConfigurado: Boolean(this.config.metaPhoneNumberId), wabaIdConfigurado: Boolean(this.config.metaWabaId), accessTokenConfigurado: Boolean(this.config.metaAccessToken), appSecretConfigurado: Boolean(this.config.metaAppSecret), verifyTokenConfigurado: Boolean(this.config.metaVerifyToken), webhook: `${this.config.apiUrl}/webhooks/meta/whatsapp`, numeroVisible: this.config.whatsappDisplayNumber || null }; }
}
