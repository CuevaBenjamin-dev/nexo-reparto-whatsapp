import { ConflictException, Injectable, Inject } from '@nestjs/common';
import { BaseDatos } from './base-datos';
import { ServicioReparto } from './reparto';
import { TiempoReal } from './tiempo-real';
import { PROVEEDOR_WHATSAPP, ProveedorWhatsApp, OpcionMenu } from './proveedor-whatsapp';
import { Prisma, TipoMensaje } from '@prisma/client';

export interface EntradaCliente { idExterno: string; waId: string; telefono: string; nombre?: string; tipo: 'TEXTO' | 'INTERACTIVO'; contenido: string; opcionId?: string; fechaWhatsapp?: string; }
interface SalidaPendiente { id: number; tipo: TipoMensaje; contenido: string; waId: string; }

@Injectable()
export class ServicioEntradas {
  constructor(private readonly db: BaseDatos, private readonly reparto: ServicioReparto, private readonly tiempoReal: TiempoReal, @Inject(PROVEEDOR_WHATSAPP) private readonly proveedor: ProveedorWhatsApp) {}

  async registrar(idExterno: string, tipo: string, payload: Prisma.InputJsonValue): Promise<void> {
    await this.db.eventoWhatsapp.upsert({ where: { identificadorExterno: idExterno }, create: { identificadorExterno: idExterno, tipo, payload }, update: {} });
  }

