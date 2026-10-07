import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { BaseDatos } from '../src/base-datos';
import { ServicioReparto } from '../src/reparto';
import { ServicioEntradas } from '../src/entradas';
import { ServicioConversaciones } from '../src/conversaciones';
import { ProveedorWhatsAppMock } from '../src/proveedor-whatsapp';
import { TiempoReal } from '../src/tiempo-real';
import { ServicioOperacionV2 } from '../src/operacion-v2';
import { Configuracion } from '../src/config';

const db = new BaseDatos();
const reparto = new ServicioReparto(db);
const tiempoReal = new TiempoReal();
const proveedor = new ProveedorWhatsAppMock();
const operacionV2 = new ServicioOperacionV2(db, reparto, tiempoReal, proveedor);
const entradas = new ServicioEntradas(db, reparto, tiempoReal, operacionV2, proveedor);
const conversaciones = new ServicioConversaciones(db, reparto, tiempoReal, { whatsappMode: 'mock' } as Configuracion, proveedor);
const sufijo = randomUUID().slice(0, 8);
let grupoId: number; let otroGrupoId: number;
const usuarioIds: number[] = []; const asesorIds: number[] = []; const contactoIds: number[] = []; const conversacionIds: number[] = []; const eventos: string[] = [];

async function nuevaConversacion(numero: number, grupo = grupoId) {
  const contacto = await db.contacto.create({ data: { telefono: `519${sufijo.replace(/[^0-9]/g, '').padEnd(8, '0')}${String(numero).padStart(5, '0')}`, waId: `test-${sufijo}-${numero}` } });
  contactoIds.push(contacto.id);
  const conversacion = await db.conversacion.create({ data: { contactoId: contacto.id, grupoId: grupo, estado: 'PENDIENTE_ASIGNACION' } });
  conversacionIds.push(conversacion.id);
  return conversacion.id;
}

beforeAll(async () => {
  await db.$connect();
  const grupo = await db.grupo.create({ data: { nombre: `Prueba ${sufijo}` } }); grupoId = grupo.id;
  const otro = await db.grupo.create({ data: { nombre: `Otro ${sufijo}` } }); otroGrupoId = otro.id;
  for (let i = 0; i < 5; i++) {
    const usuario = await db.usuario.create({ data: { nombre: `Test${i}`, apellido: sufijo, correo: `test-${sufijo}-${i}@local.test`, passwordHash: 'hash-no-login', rol: 'ASESOR' } }); usuarioIds.push(usuario.id);
    const asesor = await db.asesor.create({ data: { usuarioId: usuario.id, grupoId } }); asesorIds.push(asesor.id);
  }
  await db.opcionWhatsapp.create({ data: { titulo: `Opción ${sufijo}`, identificadorExterno: `op-${sufijo}`, grupoId } });
});

afterAll(async () => {
  await db.mensaje.deleteMany({ where: { conversacionId: { in: conversacionIds } } });
  await db.asignacion.deleteMany({ where: { conversacionId: { in: conversacionIds } } });
  await db.auditoria.deleteMany({ where: { entidadId: { in: conversacionIds.map(String) } } });
  await db.conversacion.deleteMany({ where: { id: { in: conversacionIds } } });
  await db.eventoWhatsapp.deleteMany({ where: { identificadorExterno: { in: eventos } } });
  await db.contacto.deleteMany({ where: { id: { in: contactoIds } } });
  await db.opcionWhatsapp.deleteMany({ where: { identificadorExterno: `op-${sufijo}` } });
  await db.asesor.deleteMany({ where: { id: { in: asesorIds } } });
  await db.usuario.deleteMany({ where: { id: { in: usuarioIds } } });
  await db.grupo.deleteMany({ where: { id: { in: [grupoId, otroGrupoId] } } });
  await db.$disconnect();
});

