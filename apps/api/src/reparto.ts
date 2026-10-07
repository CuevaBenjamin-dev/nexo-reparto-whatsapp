import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BaseDatos } from './base-datos';
import { Prisma, EstadoConversacion, TipoAsignacion } from '@prisma/client';

type Transaccion = Prisma.TransactionClient;

@Injectable()
export class ServicioReparto {
  constructor(private readonly db: BaseDatos) {}

  async bloquearGrupo(tx: Transaccion, grupoId: number): Promise<void> {
    // V1 y V2 comparten contador_reparto: serializar ambos motores evita elegir mínimos obsoletos.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(42020, 1)::text`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(42017, CAST(${grupoId} AS integer))::text`;
  }

  async asignarConversacion(grupoId: number, conversacionId: number): Promise<number | null> {
    return this.db.$transaction(async tx => this.asignarEnTransaccion(tx, grupoId, conversacionId), { maxWait: 60000, timeout: 60000 });
  }

  async asignarEnTransaccion(tx: Transaccion, grupoId: number, conversacionId: number): Promise<number | null> {
    await this.bloquearGrupo(tx, grupoId);
    const filas = await tx.$queryRaw<Array<{ id: number; grupo_id: number | null; asesor_id: number | null; estado: EstadoConversacion }>>`
      SELECT id, grupo_id, asesor_id, estado FROM conversaciones WHERE id = ${conversacionId} FOR UPDATE`;
    const conversacion = filas[0];
    if (!conversacion) throw new NotFoundException('Conversación inexistente');
    if (conversacion.grupo_id !== grupoId) throw new ConflictException('El grupo no coincide');
    if (conversacion.asesor_id) return conversacion.asesor_id;
    if (conversacion.estado === 'CERRADA') throw new ConflictException('Conversación cerrada');

    const elegibles = await tx.$queryRaw<Array<{ id: number }>>`
      SELECT a.id FROM asesores a JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.grupo_id = ${grupoId} AND a.activo_reparto = true AND a.disponible = true AND u.activo = true AND u.rol = 'ASESOR'
        AND a.contador_reparto = (
          SELECT MIN(a2.contador_reparto) FROM asesores a2
          JOIN usuarios u2 ON u2.id = a2.usuario_id
          WHERE a2.grupo_id = ${grupoId} AND a2.activo_reparto = true AND a2.disponible = true AND u2.activo = true AND u2.rol = 'ASESOR'
        )
      ORDER BY random() LIMIT 1 FOR UPDATE OF a`;
    const asesor = elegibles[0];
    if (!asesor) {
      await tx.conversacion.update({ where: { id: conversacionId }, data: { estado: 'PENDIENTE_ASIGNACION' } });
      return null;
    }
    await tx.conversacion.update({ where: { id: conversacionId }, data: { asesorId: asesor.id, estado: 'ABIERTA' } });
    await tx.asignacion.create({ data: { conversacionId, asesorId: asesor.id, grupoId, tipo: TipoAsignacion.AUTOMATICA } });
    await tx.asesor.update({ where: { id: asesor.id }, data: { contadorReparto: { increment: 1 }, totalAsignaciones: { increment: 1 } } });
    return asesor.id;
  }

  async asignarSolicitud(solicitudId: number): Promise<number | null> {
    return this.db.$transaction(tx => this.asignarSolicitudEnTransaccion(tx, solicitudId), { maxWait: 60000, timeout: 60000 });
  }

  async asignarSolicitudEnTransaccion(tx: Transaccion, solicitudId: number): Promise<number | null> {
    // Un solo conjunto de asesores V2; el bloqueo no afecta los grupos legados V1.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(42020, 1)::text`;
    const filas = await tx.$queryRaw<Array<{ id: number; asesor_id: number | null; estado: string }>>`
      SELECT id, asesor_id, estado FROM solicitudes_reparto WHERE id = ${solicitudId} FOR UPDATE`;
    const solicitud = filas[0];
    if (!solicitud) throw new NotFoundException('Solicitud inexistente');
    if (solicitud.asesor_id) return solicitud.asesor_id;
    if (solicitud.estado !== 'NUEVA') throw new ConflictException('Solicitud no disponible para reparto');
    const elegibles = await tx.$queryRaw<Array<{ id: number; canal_id: number }>>`
      SELECT a.id, c.id AS canal_id FROM asesores a
      JOIN usuarios u ON u.id = a.usuario_id
      JOIN canales_whatsapp c ON c.asesor_id = a.id AND c.tipo = 'ASESOR' AND c.activo = true AND c.estado_integracion = 'ACTIVO'
      WHERE a.activo_reparto = true AND a.disponible = true AND u.activo = true AND u.rol = 'ASESOR'
        AND a.contador_reparto = (
          SELECT MIN(a2.contador_reparto) FROM asesores a2
          JOIN usuarios u2 ON u2.id = a2.usuario_id
          JOIN canales_whatsapp c2 ON c2.asesor_id = a2.id AND c2.tipo = 'ASESOR' AND c2.activo = true AND c2.estado_integracion = 'ACTIVO'
          WHERE a2.activo_reparto = true AND a2.disponible = true AND u2.activo = true AND u2.rol = 'ASESOR'
        )
      ORDER BY random() LIMIT 1 FOR UPDATE OF a`;
    const elegido = elegibles[0];
    if (!elegido) return null;
    await tx.solicitudReparto.update({ where: { id: solicitudId }, data: { asesorId: elegido.id, canalAsesorId: elegido.canal_id, estado: 'ASIGNADA', fechaAsignacion: new Date() } });
    await tx.asignacionSolicitud.create({ data: { solicitudId, asesorId: elegido.id, tipo: 'AUTOMATICA' } });
    await tx.asesor.update({ where: { id: elegido.id }, data: { contadorReparto: { increment: 1 }, totalAsignaciones: { increment: 1 } } });
    await tx.auditoria.create({ data: { accion: 'ASIGNAR_SOLICITUD', entidad: 'solicitudes_reparto', entidadId: String(solicitudId), datos: { asesorId: elegido.id, canalAsesorId: elegido.canal_id } } });
    return elegido.id;
  }
}