  async procesar(idExterno: string): Promise<void> {
    const resultado = await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM eventos_whatsapp WHERE identificador_externo = ${idExterno} FOR UPDATE`;
      const evento = await tx.eventoWhatsapp.findUniqueOrThrow({ where: { identificadorExterno: idExterno } });
      if (evento.estado === 'PROCESADO') return { salidas: [] as SalidaPendiente[], conversacionId: undefined as number | undefined, asesorUsuarioId: undefined as number | undefined };
      if (evento.tipo === 'estado') {
        const estado = evento.payload as unknown as { wamid: string; estado: string };
        const mapeo: Record<string, { nuevo: 'ENVIADO' | 'ENTREGADO' | 'LEIDO' | 'FALLIDO'; desde: Array<'PENDIENTE' | 'ENVIADO' | 'ENTREGADO'> }> = {
          sent: { nuevo: 'ENVIADO', desde: ['PENDIENTE', 'ENVIADO'] },
          delivered: { nuevo: 'ENTREGADO', desde: ['PENDIENTE', 'ENVIADO', 'ENTREGADO'] },
          read: { nuevo: 'LEIDO', desde: ['PENDIENTE', 'ENVIADO', 'ENTREGADO'] },
          failed: { nuevo: 'FALLIDO', desde: ['PENDIENTE', 'ENVIADO'] },
        };
        const cambio = mapeo[estado.estado];
        if (cambio) await tx.mensaje.updateMany({ where: { idExternoWhatsapp: estado.wamid, estadoEnvio: { in: cambio.desde } }, data: { estadoEnvio: cambio.nuevo } });
        await tx.eventoWhatsapp.update({ where: { id: evento.id }, data: { estado: 'PROCESADO' } });
        return { salidas: [] as SalidaPendiente[], conversacionId: undefined as number | undefined, asesorUsuarioId: undefined as number | undefined };
      }
      const entrada = evento.payload as unknown as EntradaCliente;
      if (!entrada.waId || !entrada.idExterno) throw new ConflictException('Evento de entrada inválido');
      const contacto = await tx.contacto.upsert({ where: { waId: entrada.waId }, create: { waId: entrada.waId, telefono: entrada.telefono, nombre: entrada.nombre }, update: entrada.nombre ? { nombre: entrada.nombre } : {} });
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(42018, CAST(${contacto.id} AS integer))::text`;
      let conversacion = await tx.conversacion.findFirst({ where: { contactoId: contacto.id, estado: { not: 'CERRADA' } }, orderBy: { id: 'desc' } });
      const nueva = !conversacion;
      if (!conversacion) conversacion = await tx.conversacion.create({ data: { contactoId: contacto.id } });
      const existente = await tx.mensaje.findUnique({ where: { idExternoWhatsapp: entrada.idExterno } });
      if (existente) {
        await tx.eventoWhatsapp.update({ where: { id: evento.id }, data: { estado: 'PROCESADO' } });
        return { salidas: [] as SalidaPendiente[], conversacionId: conversacion.id, asesorUsuarioId: undefined as number | undefined };
      }
      await tx.mensaje.create({ data: { conversacionId: conversacion.id, idExternoWhatsapp: entrada.idExterno, direccion: 'ENTRANTE', tipo: entrada.tipo, contenido: entrada.contenido, fechaWhatsapp: entrada.fechaWhatsapp ? new Date(entrada.fechaWhatsapp) : undefined } });
      await tx.conversacion.update({ where: { id: conversacion.id }, data: { fechaUltimoMensaje: new Date() } });
      const salidas: SalidaPendiente[] = [];
      const agregarSalida = async (tipo: TipoMensaje, contenido: string) => {
        const mensaje = await tx.mensaje.create({ data: { conversacionId: conversacion!.id, direccion: 'SALIENTE', tipo, contenido, estadoEnvio: 'PENDIENTE' } });
        salidas.push({ id: mensaje.id, tipo, contenido, waId: contacto.waId });
      };
      let asesorUsuarioId: number | undefined;
      if (conversacion.estado === 'ESPERANDO_OPCION') {
        const opcion = entrada.opcionId ? await tx.opcionWhatsapp.findFirst({ where: { identificadorExterno: entrada.opcionId, activo: true, grupo: { activo: true } } }) : null;
        if (opcion) {
          await tx.conversacion.update({ where: { id: conversacion.id }, data: { grupoId: opcion.grupoId, estado: 'PENDIENTE_ASIGNACION' } });
          const asesorId = await this.reparto.asignarEnTransaccion(tx, opcion.grupoId, conversacion.id);
          if (asesorId) {
            const asesor = await tx.asesor.findUniqueOrThrow({ where: { id: asesorId }, include: { usuario: true } });
            asesorUsuarioId = asesor.usuarioId;
            await agregarSalida('TEXTO', `Gracias. ${asesor.usuario.nombre} te atenderá en breve.`);
          } else await agregarSalida('TEXTO', 'Gracias. Hemos recibido tu consulta. Un asesor te atenderá en cuanto esté disponible.');
        } else {
          const opciones = await tx.opcionWhatsapp.findMany({ where: { activo: true, grupo: { activo: true } }, orderBy: [{ orden: 'asc' }, { id: 'asc' }], take: 10 });
          if (opciones.length) {
            const menu: OpcionMenu[] = opciones.map(o => ({ id: o.identificadorExterno, titulo: o.titulo, descripcion: o.descripcion }));
            await agregarSalida('INTERACTIVO', JSON.stringify(menu));
          } else await agregarSalida('TEXTO', 'Gracias por escribirnos. El menú de atención no está disponible en este momento.');
        }
      } else if (nueva) throw new Error('Estado inicial inesperado');
      if (!asesorUsuarioId && conversacion.asesorId) {
        const asesor = await tx.asesor.findUnique({ where: { id: conversacion.asesorId } });
        asesorUsuarioId = asesor?.usuarioId;
      }
      await tx.eventoWhatsapp.update({ where: { id: evento.id }, data: { estado: 'PROCESADO' } });
      return { salidas, conversacionId: conversacion.id, asesorUsuarioId };
    }, { timeout: 20000 });
    for (const salida of resultado.salidas) await this.enviarSalida(salida);
    if (resultado.conversacionId) this.tiempoReal.publicar({ tipo: 'conversacion:actualizada', conversacionId: resultado.conversacionId, asesorUsuarios: resultado.asesorUsuarioId ? [resultado.asesorUsuarioId] : [] });
  }

  async enviarSalida(salida: SalidaPendiente): Promise<void> {
    try {
      const idExterno = salida.tipo === 'INTERACTIVO'
        ? await this.proveedor.enviarMenu(salida.waId, JSON.parse(salida.contenido) as OpcionMenu[])
        : await this.proveedor.enviarTexto(salida.waId, salida.contenido);
      await this.db.mensaje.update({ where: { id: salida.id }, data: { idExternoWhatsapp: idExterno, estadoEnvio: 'ENVIADO' } });
    } catch (error) {
      await this.db.mensaje.update({ where: { id: salida.id }, data: { estadoEnvio: 'FALLIDO' } });
      console.error(JSON.stringify({ evento: 'envio_automatico_fallido', mensajeId: salida.id, error: error instanceof Error ? error.message : 'Error desconocido' }));
    }
  }
}