describe('motor de reparto y flujo mock', () => {
  it('equilibra cinco asignaciones y cien concurrentes sin duplicados', async () => {
    const primeros = await Promise.all(Array.from({ length: 5 }, async (_, i) => reparto.asignarConversacion(grupoId, await nuevaConversacion(i))));
    expect(new Set(primeros).size).toBe(5);
    const ids = await Promise.all(Array.from({ length: 100 }, (_, i) => nuevaConversacion(100 + i)));
    const resultados = await Promise.all(ids.map(id => reparto.asignarConversacion(grupoId, id)));
    expect(resultados.every(Boolean)).toBe(true);
    const asesores = await db.asesor.findMany({ where: { id: { in: asesorIds } } });
    const contadores = asesores.map(a => a.contadorReparto);
    expect(Math.max(...contadores) - Math.min(...contadores)).toBeLessThanOrEqual(1);
    expect(contadores.reduce((a, b) => a + b, 0)).toBe(105);
    expect(await db.asignacion.count({ where: { conversacionId: { in: ids } } })).toBe(100);
    const una = ids[0];
    const antes = await db.asignacion.count({ where: { conversacionId: una } });
    await Promise.all(Array.from({ length: 10 }, () => reparto.asignarConversacion(grupoId, una)));
    expect(await db.asignacion.count({ where: { conversacionId: una } })).toBe(antes);
  });
  it('excluye inactivos, los reactiva y no cruza grupos', async () => {
    await db.asesor.update({ where: { id: asesorIds[0] }, data: { activoReparto: false } });
    const ids = await Promise.all(Array.from({ length: 20 }, (_, i) => nuevaConversacion(300 + i)));
    const resultados = await Promise.all(ids.map(id => reparto.asignarConversacion(grupoId, id)));
    expect(resultados).not.toContain(asesorIds[0]);
    await db.asesor.update({ where: { id: asesorIds[0] }, data: { activoReparto: true } });
    const otro = await nuevaConversacion(401);
    expect(await reparto.asignarConversacion(grupoId, otro)).toBe(asesorIds[0]);
    const sinAsesor = await nuevaConversacion(402, otroGrupoId);
    expect(await reparto.asignarConversacion(otroGrupoId, sinAsesor)).toBeNull();
    expect((await db.conversacion.findUniqueOrThrow({ where: { id: sinAsesor } })).estado).toBe('PENDIENTE_ASIGNACION');
  });
  it('mantiene conversación, idempotencia y aislamiento entre asesores en mock', async () => {
    const telefono = `519${String(Date.now()).slice(-8)}`;
    const holaId = `mock-test-${sufijo}-hola`; eventos.push(holaId);
    await entradas.registrar(holaId, 'mensaje', { idExterno: holaId, waId: telefono, telefono, tipo: 'TEXTO', contenido: 'Hola' });
    await entradas.procesar(holaId);
    const contacto = await db.contacto.findUniqueOrThrow({ where: { waId: telefono } }); contactoIds.push(contacto.id);
    const conversacion = await db.conversacion.findFirstOrThrow({ where: { contactoId: contacto.id } }); conversacionIds.push(conversacion.id);
    expect(await db.mensaje.count({ where: { conversacionId: conversacion.id, tipo: 'INTERACTIVO' } })).toBe(1);
    await entradas.procesar(holaId);
    expect(await db.mensaje.count({ where: { conversacionId: conversacion.id, tipo: 'INTERACTIVO' } })).toBe(1);
    const opcionId = `mock-test-${sufijo}-op`; eventos.push(opcionId);
    await entradas.registrar(opcionId, 'mensaje', { idExterno: opcionId, waId: telefono, telefono, tipo: 'INTERACTIVO', contenido: 'Opción', opcionId: `op-${sufijo}` });
    await entradas.procesar(opcionId);
    const asignada = await db.conversacion.findUniqueOrThrow({ where: { id: conversacion.id }, include: { asesor: true } });
    expect(asignada.estado).toBe('ABIERTA');
    const asesor = asignada.asesor!;
    const ajeno = usuarioIds.find(id => id !== asesor.usuarioId)!;
    await expect(conversaciones.obtener(conversacion.id, { id: ajeno, nombre: 'Otro', apellido: '', correo: '', rol: 'ASESOR' })).rejects.toThrow();
    const propio = { id: asesor.usuarioId, nombre: 'Propio', apellido: '', correo: '', rol: 'ASESOR' as const };
    await conversaciones.responder(conversacion.id, 'Respuesta del asesor', propio);
    const posteriorId = `mock-test-${sufijo}-posterior`; eventos.push(posteriorId);
    await entradas.registrar(posteriorId, 'mensaje', { idExterno: posteriorId, waId: telefono, telefono, tipo: 'TEXTO', contenido: 'Gracias' });
    await entradas.procesar(posteriorId);
    expect((await db.conversacion.findUniqueOrThrow({ where: { id: conversacion.id } })).asesorId).toBe(asesor.id);
    expect(await db.asignacion.count({ where: { conversacionId: conversacion.id } })).toBe(1);
    expect(await db.mensaje.count({ where: { conversacionId: conversacion.id } })).toBe(6);
  });
});
