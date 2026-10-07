import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { BaseDatos } from '../src/base-datos';
import { ServicioReparto } from '../src/reparto';
import { ServicioOperacionV2 } from '../src/operacion-v2';
import { ServicioEntradas } from '../src/entradas';
import { ServicioConversaciones } from '../src/conversaciones';
import { ProveedorWhatsAppMock } from '../src/proveedor-whatsapp';
import { TiempoReal } from '../src/tiempo-real';
import { Configuracion } from '../src/config';
import { SolicitudesRepartoController } from '../src/operacion-v2.controller';

const db = new BaseDatos(); const reparto = new ServicioReparto(db); const real = new TiempoReal(); const proveedor = new ProveedorWhatsAppMock();
const operacion = new ServicioOperacionV2(db, reparto, real, proveedor);
const entradas = new ServicioEntradas(db, reparto, real, operacion, proveedor);
const conversaciones = new ServicioConversaciones(db, reparto, real, { whatsappMode: 'mock' } as Configuracion, proveedor);
const sufijo = randomUUID().replace(/-/g, '').slice(0, 12);
let grupoId: number; let repartidorId: number; let repartidorPhoneId: string;
const usuarios: number[] = []; const asesores: number[] = []; const canales: number[] = []; const contactos: number[] = []; const solicitudes: number[] = []; const hilos: number[] = []; const eventos: string[] = [];
const sesion = (id: number) => ({ id, nombre: 'Prueba', apellido: '', correo: '', rol: 'ASESOR' as const });
const telefono = (n: number) => `519${String(Date.now()).slice(-6)}${String(n).padStart(2, '0')}`;
async function entrada(numero: string, indice: number) {
  const id = `v2:${sufijo}:${indice}`; eventos.push(id);
  await entradas.registrar(id, 'mensaje_canal', { idExterno: id, phoneNumberId: repartidorPhoneId, waId: numero, telefono: numero, tipo: 'TEXTO', contenido: `Consulta ${indice}` });
  await entradas.procesar(id);
  const contacto = await db.contacto.findUniqueOrThrow({ where: { waId: numero } }); contactos.push(contacto.id);
  const solicitud = await db.solicitudReparto.findUniqueOrThrow({ where: { idExternoOrigen: id } }); solicitudes.push(solicitud.id);
  const hilo = await db.conversacion.findFirstOrThrow({ where: { contactoId: contacto.id, canalId: repartidorId } }); hilos.push(hilo.id);
  return { solicitud, contacto, hilo };
}

