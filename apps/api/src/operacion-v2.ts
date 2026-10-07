import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CanalWhatsapp, Contacto, EstadoSolicitudReparto, Prisma, TipoMensaje } from '@prisma/client';
import { BaseDatos } from './base-datos';
import { ServicioReparto } from './reparto';
import { TiempoReal } from './tiempo-real';
import { PROVEEDOR_WHATSAPP, ProveedorWhatsApp } from './proveedor-whatsapp';
import { normalizarTelefono } from './telefonos';
import { UsuarioSesion } from './auth';
import { confirmarSalida } from './mensajes-envio';
import { Configuracion } from './config';
import { canalOperativo, filtroCanalOperativo, repartidorOperativo } from './canales-operativos';

type Tx = Prisma.TransactionClient;

export interface MensajeCanal {
  idExterno: string;
  phoneNumberId: string;
  waId: string;
  telefono: string;
  nombre?: string;
  tipo: TipoMensaje;
  contenido: string;
  opcionId?: string;
  fechaWhatsapp?: string;
}
export interface EcoCanal {
  idExterno: string;
  phoneNumberId: string;
  destinatario: string;
  tipo: TipoMensaje;
  contenido: string;
  fechaWhatsapp?: string;
}

interface ResultadoEvento {
  conversacionId?: number;
  solicitudId?: number;
  asesorUsuarioId?: number;
  salida?: { mensajeId: number; waId: string; texto: string; phoneNumberId: string };
}

@Injectable()
export class ServicioOperacionV2 {
  constructor(
    private readonly db: BaseDatos,
    private readonly reparto: ServicioReparto,
    private readonly tiempoReal: TiempoReal,
    @Inject(PROVEEDOR_WHATSAPP) private readonly proveedor: ProveedorWhatsApp,
    @Inject('CONFIG') private readonly config: Configuracion,
  ) {}

  private async contacto(tx: Tx, telefono: string, nombre?: string): Promise<Contacto> {
    const normalizado = normalizarTelefono(telefono);
    const variantes = [...new Set([normalizado, `+${normalizado}`, telefono.trim(), ...(normalizado.startsWith('51') && normalizado.length === 11 ? [normalizado.slice(2)] : [])])];
    const encontrado = await tx.contacto.findFirst({ where: { OR: [{ telefono: { in: variantes } }, { waId: { in: variantes } }] } });
    if (encontrado) return nombre && nombre !== encontrado.nombre
      ? tx.contacto.update({ where: { id: encontrado.id }, data: { nombre } }) : encontrado;
    return tx.contacto.create({ data: { telefono: normalizado, waId: normalizado, nombre } });
  }

