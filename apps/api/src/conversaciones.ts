import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BaseDatos } from './base-datos';
import { UsuarioSesion } from './auth';
import { ServicioReparto } from './reparto';
import { TiempoReal } from './tiempo-real';
import { PROVEEDOR_WHATSAPP, ProveedorWhatsApp } from './proveedor-whatsapp';
import { Inject } from '@nestjs/common';

@Injectable()
export class ServicioConversaciones {
  constructor(private readonly db: BaseDatos, private readonly reparto: ServicioReparto, private readonly tiempoReal: TiempoReal, @Inject(PROVEEDOR_WHATSAPP) private readonly proveedor: ProveedorWhatsApp) {}

  private filtro(usuario: UsuarioSesion) {
    if (usuario.rol === 'ASESOR') return { asesor: { usuarioId: usuario.id } };
    if (usuario.rol === 'ADMIN' || usuario.rol === 'SUPERVISOR') return {};
    throw new ForbiddenException('Sin permisos para conversaciones');
  }

  async listar(usuario: UsuarioSesion) {
    return this.db.conversacion.findMany({ where: this.filtro(usuario), include: { contacto: true, grupo: true, asesor: { include: { usuario: { select: { nombre: true, apellido: true } } } }, mensajes: { orderBy: { fechaCreacion: 'desc' }, take: 1 } }, orderBy: { fechaUltimoMensaje: 'desc' }, take: 100 });
  }

  async obtener(id: number, usuario: UsuarioSesion) {
    const conversacion = await this.db.conversacion.findFirst({ where: { id, ...this.filtro(usuario) }, include: { contacto: true, grupo: true, asesor: { include: { usuario: { select: { nombre: true, apellido: true } } } }, mensajes: { orderBy: [{ fechaCreacion: 'asc' }, { id: 'asc' }] }, asignaciones: { orderBy: { fechaCreacion: 'asc' } } } });
    if (!conversacion) throw new NotFoundException('Conversación inexistente');
    return conversacion;
  }

