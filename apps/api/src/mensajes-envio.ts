import { Prisma } from '@prisma/client';
import { BaseDatos } from './base-datos';

/** Reconcilia el resultado de Cloud API si el eco llegó antes con el mismo wamid. */
export async function confirmarSalida(db: BaseDatos, mensajeId: number, idExterno: string) {
  try {
    return await db.mensaje.update({ where: { id: mensajeId }, data: { idExternoWhatsapp: idExterno, estadoEnvio: 'ENVIADO' } });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    return db.$transaction(async tx => {
      const pendiente = await tx.mensaje.findUniqueOrThrow({ where: { id: mensajeId } });
      const eco = await tx.mensaje.findUnique({ where: { idExternoWhatsapp: idExterno } });
      if (!eco || eco.conversacionId !== pendiente.conversacionId) throw error;
      await tx.mensaje.delete({ where: { id: mensajeId } });
      return tx.mensaje.update({ where: { id: eco.id }, data: { origen: pendiente.origen, tipo: pendiente.tipo, contenido: pendiente.contenido, estadoEnvio: 'ENVIADO' } });
    });
  }
}
