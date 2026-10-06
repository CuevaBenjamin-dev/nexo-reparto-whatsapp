import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BaseDatos } from './base-datos';
import { Prisma, EstadoConversacion, TipoAsignacion } from '@prisma/client';

type Transaccion = Prisma.TransactionClient;

@Injectable()
export class ServicioReparto {
  constructor(private readonly db: BaseDatos) {}

  async bloquearGrupo(tx: Transaccion, grupoId: number): Promise<void> {
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
      WHERE a.grupo_id = ${grupoId} AND a.activo_reparto = true AND u.activo = true AND u.rol = 'ASESOR'
        AND a.contador_reparto = (
          SELECT MIN(a2.contador_reparto) FROM asesores a2
          JOIN usuarios u2 ON u2.id = a2.usuario_id
          WHERE a2.grupo_id = ${grupoId} AND a2.activo_reparto = true AND u2.activo = true AND u2.rol = 'ASESOR'
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
}