beforeAll(async () => {
  await db.$connect();
  const grupo = await db.grupo.create({ data: { nombre: `V2 ${sufijo}` } }); grupoId = grupo.id;
  const repartidor = await db.canalWhatsapp.create({ data: { tipo: 'REPARTIDOR', nombre: 'Repartidor test', numeroVisible: `TEST-R-${sufijo}`, phoneNumberId: `test-repartidor-${sufijo}`, activo: false, estadoIntegracion: 'ACTIVO' } });
  repartidorId = repartidor.id; repartidorPhoneId = repartidor.phoneNumberId!; canales.push(repartidor.id);
  // El seed de desarrollo ya tiene un repartidor activo. Este fixture se activa solo tras desactivarlo temporalmente.
  const activo = await db.canalWhatsapp.findFirst({ where: { tipo: 'REPARTIDOR', activo: true } });
  if (activo) await db.canalWhatsapp.update({ where: { id: activo.id }, data: { activo: false } });
  await db.canalWhatsapp.update({ where: { id: repartidor.id }, data: { activo: true } });
  for (let i = 0; i < 4; i++) {
    const usuario = await db.usuario.create({ data: { nombre: `V2-${i}`, apellido: sufijo, correo: `v2-${sufijo}-${i}@local.test`, passwordHash: 'test', rol: 'ASESOR' } }); usuarios.push(usuario.id);
    const asesor = await db.asesor.create({ data: { usuarioId: usuario.id, grupoId, contadorReparto: -100 } }); asesores.push(asesor.id);
    const canal = await db.canalWhatsapp.create({ data: { tipo: 'ASESOR', nombre: `Test ${i}`, numeroVisible: `TEST-A-${sufijo}-${i}`, phoneNumberId: `test-asesor-${sufijo}-${i}`, asesorId: asesor.id, activo: true, estadoIntegracion: 'ACTIVO', modoCoexistencia: true } }); canales.push(canal.id);
  }
});
afterAll(async () => {
  await db.mensaje.deleteMany({ where: { conversacionId: { in: hilos } } });
  await db.conversacion.deleteMany({ where: { id: { in: hilos } } });
  await db.asignacionSolicitud.deleteMany({ where: { solicitudId: { in: solicitudes } } });
  await db.auditoria.deleteMany({ where: { entidad: 'solicitudes_reparto', entidadId: { in: solicitudes.map(String) } } });
  await db.solicitudReparto.deleteMany({ where: { id: { in: solicitudes } } });
  await db.eventoWhatsapp.deleteMany({ where: { identificadorExterno: { in: eventos } } });
  await db.contacto.deleteMany({ where: { id: { in: contactos } } });
  await db.canalWhatsapp.deleteMany({ where: { id: { in: canales } } });
  await db.asesor.deleteMany({ where: { id: { in: asesores } } });
  await db.usuario.deleteMany({ where: { id: { in: usuarios } } });
  await db.grupo.delete({ where: { id: grupoId } });
  const repartidorDemo = await db.canalWhatsapp.findUnique({ where: { phoneNumberId: 'mock-repartidor' } });
  if (repartidorDemo) await db.canalWhatsapp.update({ where: { id: repartidorDemo.id }, data: { activo: true } });
  await db.$disconnect();
});

