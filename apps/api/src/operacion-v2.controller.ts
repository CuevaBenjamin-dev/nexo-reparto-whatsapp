import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { EstadoIntegracion, EstadoSolicitudReparto, Prisma, TipoCanalWhatsapp } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { BaseDatos } from './base-datos';
import { Roles, UsuarioActual, UsuarioSesion } from './auth';
import { ServicioOperacionV2 } from './operacion-v2';
import { ServicioReparto } from './reparto';
import { TiempoReal } from './tiempo-real';

class CanalDto {
  @IsEnum(TipoCanalWhatsapp) tipo!: TipoCanalWhatsapp;
  @IsString() @MinLength(2) @MaxLength(100) nombre!: string;
  @IsOptional() @IsString() @MaxLength(30) numeroVisible?: string;
  @IsOptional() @IsString() @MaxLength(100) phoneNumberId?: string;
  @IsOptional() @IsString() @MaxLength(100) wabaId?: string;
  @IsOptional() @IsInt() @Min(1) asesorId?: number;
  @IsOptional() @IsBoolean() activo?: boolean;
  @IsOptional() @IsBoolean() modoCoexistencia?: boolean;
  @IsOptional() @IsEnum(EstadoIntegracion) estadoIntegracion?: EstadoIntegracion;
}
class CanalPatchDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) nombre?: string;
  @IsOptional() @IsString() @MaxLength(30) numeroVisible?: string;
  @IsOptional() @IsString() @MaxLength(100) phoneNumberId?: string;
  @IsOptional() @IsString() @MaxLength(100) wabaId?: string;
  @IsOptional() @IsInt() @Min(1) asesorId?: number;
  @IsOptional() @IsBoolean() activo?: boolean;
  @IsOptional() @IsBoolean() modoCoexistencia?: boolean;
  @IsOptional() @IsEnum(EstadoIntegracion) estadoIntegracion?: EstadoIntegracion;
}
class ConfiguracionDto {
  @IsOptional() @IsString() @MaxLength(150) nombrePlantillaInicio?: string;
  @IsOptional() @IsString() @MaxLength(20) idiomaPlantillaInicio?: string;
  @IsOptional() @IsString() @MaxLength(1000) mensajeEspera?: string;
}
class ReasignarDto { @IsInt() @Min(1) asesorId!: number; @IsString() @MinLength(3) @MaxLength(500) motivo!: string; }

@Controller('canales-whatsapp')
export class CanalesWhatsappController {
  constructor(private readonly db: BaseDatos) {}
  @Get('visibles') @Roles('ADMIN', 'SUPERVISOR', 'ASESOR')
  visibles(@UsuarioActual() usuario: UsuarioSesion) { return this.db.canalWhatsapp.findMany({ where: usuario.rol === 'ASESOR' ? { tipo: 'ASESOR', asesor: { usuarioId: usuario.id } } : {}, select: { id: true, tipo: true, nombre: true, numeroVisible: true, activo: true }, orderBy: { id: 'asc' } }); }
  @Get() @Roles('ADMIN', 'SUPERVISOR')
  listar() { return this.db.canalWhatsapp.findMany({ include: { asesor: { include: { usuario: { select: { nombre: true, apellido: true, activo: true } } } } }, orderBy: { id: 'asc' } }); }
  @Post() @Roles('ADMIN')
  async crear(@Body() dto: CanalDto, @UsuarioActual() usuario: UsuarioSesion) {
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(42021, 1)::text`;
      await this.validar(tx, dto);
      const canal = await tx.canalWhatsapp.create({ data: { ...dto, numeroVisible: dto.numeroVisible || null, phoneNumberId: dto.phoneNumberId || null, wabaId: dto.wabaId || null, asesorId: dto.asesorId || null } });
      await tx.auditoria.create({ data: { usuarioId: usuario.id, accion: 'CREAR_CANAL', entidad: 'canales_whatsapp', entidadId: String(canal.id), datos: { tipo: canal.tipo, asesorId: canal.asesorId, phoneNumberId: canal.phoneNumberId, activo: canal.activo } } });
      return canal;
    });
  }
  @Patch(':id') @Roles('ADMIN')
  async editar(@Param('id', ParseIntPipe) id: number, @Body() dto: CanalPatchDto, @UsuarioActual() usuario: UsuarioSesion) {
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(42021, 1)::text`;
      const anterior = await tx.canalWhatsapp.findUnique({ where: { id } });
      if (!anterior) throw new NotFoundException('Canal inexistente');
      const cambios = Object.fromEntries(
        Object.entries(dto).filter(([, valor]) => valor !== undefined)
      ) as CanalPatchDto;

      const unido = { ...anterior, ...cambios };

      await this.validar(tx, unido, id);
      if (anterior.activo && dto.phoneNumberId && dto.phoneNumberId !== anterior.phoneNumberId) throw new ConflictException('Desactiva el canal antes de cambiar el Phone Number ID');
      if (anterior.activo && dto.asesorId && dto.asesorId !== anterior.asesorId) throw new ConflictException('Desactiva el canal antes de cambiar de asesor');
      const canal = await tx.canalWhatsapp.update({ where: { id }, data: { ...cambios, fechaBaja: dto.activo === false ? new Date() : dto.activo === true ? null : undefined } });
      await tx.auditoria.create({ data: { usuarioId: usuario.id, accion: canal.activo ? 'EDITAR_CANAL' : 'DESACTIVAR_CANAL', entidad: 'canales_whatsapp', entidadId: String(id), datos: { anterior: { activo: anterior.activo, asesorId: anterior.asesorId, phoneNumberId: anterior.phoneNumberId }, nuevo: { activo: canal.activo, asesorId: canal.asesorId, phoneNumberId: canal.phoneNumberId } } } });
      return canal;
    });
  }
  private async validar(tx: Prisma.TransactionClient, canal: { tipo: TipoCanalWhatsapp; asesorId?: number | null; activo?: boolean; numeroVisible?: string | null; phoneNumberId?: string | null; estadoIntegracion?: EstadoIntegracion }, id?: number) {
    if (canal.tipo === 'REPARTIDOR' && canal.asesorId)
      throw new BadRequestException('El repartidor no lleva asesor');

    if (canal.tipo === 'ASESOR' && canal.activo && !canal.asesorId)
      throw new BadRequestException('Asocia un asesor antes de activar el canal');

    console.log(JSON.stringify({
      evento: 'debug_validar_canal',
      id,
      tipo: canal.tipo,
      activo: canal.activo,
      tieneNumeroVisible: Boolean(canal.numeroVisible),
      tienePhoneNumberId: Boolean(canal.phoneNumberId),
      estadoIntegracion: canal.estadoIntegracion,
      fallaNumeroVisible: !canal.numeroVisible,
      fallaPhoneNumberId: !canal.phoneNumberId,
      fallaEstadoIntegracion: canal.estadoIntegracion !== 'ACTIVO'
    }));

    if (
      canal.activo &&
      (
        !canal.numeroVisible ||
        !canal.phoneNumberId ||
        canal.estadoIntegracion !== 'ACTIVO'
      )
    )
      throw new BadRequestException(
        'Configura número, Phone Number ID y estado ACTIVO antes de activar'
      );
  }
}