  private async bloquearContacto(tx: Tx, contactoId: number) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(42018, CAST(${contactoId} AS integer))::text`;
  }

  private async marcarProcesado(tx: Tx, idExterno: string) {
    await tx.eventoWhatsapp.update({ where: { identificadorExterno: idExterno }, data: { estado: 'PROCESADO' } });
  }

  private async solicitudVigente(tx: Tx, contactoId: number, canalAsesorId: number, asesorId: number) {
    return tx.solicitudReparto.findFirst({ where: { contactoId, canalAsesorId, asesorId, estado: { in: ['ASIGNADA', 'CONTACTO_INICIADO', 'EN_ATENCION'] } }, orderBy: { id: 'desc' } });
  }

  private async conversacionAsesor(tx: Tx, contactoId: number, canal: CanalWhatsapp, fechaCliente?: Date) {
    let conversacion = await tx.conversacion.findFirst({ where: { contactoId, canalId: canal.id, estado: { not: 'CERRADA' } }, orderBy: { id: 'desc' } });
    const solicitud = canal.asesorId ? await this.solicitudVigente(tx, contactoId, canal.id, canal.asesorId) : null;
    if (!conversacion) conversacion = await tx.conversacion.create({ data: {
      contactoId, canalId: canal.id, asesorId: canal.asesorId, solicitudRepartoId: solicitud?.id,
      estado: 'ABIERTA', fechaUltimoCliente: fechaCliente,
    } });
    else if (solicitud && !conversacion.solicitudRepartoId) {
      conversacion = await tx.conversacion.update({ where: { id: conversacion.id }, data: { solicitudRepartoId: solicitud.id } });
    }
    return { conversacion, solicitud };
  }

  private async actualizarSolicitudPorContacto(tx: Tx, solicitudId: number, estado: EstadoSolicitudReparto, fechaPrimerContacto?: Date) {
    await tx.solicitudReparto.update({ where: { id: solicitudId }, data: { estado, ...(fechaPrimerContacto ? { fechaPrimerContacto } : {}) } });
  }

  async procesarMensaje(idExterno: string, entrada: MensajeCanal): Promise<void> {
    const resultado = await this.db.$transaction(async (tx: Tx): Promise<ResultadoEvento> => {
      await tx.$queryRaw`SELECT id FROM eventos_whatsapp WHERE identificador_externo = ${idExterno} FOR UPDATE`;
      const evento = await tx.eventoWhatsapp.findUniqueOrThrow({ where: { identificadorExterno: idExterno } });
      if (evento.estado === 'PROCESADO') return {};
      const canal = await tx.canalWhatsapp.findUnique({ where: { phoneNumberId: entrada.phoneNumberId } });
      if (!canal || !(canal.tipo === 'REPARTIDOR' ? repartidorOperativo(canal, this.config.whatsappMode) : canalOperativo(canal, this.config.whatsappMode))) {
        await this.marcarProcesado(tx, idExterno);
        return {};
      }
      const contacto = await this.contacto(tx, entrada.telefono, entrada.nombre);
      await this.bloquearContacto(tx, contacto.id);
      const duplicado = await tx.mensaje.findUnique({ where: { idExternoWhatsapp: entrada.idExterno } });
      if (duplicado) { await this.marcarProcesado(tx, idExterno); return {}; }
      const fecha = entrada.fechaWhatsapp ? new Date(entrada.fechaWhatsapp) : new Date();
      if (canal.tipo === 'REPARTIDOR') {
        let solicitud = await tx.solicitudReparto.findFirst({ where: { contactoId: contacto.id, canalOrigenId: canal.id, estado: { notIn: ['CERRADA', 'CANCELADA'] } } });
        let conversacion = await tx.conversacion.findFirst({ where: { contactoId: contacto.id, canalId: canal.id, estado: { not: 'CERRADA' }, solicitudRepartoId: solicitud?.id || null } });
        if (!conversacion && solicitud) conversacion = await tx.conversacion.findFirst({ where: { contactoId: contacto.id, canalId: canal.id, estado: { not: 'CERRADA' }, solicitudRepartoId: null } });
        if (!conversacion) {
          const anterior = await tx.conversacion.findFirst({ where: { contactoId: contacto.id, canalId: canal.id, estado: { not: 'CERRADA' } } });
          if (anterior) await tx.conversacion.update({ where: { id: anterior.id }, data: { estado: 'CERRADA', fechaCierre: new Date() } });
        }
        if (!conversacion) conversacion = await tx.conversacion.create({ data: { contactoId: contacto.id, canalId: canal.id, estado: 'ABIERTA', fechaUltimoCliente: fecha } });
        await tx.mensaje.create({ data: { conversacionId: conversacion.id, idExternoWhatsapp: entrada.idExterno, direccion: 'ENTRANTE', origen: 'CLIENTE', tipo: entrada.tipo, contenido: entrada.contenido, fechaWhatsapp: fecha } });
        await tx.conversacion.update({ where: { id: conversacion.id }, data: { fechaUltimoMensaje: new Date(), fechaUltimoCliente: fecha } });
        if (solicitud) {
          if (conversacion.solicitudRepartoId !== solicitud.id) await tx.conversacion.update({ where: { id: conversacion.id }, data: { solicitudRepartoId: solicitud.id } });
          await this.marcarProcesado(tx, idExterno);
          return { conversacionId: conversacion.id, solicitudId: solicitud.id };
        }
        const clave = (entrada.opcionId || entrada.contenido).trim();
        const opcion = clave ? await tx.opcionWhatsapp.findFirst({ where: { activo: true, grupo: { activo: true }, OR: [{ identificadorExterno: clave }, { titulo: { equals: clave, mode: 'insensitive' } }] } }) : null;
        solicitud = await tx.solicitudReparto.create({ data: { contactoId: contacto.id, canalOrigenId: canal.id, grupoId: opcion?.grupoId, idExternoOrigen: entrada.idExterno, contenidoInicial: entrada.contenido, fechaRecepcion: fecha } });
        await tx.conversacion.update({ where: { id: conversacion.id }, data: { solicitudRepartoId: solicitud.id } });
        const asesorId = await this.reparto.asignarSolicitudEnTransaccion(tx, solicitud.id);
        const configuracion = await tx.configuracionWhatsapp.findUnique({ where: { id: 1 } });
        const texto = configuracion?.mensajeEspera || 'En un momento lo atendemos.';
        const mensaje = await tx.mensaje.create({ data: { conversacionId: conversacion.id, direccion: 'SALIENTE', origen: 'SISTEMA', tipo: 'TEXTO', contenido: texto, estadoEnvio: 'PENDIENTE' } });
        const asesor = asesorId ? await tx.asesor.findUnique({ where: { id: asesorId } }) : null;
        await this.marcarProcesado(tx, idExterno);
        return { conversacionId: conversacion.id, solicitudId: solicitud.id, asesorUsuarioId: asesor?.usuarioId, salida: { mensajeId: mensaje.id, waId: normalizarTelefono(contacto.waId), texto, phoneNumberId: canal.phoneNumberId! } };
      }
      if (!canal.asesorId) { await this.marcarProcesado(tx, idExterno); return {}; }
      const { conversacion, solicitud } = await this.conversacionAsesor(tx, contacto.id, canal, fecha);
      await tx.mensaje.create({ data: { conversacionId: conversacion.id, idExternoWhatsapp: entrada.idExterno, direccion: 'ENTRANTE', origen: 'CLIENTE', tipo: entrada.tipo, contenido: entrada.contenido, fechaWhatsapp: fecha } });
      await tx.conversacion.update({ where: { id: conversacion.id }, data: { fechaUltimoMensaje: new Date(), fechaUltimoCliente: fecha } });
      if (solicitud && ['ASIGNADA', 'CONTACTO_INICIADO'].includes(solicitud.estado)) await this.actualizarSolicitudPorContacto(tx, solicitud.id, 'EN_ATENCION');
      await this.marcarProcesado(tx, idExterno);
      const asesor = await tx.asesor.findUnique({ where: { id: canal.asesorId } });
      return { conversacionId: conversacion.id, solicitudId: solicitud?.id, asesorUsuarioId: asesor?.usuarioId };
    }, { maxWait: 60000, timeout: 60000 });
    if (resultado.salida) {
      const salida = resultado.salida;
      try {
        const externo = await this.proveedor.enviarTexto(salida.waId, salida.texto, salida.phoneNumberId);
        await confirmarSalida(this.db, salida.mensajeId, externo);
      } catch (error) {
        await this.db.mensaje.update({ where: { id: salida.mensajeId }, data: { estadoEnvio: 'FALLIDO' } });
        console.error(JSON.stringify({ evento: 'aviso_repartidor_fallido', mensajeId: salida.mensajeId, error: error instanceof Error ? error.message : 'Error del proveedor' }));
      }
    }
    if (resultado.conversacionId || resultado.solicitudId) this.tiempoReal.publicar({ tipo: 'conversacion:actualizada', conversacionId: resultado.conversacionId, solicitudId: resultado.solicitudId, asesorUsuarios: resultado.asesorUsuarioId ? [resultado.asesorUsuarioId] : [] });
  }

  async procesarEco(idExterno: string, eco: EcoCanal): Promise<void> {
    const resultado = await this.db.$transaction(async (tx: Tx): Promise<ResultadoEvento> => {
      await tx.$queryRaw`SELECT id FROM eventos_whatsapp WHERE identificador_externo = ${idExterno} FOR UPDATE`;
      const evento = await tx.eventoWhatsapp.findUniqueOrThrow({ where: { identificadorExterno: idExterno } });
      if (evento.estado === 'PROCESADO') return {};
      const canal = await tx.canalWhatsapp.findUnique({ where: { phoneNumberId: eco.phoneNumberId } });
      if (!canalOperativo(canal, this.config.whatsappMode) || !canal.modoCoexistencia) { await this.marcarProcesado(tx, idExterno); return {}; }
      const contacto = await this.contacto(tx, eco.destinatario);
      await this.bloquearContacto(tx, contacto.id);
      if (await tx.mensaje.findUnique({ where: { idExternoWhatsapp: eco.idExterno } })) { await this.marcarProcesado(tx, idExterno); return {}; }
      const { conversacion, solicitud } = await this.conversacionAsesor(tx, contacto.id, canal);
      const fecha = eco.fechaWhatsapp ? new Date(eco.fechaWhatsapp) : new Date();
      await tx.mensaje.create({ data: { conversacionId: conversacion.id, idExternoWhatsapp: eco.idExterno, direccion: 'SALIENTE', origen: 'WHATSAPP_BUSINESS_APP', tipo: eco.tipo, contenido: eco.contenido, estadoEnvio: 'ENVIADO', fechaWhatsapp: fecha } });
      await tx.conversacion.update({ where: { id: conversacion.id }, data: { fechaUltimoMensaje: new Date() } });
      if (solicitud && !solicitud.fechaPrimerContacto) await this.actualizarSolicitudPorContacto(tx, solicitud.id, 'CONTACTO_INICIADO', fecha);
      await this.marcarProcesado(tx, idExterno);
      const asesor = await tx.asesor.findUnique({ where: { id: canal.asesorId } });
      return { conversacionId: conversacion.id, solicitudId: solicitud?.id, asesorUsuarioId: asesor?.usuarioId };
    }, { timeout: 20000 });
    if (resultado.conversacionId) this.tiempoReal.publicar({ tipo: 'mensaje:nuevo', conversacionId: resultado.conversacionId, solicitudId: resultado.solicitudId, asesorUsuarios: resultado.asesorUsuarioId ? [resultado.asesorUsuarioId] : [] });
  }

  async iniciarAtencion(solicitudId: number, usuario: UsuarioSesion) {
    const preparacion = await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM solicitudes_reparto WHERE id = ${solicitudId} FOR UPDATE`;
      const solicitud = await tx.solicitudReparto.findUnique({ where: { id: solicitudId }, include: { contacto: true, asesor: { include: { usuario: true } }, canalAsesor: true, conversaciones: { where: { estado: { not: 'CERRADA' } } } } });
      if (!solicitud) throw new NotFoundException('Solicitud inexistente');
      if (usuario.rol === 'ASESOR' && solicitud.asesor?.usuarioId !== usuario.id) throw new ForbiddenException('Solicitud ajena');
      if (!['ASESOR', 'ADMIN', 'SUPERVISOR'].includes(usuario.rol)) throw new ForbiddenException();
      if (solicitud.estado !== 'ASIGNADA') throw new ConflictException('La atención ya se inició o la solicitud no está asignada');
      const canal = solicitud.asesorId ? await tx.canalWhatsapp.findFirst({ where: { ...filtroCanalOperativo(this.config.whatsappMode), asesorId: solicitud.asesorId } }) : null;
      if (!canalOperativo(canal, this.config.whatsappMode) || canal.asesorId !== solicitud.asesorId)
        throw new ConflictException(`El asesor ${solicitud.asesor?.usuario.nombre || 'asignado'} no tiene un canal WhatsApp ${this.config.whatsappMode === 'meta' ? 'Meta' : 'demo'} activo.`);
      if (solicitud.canalAsesorId !== canal.id) await tx.solicitudReparto.update({ where: { id: solicitud.id }, data: { canalAsesorId: canal.id } });
      const configuracion = await tx.configuracionWhatsapp.findUnique({ where: { id: 1 } });
      if (!configuracion?.nombrePlantillaInicio) throw new ConflictException('Configura una plantilla de inicio aprobada antes de atender');
      let conversacion = solicitud.conversaciones.find(item => item.canalId === canal.id) || null;
      if (!conversacion) {
        conversacion = await tx.conversacion.findFirst({ where: { contactoId: solicitud.contactoId, canalId: canal.id, estado: { not: 'CERRADA' } } });
        if (conversacion && conversacion.solicitudRepartoId) throw new ConflictException('Existe otra solicitud en ese hilo');
        if (conversacion) conversacion = await tx.conversacion.update({ where: { id: conversacion.id }, data: { solicitudRepartoId: solicitud.id } });
        else conversacion = await tx.conversacion.create({ data: { contactoId: solicitud.contactoId, canalId: canal.id, asesorId: solicitud.asesorId, solicitudRepartoId: solicitud.id, estado: 'ABIERTA' } });
      }
      const parametros = [solicitud.contacto.nombre || 'cliente', `${solicitud.asesor?.usuario.nombre || 'Asesor'} ${solicitud.asesor?.usuario.apellido || ''}`.trim()];
      const mensaje = await tx.mensaje.create({ data: { conversacionId: conversacion.id, direccion: 'SALIENTE', origen: 'NEXO', tipo: 'PLANTILLA', contenido: `${configuracion.nombrePlantillaInicio} (${parametros.join(', ')})`, estadoEnvio: 'PENDIENTE' } });
      await tx.solicitudReparto.update({ where: { id: solicitud.id }, data: { estado: 'CONTACTO_INICIADO', fechaPrimerContacto: new Date() } });
      await tx.auditoria.create({ data: { usuarioId: usuario.id, accion: 'INICIAR_ATENCION', entidad: 'solicitudes_reparto', entidadId: String(solicitud.id), datos: { canalId: canal.id, mensajeId: mensaje.id } } });
      return { mensajeId: mensaje.id, conversacionId: conversacion.id, canalId: canal.id, phoneNumberId: canal.phoneNumberId, waId: normalizarTelefono(solicitud.contacto.waId), nombre: configuracion.nombrePlantillaInicio, idioma: configuracion.idiomaPlantillaInicio, parametros, asesorUsuarioId: solicitud.asesor!.usuarioId };
    });
    try {
      const externo = await this.proveedor.enviarPlantilla(preparacion.waId, preparacion.phoneNumberId, preparacion.nombre, preparacion.idioma, preparacion.parametros);
      await confirmarSalida(this.db, preparacion.mensajeId, externo);
      this.tiempoReal.publicar({ tipo: 'conversacion:asignada', conversacionId: preparacion.conversacionId, solicitudId, asesorUsuarios: [preparacion.asesorUsuarioId] });
      return { conversacionId: preparacion.conversacionId, mensajeId: preparacion.mensajeId };
    } catch (error) {
      await this.db.$transaction(async tx => {
        await tx.mensaje.update({ where: { id: preparacion.mensajeId }, data: { estadoEnvio: 'FALLIDO' } });
        await tx.solicitudReparto.update({ where: { id: solicitudId }, data: { estado: 'ASIGNADA', fechaPrimerContacto: null } });
        await tx.auditoria.create({ data: { usuarioId: usuario.id, accion: 'ENVIO_PLANTILLA_FALLIDO', entidad: 'solicitudes_reparto', entidadId: String(solicitudId), datos: { canalId: preparacion.canalId, mensajeId: preparacion.mensajeId } } });
      });
      throw new BadRequestException(`No se pudo enviar la plantilla: ${error instanceof Error ? error.message : 'error del proveedor'}`);
    }
  }
}