describe('NEXO V2 multicanal', () => {
  it('reparte consultas concurrentes entre asesores activos con menor contador y sin menú', async () => {
    const numeros = Array.from({ length: 40 }, (_, i) => telefono(i));
    const recibidas = await Promise.all(numeros.map((n, i) => entrada(n, i)));
    expect(recibidas.every(r => r.solicitud.estado === 'ASIGNADA')).toBe(true);
    expect(recibidas.every(r => asesores.includes(r.solicitud.asesorId!))).toBe(true);
    const contadores = (await db.asesor.findMany({ where: { id: { in: asesores } } })).map(a => a.contadorReparto);
    expect(Math.max(...contadores) - Math.min(...contadores)).toBeLessThanOrEqual(1);
    expect(await db.mensaje.count({ where: { conversacionId: { in: hilos }, tipo: 'INTERACTIVO' } })).toBe(0);
    expect(await db.mensaje.count({ where: { conversacionId: { in: hilos }, contenido: 'En un momento lo atendemos.' } })).toBe(40);
    await entradas.procesar(eventos[0]);
    expect(await db.solicitudReparto.count({ where: { idExternoOrigen: eventos[0] } })).toBe(1);
  }, 60000);
  it('registra plantilla, respuesta del cliente y eco en el canal correcto; aísla al asesor', async () => {
    const solicitud = await db.solicitudReparto.findUniqueOrThrow({ where: { id: solicitudes[0] }, include: { asesor: true, canalAsesor: true, contacto: true } });
    const propio = sesion(solicitud.asesor!.usuarioId);
    const ajeno = sesion(usuarios.find(id => id !== propio.id)!);
    await expect(operacion.iniciarAtencion(solicitud.id, ajeno)).rejects.toThrow();
    const envioPlantilla = vi.spyOn(proveedor, 'enviarPlantilla');
    const inicio = await operacion.iniciarAtencion(solicitud.id, propio); hilos.push(inicio.conversacionId);
    expect(envioPlantilla).toHaveBeenCalledWith(solicitud.contacto.waId, solicitud.canalAsesor!.phoneNumberId, 'plantilla_inicio_demo', 'es', expect.any(Array));
    envioPlantilla.mockRestore();
    const plantilla = await db.mensaje.findUniqueOrThrow({ where: { id: inicio.mensajeId } });
    expect(plantilla.tipo).toBe('PLANTILLA'); expect(plantilla.origen).toBe('NEXO');
    await expect(conversaciones.obtener(inicio.conversacionId, ajeno)).rejects.toMatchObject({ status: 403 });
    expect((await conversaciones.obtener(inicio.conversacionId, { ...propio, rol: 'ADMIN' })).id).toBe(inicio.conversacionId);
    const conversacionMeta = new ServicioConversaciones(db, reparto, real, { whatsappMode: 'meta' } as Configuracion, proveedor);
    await expect(conversacionMeta.responder(inicio.conversacionId, 'Texto antes de respuesta', propio)).rejects.toThrow('Ventana de atención cerrada');
    expect((await conversacionMeta.enviarPlantilla(inicio.conversacionId, propio)).tipo).toBe('PLANTILLA');
    const respuestaId = `v2:${sufijo}:respuesta`; eventos.push(respuestaId);
    await entradas.registrar(respuestaId, 'mensaje_canal', { idExterno: respuestaId, phoneNumberId: solicitud.canalAsesor!.phoneNumberId, waId: solicitud.contacto.waId, telefono: solicitud.contacto.waId, tipo: 'TEXTO', contenido: 'Gracias por contactarme' });
    await entradas.procesar(respuestaId);
    await entradas.procesar(respuestaId);
    expect(await db.mensaje.count({ where: { idExternoWhatsapp: respuestaId } })).toBe(1);
    expect((await conversacionMeta.responder(inicio.conversacionId, 'Texto tras respuesta', propio)).origen).toBe('NEXO');
    const ecoId = `v2:${sufijo}:eco`; eventos.push(ecoId);
    await entradas.registrar(ecoId, 'eco_canal', { idExterno: ecoId, phoneNumberId: solicitud.canalAsesor!.phoneNumberId, destinatario: solicitud.contacto.waId, tipo: 'TEXTO', contenido: 'Respuesta desde celular' });
    await entradas.procesar(ecoId); await entradas.procesar(ecoId);
    expect(await db.mensaje.count({ where: { idExternoWhatsapp: ecoId } })).toBe(1);
    expect((await db.mensaje.findUniqueOrThrow({ where: { idExternoWhatsapp: ecoId } })).origen).toBe('WHATSAPP_BUSINESS_APP');
    const envioTexto = vi.spyOn(proveedor, 'enviarTexto');
    const enviado = await conversaciones.responder(inicio.conversacionId, 'Respuesta desde NEXO', propio);
    expect(envioTexto).toHaveBeenCalledWith(solicitud.contacto.waId, 'Respuesta desde NEXO', solicitud.canalAsesor!.phoneNumberId);
    envioTexto.mockRestore();
    expect(enviado.origen).toBe('NEXO');
    expect((await db.solicitudReparto.findUniqueOrThrow({ where: { id: solicitud.id } })).estado).toBe('EN_ATENCION');
    const otroCanal = canales.find(id => id !== repartidorId && id !== solicitud.canalAsesorId)!;
    const otro = await db.canalWhatsapp.findUniqueOrThrow({ where: { id: otroCanal } });
    const otroId = `v2:${sufijo}:otro`; eventos.push(otroId);
    await entradas.registrar(otroId, 'mensaje_canal', { idExterno: otroId, phoneNumberId: otro.phoneNumberId, waId: solicitud.contacto.waId, telefono: solicitud.contacto.waId, tipo: 'TEXTO', contenido: 'Otro canal' });
    await entradas.procesar(otroId);
    const h = await db.conversacion.findFirstOrThrow({ where: { contactoId: solicitud.contactoId, canalId: otro.id } }); hilos.push(h.id);
    expect(h.id).not.toBe(inicio.conversacionId);
    await expect(conversaciones.obtener(h.id, propio)).rejects.toMatchObject({ status: 403 });
    const filtradas = await conversaciones.listar({ ...propio, rol: 'ADMIN' }, String(otro.id));
    expect(filtradas.every(c => c.canalId === otro.id)).toBe(true);
    expect((await conversaciones.listar(propio, String(otro.id))).some(c => c.id === h.id)).toBe(false);
  }, 30000);
  it('excluye un asesor no disponible de nuevas asignaciones', async () => {
    const excluido = asesores[0]; await db.asesor.update({ where: { id: excluido }, data: { disponible: false, contadorReparto: -200 } });
    const nueva = await entrada(telefono(80), 80);
    expect(nueva.solicitud.asesorId).not.toBe(excluido);
  });
  it('excluye al asesor inactivo y al que no tiene canal operativo', async () => {
    await db.asesor.update({ where: { id: asesores[1] }, data: { activoReparto: false, contadorReparto: -300 } });
    await db.canalWhatsapp.update({ where: { id: canales[3] }, data: { activo: false } });
    await db.asesor.update({ where: { id: asesores[2] }, data: { contadorReparto: -300 } });
    const nueva = await entrada(telefono(81), 81);
    expect(nueva.solicitud.asesorId).not.toBe(asesores[1]);
    expect(nueva.solicitud.asesorId).not.toBe(asesores[2]);
  });
  it('conserva historial al dar de baja un canal y no crea mensajes nuevos desde él', async () => {
    const solicitud = await db.solicitudReparto.findUniqueOrThrow({ where: { id: solicitudes[0] }, include: { canalAsesor: true } });
    const canal = solicitud.canalAsesor!;
    await db.canalWhatsapp.update({ where: { id: canal.id }, data: { activo: false, estadoIntegracion: 'INACTIVO' } });
    const existentes = await db.mensaje.count({ where: { conversacion: { canalId: canal.id } } });
    const id = `v2:${sufijo}:inactivo`; eventos.push(id);
    const contacto = await db.contacto.findUniqueOrThrow({ where: { id: solicitud.contactoId } });
    await entradas.registrar(id, 'mensaje_canal', { idExterno: id, phoneNumberId: canal.phoneNumberId, waId: contacto.waId, telefono: contacto.waId, tipo: 'TEXTO', contenido: 'Mensaje nuevo' });
    await entradas.procesar(id);
    expect(await db.mensaje.count({ where: { conversacion: { canalId: canal.id } } })).toBe(existentes);
    const hilo = await db.conversacion.findFirstOrThrow({ where: { solicitudRepartoId: solicitud.id, canalId: canal.id } });
    expect((await conversaciones.obtener(hilo.id, { id: usuarios[0], nombre: 'Admin', apellido: '', correo: '', rol: 'ADMIN' })).mensajes.length).toBeGreaterThan(0);
  });
  it('reasigna sin borrar el hilo ni los mensajes históricos', async () => {
    const actual = await db.solicitudReparto.findUniqueOrThrow({ where: { id: solicitudes[0] } });
    const destinoId = asesores.find(id => id !== actual.asesorId)!;
    await db.asesor.update({ where: { id: destinoId }, data: { activoReparto: true, disponible: true } });
    await db.canalWhatsapp.updateMany({ where: { asesorId: destinoId }, data: { activo: true, estadoIntegracion: 'ACTIVO' } });
    const anterior = await db.conversacion.findFirstOrThrow({ where: { solicitudRepartoId: actual.id } });
    const mensajesAntes = await db.mensaje.count({ where: { conversacionId: anterior.id } });
    const controller = new SolicitudesRepartoController(db, operacion, reparto, real);
    const admin = { id: usuarios[0], nombre: 'Admin', apellido: '', correo: '', rol: 'ADMIN' as const };
    const reasignada = await controller.reasignar(actual.id, { asesorId: destinoId, motivo: 'Continuidad de atención' }, admin);
    expect(reasignada.asesorId).toBe(destinoId);
    expect((await db.conversacion.findUniqueOrThrow({ where: { id: anterior.id } })).estado).toBe('CERRADA');
    expect(await db.mensaje.count({ where: { conversacionId: anterior.id } })).toBe(mensajesAntes);
    expect((await db.solicitudReparto.findUniqueOrThrow({ where: { id: actual.id }, include: { conversaciones: true } })).conversaciones.some(c => c.id === anterior.id)).toBe(true);
  });
});