@Controller('configuracion-whatsapp')
export class ConfiguracionWhatsappController {
  constructor(private readonly db: BaseDatos) {}
  @Get() @Roles('ADMIN', 'SUPERVISOR')
  obtener() { return this.db.configuracionWhatsapp.findUnique({ where: { id: 1 } }); }
  @Patch() @Roles('ADMIN')
  async editar(@Body() dto: ConfiguracionDto, @UsuarioActual() usuario: UsuarioSesion) {
    const config = await this.db.configuracionWhatsapp.upsert({ where: { id: 1 }, create: { id: 1, ...dto }, update: dto });
    await this.db.auditoria.create({ data: { usuarioId: usuario.id, accion: 'CONFIGURAR_WHATSAPP', entidad: 'configuracion_whatsapp', entidadId: '1', datos: { nombrePlantillaInicio: config.nombrePlantillaInicio, idiomaPlantillaInicio: config.idiomaPlantillaInicio } } });
    return config;
  }
}

@Controller('solicitudes-reparto')
export class SolicitudesRepartoController {
  constructor(private readonly db: BaseDatos, private readonly operacion: ServicioOperacionV2, private readonly reparto: ServicioReparto, private readonly tiempoReal: TiempoReal) {}
  private filtro(usuario: UsuarioSesion): Prisma.SolicitudRepartoWhereInput {
    return usuario.rol === 'ASESOR' ? { asesor: { usuarioId: usuario.id } } : {};
  }
  @Get() @Roles('ADMIN', 'SUPERVISOR', 'ASESOR')
  listar(@UsuarioActual() usuario: UsuarioSesion, @Query('asesorId') asesorId?: string, @Query('estado') estado?: EstadoSolicitudReparto, @Query('cliente') cliente?: string, @Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    const filtros: Prisma.SolicitudRepartoWhereInput = { ...this.filtro(usuario) };
    if (asesorId && usuario.rol !== 'ASESOR') { const id = Number(asesorId); if (!Number.isInteger(id)) throw new BadRequestException('asesorId inválido'); filtros.asesorId = id; }
    if (estado) { if (!Object.values(EstadoSolicitudReparto).includes(estado)) throw new BadRequestException('Estado inválido'); filtros.estado = estado; }
    if (cliente) filtros.OR = [{ contacto: { nombre: { contains: cliente, mode: 'insensitive' } } }, { contacto: { telefono: { contains: cliente } } }];
    if (desde || hasta) { const inicio = desde ? new Date(desde) : undefined; const fin = hasta ? new Date(hasta) : undefined; if ((inicio && isNaN(inicio.getTime())) || (fin && isNaN(fin.getTime()))) throw new BadRequestException('Fecha inválida'); filtros.fechaRecepcion = { gte: inicio, lte: fin }; }
    return this.db.solicitudReparto.findMany({ where: filtros, include: { contacto: true, canalOrigen: true, canalAsesor: true, asesor: { include: { usuario: { select: { nombre: true, apellido: true } } } } }, orderBy: { fechaRecepcion: 'desc' }, take: 200 });
  }
  @Get(':id') @Roles('ADMIN', 'SUPERVISOR', 'ASESOR')
  async obtener(@Param('id', ParseIntPipe) id: number, @UsuarioActual() usuario: UsuarioSesion) {
    const solicitud = await this.db.solicitudReparto.findFirst({ where: { id, ...this.filtro(usuario) }, include: { contacto: true, canalOrigen: true, canalAsesor: true, asesor: { include: { usuario: { select: { nombre: true, apellido: true } } } }, conversaciones: { include: { canal: true }, orderBy: { fechaInicio: 'asc' } }, asignaciones: { orderBy: { fechaCreacion: 'asc' } } } });
    if (!solicitud) throw new NotFoundException('Solicitud inexistente');
    return solicitud;
  }
  @Post(':id/iniciar') @Roles('ADMIN', 'SUPERVISOR', 'ASESOR')
  async iniciar(@Param('id', ParseIntPipe) id: number, @UsuarioActual() usuario: UsuarioSesion) { return this.operacion.iniciarAtencion(id, usuario); }
  @Post(':id/repartir') @Roles('ADMIN', 'SUPERVISOR')
  async repartir(@Param('id', ParseIntPipe) id: number, @UsuarioActual() usuario: UsuarioSesion) {
    const pendiente = await this.db.solicitudReparto.findUnique({ where: { id }, select: { estado: true } });
    if (!pendiente) throw new NotFoundException('Solicitud inexistente');
    if (pendiente.estado !== 'NUEVA') throw new ConflictException('La solicitud ya fue asignada');
    const asesorId = await this.reparto.asignarSolicitud(id);
    if (asesorId) {
      const asesor = await this.db.asesor.findUniqueOrThrow({ where: { id: asesorId } });
      await this.db.auditoria.create({ data: { usuarioId: usuario.id, accion: 'REPARTIR_PENDIENTE', entidad: 'solicitudes_reparto', entidadId: String(id) } });
      this.tiempoReal.publicar({ tipo: 'solicitud:asignada', solicitudId: id, asesorUsuarios: [asesor.usuarioId] });
    }
    return this.obtener(id, usuario);
  }
  @Post(':id/reasignar') @Roles('ADMIN', 'SUPERVISOR')
  async reasignar(@Param('id', ParseIntPipe) id: number, @Body() dto: ReasignarDto, @UsuarioActual() usuario: UsuarioSesion) {
    const notificacion = await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM solicitudes_reparto WHERE id = ${id} FOR UPDATE`;
      const anterior = await tx.solicitudReparto.findUnique({ where: { id }, include: { asesor: true } });
      if (!anterior) throw new NotFoundException('Solicitud inexistente');
      if (['CERRADA', 'CANCELADA'].includes(anterior.estado)) throw new ConflictException('Solicitud cerrada');
      if (anterior.asesorId === dto.asesorId) throw new ConflictException('Ya está asignada a ese asesor');
      const destino = await tx.asesor.findFirst({ where: { id: dto.asesorId, activoReparto: true, disponible: true, usuario: { activo: true, rol: 'ASESOR' }, canales: { some: { tipo: 'ASESOR', activo: true, estadoIntegracion: 'ACTIVO' } } }, include: { canales: { where: { tipo: 'ASESOR', activo: true, estadoIntegracion: 'ACTIVO' }, take: 1 } } });
      if (!destino?.canales[0]) throw new BadRequestException('Asesor sin canal operativo o no disponible');
      await tx.conversacion.updateMany({ where: { solicitudRepartoId: id, estado: { not: 'CERRADA' } }, data: { estado: 'CERRADA', fechaCierre: new Date() } });
      await tx.solicitudReparto.update({ where: { id }, data: { asesorId: dto.asesorId, canalAsesorId: destino.canales[0].id, estado: 'ASIGNADA', fechaAsignacion: new Date(), fechaPrimerContacto: null } });
      await tx.asignacionSolicitud.create({ data: { solicitudId: id, asesorId: dto.asesorId, tipo: anterior.asesorId ? 'REASIGNACION' : 'MANUAL', asignadoPorUsuarioId: usuario.id, motivo: dto.motivo } });
      await tx.asesor.update({ where: { id: dto.asesorId }, data: { contadorReparto: { increment: 1 }, totalAsignaciones: { increment: 1 } } });
      await tx.auditoria.create({ data: { usuarioId: usuario.id, accion: 'REASIGNAR_SOLICITUD', entidad: 'solicitudes_reparto', entidadId: String(id), datos: { anterior: anterior.asesorId, nuevo: dto.asesorId, motivo: dto.motivo } } });
      return [anterior.asesor?.usuarioId, destino.usuarioId].filter((n): n is number => n !== null && n !== undefined);
    });
    this.tiempoReal.publicar({ tipo: 'solicitud:reasignada', solicitudId: id, asesorUsuarios: notificacion });
    return this.obtener(id, usuario);
  }
}