  async responder(id: number, contenido: string, usuario: UsuarioSesion) {
    if (usuario.rol !== 'ASESOR') throw new ForbiddenException('Solo el asesor asignado puede responder');
    if (!contenido.trim() || contenido.length > 4096) throw new BadRequestException('Mensaje inválido');
    const { mensaje, waId } = await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM conversaciones WHERE id = ${id} FOR UPDATE`;
      const actual = await tx.conversacion.findFirst({ where: { id, estado: 'ABIERTA', asesor: { usuarioId: usuario.id } }, include: { contacto: true } });
      if (!actual) throw new NotFoundException('Conversación abierta no disponible');
      const mensaje = await tx.mensaje.create({ data: { conversacionId: id, direccion: 'SALIENTE', tipo: 'TEXTO', contenido: contenido.trim(), estadoEnvio: 'PENDIENTE' } });
      await tx.conversacion.update({ where: { id }, data: { fechaUltimoMensaje: new Date() } });
      return { mensaje, waId: actual.contacto.waId };
    });
    this.tiempoReal.publicar({ tipo: 'mensaje:nuevo', conversacionId: id, asesorUsuarios: [usuario.id] });
    try {
      const externo = await this.proveedor.enviarTexto(waId, mensaje.contenido);
      const enviado = await this.db.mensaje.update({ where: { id: mensaje.id }, data: { estadoEnvio: 'ENVIADO', idExternoWhatsapp: externo } });
      this.tiempoReal.publicar({ tipo: 'mensaje:estado', conversacionId: id, asesorUsuarios: [usuario.id] });
      return enviado;
    } catch (error) {
      await this.db.mensaje.update({ where: { id: mensaje.id }, data: { estadoEnvio: 'FALLIDO' } });
      this.tiempoReal.publicar({ tipo: 'mensaje:estado', conversacionId: id, asesorUsuarios: [usuario.id] });
      throw new BadRequestException(`No se pudo enviar el mensaje: ${error instanceof Error ? error.message : 'error del proveedor'}`);
    }
  }

  async cerrar(id: number, usuario: UsuarioSesion) {
    const { cerrada, asesorUsuarioId } = await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM conversaciones WHERE id = ${id} FOR UPDATE`;
      const actual = await tx.conversacion.findUnique({ where: { id }, include: { asesor: true } });
      if (!actual) throw new NotFoundException('Conversación inexistente');
      if (usuario.rol === 'ASESOR' && (actual.asesor?.usuarioId !== usuario.id || actual.estado !== 'ABIERTA')) throw new ForbiddenException('No puedes cerrar esta conversación');
      if (actual.estado === 'CERRADA') return { cerrada: actual, asesorUsuarioId: actual.asesor?.usuarioId };
      const cerrada = await tx.conversacion.update({ where: { id }, data: { estado: 'CERRADA', fechaCierre: new Date() } });
      await tx.auditoria.create({ data: { usuarioId: usuario.id, accion: 'CERRAR', entidad: 'conversaciones', entidadId: String(id) } });
      return { cerrada, asesorUsuarioId: actual.asesor?.usuarioId };
    });
    this.tiempoReal.publicar({ tipo: 'conversacion:actualizada', conversacionId: id, asesorUsuarios: asesorUsuarioId ? [asesorUsuarioId] : [] });
    return cerrada;
  }

  async reasignar(id: number, asesorId: number, motivo: string, usuario: UsuarioSesion) {
    if (!['ADMIN', 'SUPERVISOR'].includes(usuario.rol)) throw new ForbiddenException();
    const resultado = await this.db.$transaction(async tx => {
      const previa = await tx.conversacion.findUnique({ where: { id } });
      if (!previa?.grupoId) throw new NotFoundException('Conversación operativa inexistente');
      await this.reparto.bloquearGrupo(tx, previa.grupoId);
      await tx.$queryRaw`SELECT id FROM conversaciones WHERE id = ${id} FOR UPDATE`;
      const actual = await tx.conversacion.findUnique({ where: { id }, include: { asesor: true } });
      if (!actual || actual.grupoId !== previa.grupoId || actual.estado === 'CERRADA') throw new ConflictException('La conversación cambió de estado');
      const destino = await tx.asesor.findFirst({ where: { id: asesorId, grupoId: actual.grupoId, activoReparto: true, usuario: { activo: true } } });
      if (!destino) throw new BadRequestException('El asesor debe estar activo y pertenecer al grupo');
      if (actual.asesorId === asesorId) throw new ConflictException('Ya está asignada a este asesor');
      await tx.conversacion.update({ where: { id }, data: { asesorId, estado: 'ABIERTA' } });
      await tx.asignacion.create({ data: { conversacionId: id, asesorId, grupoId: actual.grupoId, tipo: actual.asesorId ? 'REASIGNACION' : 'MANUAL', asignadoPorUsuarioId: usuario.id, motivo: motivo.trim() || null } });
      await tx.asesor.update({ where: { id: asesorId }, data: { contadorReparto: { increment: 1 }, totalAsignaciones: { increment: 1 } } });
      await tx.auditoria.create({ data: { usuarioId: usuario.id, accion: 'REASIGNAR', entidad: 'conversaciones', entidadId: String(id), datos: { anterior: actual.asesorId, nuevo: asesorId, motivo } } });
      return { anterior: actual.asesor?.usuarioId, destinoUsuario: (await tx.asesor.findUniqueOrThrow({ where: { id: asesorId } })).usuarioId };
    });
    this.tiempoReal.publicar({ tipo: 'conversacion:reasignada', conversacionId: id, asesorUsuarios: [resultado.anterior, resultado.destinoUsuario].filter((v): v is number => typeof v === 'number') });
    return this.obtener(id, usuario);
  }

  async repartirPendiente(id: number, usuario: UsuarioSesion) {
    if (!['ADMIN', 'SUPERVISOR'].includes(usuario.rol)) throw new ForbiddenException();
    const conversacion = await this.obtener(id, usuario);
    if (conversacion.estado !== 'PENDIENTE_ASIGNACION' || !conversacion.grupoId) throw new ConflictException('No está pendiente de asignación');
    const asesorId = await this.reparto.asignarConversacion(conversacion.grupoId, id);
    if (asesorId) {
      const asesor = await this.db.asesor.findUniqueOrThrow({ where: { id: asesorId } });
      await this.db.auditoria.create({ data: { usuarioId: usuario.id, accion: 'REPARTIR_PENDIENTE', entidad: 'conversaciones', entidadId: String(id) } });
      this.tiempoReal.publicar({ tipo: 'conversacion:asignada', conversacionId: id, asesorUsuarios: [asesor.usuarioId] });
    }
    return this.obtener(id, usuario);
  }
}
