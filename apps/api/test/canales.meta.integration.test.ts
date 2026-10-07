import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { Configuracion } from '../src/config';
import { BaseDatos } from '../src/base-datos';
import { ServicioReparto } from '../src/reparto';
import { ServicioOperacionV2 } from '../src/operacion-v2';
import { ServicioEntradas } from '../src/entradas';
import { ServicioConversaciones } from '../src/conversaciones';
import { ProveedorWhatsAppMock } from '../src/proveedor-whatsapp';
import { TiempoReal } from '../src/tiempo-real';

const db = new BaseDatos();
const sufijo = randomUUID().replace(/-/g, '').slice(0, 10);
const configMeta = { whatsappMode: 'meta' } as Configuracion;
const configMock = { whatsappMode: 'mock' } as Configuracion;
const proveedor = new ProveedorWhatsAppMock();
const real = new TiempoReal();
const repartoMeta = new ServicioReparto(db, configMeta);
const repartoMock = new ServicioReparto(db, configMock);
const operacionMeta = new ServicioOperacionV2(db, repartoMeta, real, proveedor, configMeta);
const entradasMeta = new ServicioEntradas(db, repartoMeta, real, operacionMeta, proveedor);
const conversacionesMeta = new ServicioConversaciones(db, repartoMeta, real, configMeta, proveedor);
const ids = { usuarios: [] as number[], asesores: [] as number[], canales: [] as number[], contactos: [] as number[], solicitudes: [] as number[], eventos: [] as string[] };
let grupoId: number; let opcionId: number; let repartidorId: number; let repartidorMockId: number; let phoneRepartidor: string;
let asesorMiguel: number; let usuarioMiguel: number; let canalMockMiguel: number; let canalMetaMiguel: number; let phoneMiguel: string;
let solicitudPendiente: number; let contactoPendiente: number; let conversacionMiguel: number; let conversacionRepartidor: number;
let configCreada = false;
const telefono = (n: number) => `519${String(Date.now()).slice(-6)}${String(n).padStart(2, '0')}`;
const sesion = (id: number) => ({ id, nombre: 'Prueba', apellido: '', correo: '', rol: 'ASESOR' as const });

async function entradaMeta(numero: string, indice: number) {
  const id = `meta-fixture:${sufijo}:${indice}`; ids.eventos.push(id);
  await entradasMeta.registrar(id, 'mensaje_canal', { idExterno: id, phoneNumberId: phoneRepartidor, waId: numero, telefono: numero, tipo: 'INTERACTIVO', opcionId: `op-${sufijo}`, contenido: 'Productos' });
  await entradasMeta.procesar(id);
  const contacto = await db.contacto.findUniqueOrThrow({ where: { waId: numero } }); ids.contactos.push(contacto.id);
  const solicitud = await db.solicitudReparto.findUniqueOrThrow({ where: { idExternoOrigen: id } }); ids.solicitudes.push(solicitud.id);
  return { solicitud, contacto };
}

beforeAll(async () => {
  await db.$connect();
  const grupo = await db.grupo.create({ data: { nombre: `Meta fixture ${sufijo}` } }); grupoId = grupo.id;
  const opcion = await db.opcionWhatsapp.create({ data: { titulo: `Productos ${sufijo}`, identificadorExterno: `op-${sufijo}`, grupoId } }); opcionId = opcion.id;
  for (const nombre of ['Otro', 'Miguel']) {
    const usuario = await db.usuario.create({ data: { nombre, apellido: sufijo, correo: `meta-${nombre}-${sufijo}@local.test`, passwordHash: 'fixture', rol: 'ASESOR' } }); ids.usuarios.push(usuario.id);
    const asesor = await db.asesor.create({ data: { usuarioId: usuario.id, grupoId } }); ids.asesores.push(asesor.id);
    const canal = await db.canalWhatsapp.create({ data: { tipo: 'ASESOR', proveedor: 'MOCK', nombre: `Demo ${nombre}`, numeroVisible: `DEMO-${sufijo}-${nombre}`, phoneNumberId: `mock-${sufijo}-${nombre}`, wabaId: 'mock-waba', asesorId: asesor.id, activo: true, estadoIntegracion: 'ACTIVO' } }); ids.canales.push(canal.id);
    if (nombre === 'Miguel') { asesorMiguel = asesor.id; usuarioMiguel = usuario.id; canalMockMiguel = canal.id; }
  }
  phoneRepartidor = `1${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const repartidorMock = await db.canalWhatsapp.create({ data: { tipo: 'REPARTIDOR', proveedor: 'MOCK', nombre: 'Repartidor demo fixture', numeroVisible: `DEMO-R-${sufijo}`, phoneNumberId: `mock-r-${sufijo}`, activo: false, estadoIntegracion: 'ACTIVO' } }); repartidorMockId = repartidorMock.id; ids.canales.push(repartidorMock.id);
  const repartidor = await db.canalWhatsapp.create({ data: { tipo: 'REPARTIDOR', proveedor: 'META', nombre: 'Repartidor fixture', numeroVisible: `+51${sufijo}`, phoneNumberId: phoneRepartidor, activo: true, estadoIntegracion: 'ACTIVO' } }); repartidorId = repartidor.id; ids.canales.push(repartidor.id);
  if (!await db.configuracionWhatsapp.findUnique({ where: { id: 1 } })) {
    await db.configuracionWhatsapp.create({ data: { id: 1, nombrePlantillaInicio: 'plantilla_fixture', idiomaPlantillaInicio: 'es' } }); configCreada = true;
  }
});

afterAll(async () => {
  const hilos = await db.conversacion.findMany({ where: { contactoId: { in: ids.contactos } }, select: { id: true } });
  await db.mensaje.deleteMany({ where: { conversacionId: { in: hilos.map(h => h.id) } } });
  await db.conversacion.deleteMany({ where: { id: { in: hilos.map(h => h.id) } } });
  await db.asignacionSolicitud.deleteMany({ where: { solicitudId: { in: ids.solicitudes } } });
  await db.auditoria.deleteMany({ where: { entidad: 'solicitudes_reparto', entidadId: { in: ids.solicitudes.map(String) } } });
  await db.solicitudReparto.deleteMany({ where: { id: { in: ids.solicitudes } } });
  await db.eventoWhatsapp.deleteMany({ where: { identificadorExterno: { in: ids.eventos } } });
  await db.contacto.deleteMany({ where: { id: { in: ids.contactos } } });
  await db.canalWhatsapp.deleteMany({ where: { id: { in: ids.canales } } });
  await db.asesor.deleteMany({ where: { id: { in: ids.asesores } } });
  await db.usuario.deleteMany({ where: { id: { in: ids.usuarios } } });
  await db.opcionWhatsapp.delete({ where: { id: opcionId } });
  await db.grupo.delete({ where: { id: grupoId } });
  if (configCreada) await db.configuracionWhatsapp.delete({ where: { id: 1 } });
  await db.$disconnect();
});

describe('separación entre canales MOCK y META', () => {
  it('mantiene el reparto mock y deja pendiente una entrada Meta sin asesores Meta', async () => {
    const numeroMock = telefono(1);
    const contactoMock = await db.contacto.create({ data: { telefono: numeroMock, waId: numeroMock } }); ids.contactos.push(contactoMock.id);
    const solicitudMock = await db.solicitudReparto.create({ data: { contactoId: contactoMock.id, canalOrigenId: repartidorMockId, grupoId, idExternoOrigen: `mock-fixture:${sufijo}`, contenidoInicial: 'Consulta demo' } }); ids.solicitudes.push(solicitudMock.id);
    expect(await repartoMock.asignarSolicitud(solicitudMock.id)).toBeTruthy();
    const contadoresAntes = (await db.asesor.findMany({ where: { id: { in: ids.asesores } } })).map(a => a.contadorReparto);
    const envio = vi.spyOn(proveedor, 'enviarTexto');
    const { solicitud, contacto } = await entradaMeta(telefono(2), 2);
    solicitudPendiente = solicitud.id; contactoPendiente = contacto.id;
    conversacionRepartidor = (await db.conversacion.findFirstOrThrow({ where: { contactoId: contacto.id, canalId: repartidorId, solicitudRepartoId: solicitud.id } })).id;
    expect(solicitud.estado).toBe('NUEVA'); expect(solicitud.asesorId).toBeNull(); expect(solicitud.grupoId).toBe(grupoId);
    expect((await db.asesor.findMany({ where: { id: { in: ids.asesores } } })).map(a => a.contadorReparto)).toEqual(contadoresAntes);
    expect(envio).toHaveBeenCalledWith(contacto.waId, 'En un momento lo atendemos.', phoneRepartidor);
    envio.mockRestore();
  });

  it('elige solo el canal Meta de Miguel, envía su plantilla y bloquea el canal demo', async () => {
    phoneMiguel = `2${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const canal = await db.canalWhatsapp.create({ data: { tipo: 'ASESOR', proveedor: 'META', nombre: 'Miguel fixture Meta', numeroVisible: `+52${sufijo}`, phoneNumberId: phoneMiguel, wabaId: `3${Date.now()}`, asesorId: asesorMiguel, activo: true, estadoIntegracion: 'ACTIVO', modoCoexistencia: true } }); canalMetaMiguel = canal.id; ids.canales.push(canal.id);
    expect(await repartoMeta.asignarSolicitud(solicitudPendiente)).toBe(asesorMiguel);
    const asignada = await db.solicitudReparto.findUniqueOrThrow({ where: { id: solicitudPendiente } });
    expect(asignada.canalAsesorId).toBe(canalMetaMiguel);
    const enviar = vi.spyOn(proveedor, 'enviarPlantilla');
    const inicio = await operacionMeta.iniciarAtencion(solicitudPendiente, sesion(usuarioMiguel)); conversacionMiguel = inicio.conversacionId;
    expect((await db.conversacion.findMany({ where: { solicitudRepartoId: solicitudPendiente } })).map(c => c.id).sort()).toEqual([conversacionRepartidor, conversacionMiguel].sort());
    expect(enviar).toHaveBeenCalledWith(expect.any(String), phoneMiguel, expect.any(String), expect.any(String), expect.any(Array));
    expect(enviar).not.toHaveBeenCalledWith(expect.any(String), phoneRepartidor, expect.any(String), expect.any(String), expect.any(Array));
    enviar.mockRestore();
    await expect(conversacionesMeta.responder(conversacionMiguel, 'Texto antes de respuesta', sesion(usuarioMiguel))).rejects.toThrow('Ventana de atención cerrada');
    expect((await conversacionesMeta.enviarPlantilla(conversacionMiguel, sesion(usuarioMiguel))).tipo).toBe('PLANTILLA');
    const numero = telefono(3); const contacto = await db.contacto.create({ data: { telefono: numero, waId: numero } }); ids.contactos.push(contacto.id);
    const antigua = await db.solicitudReparto.create({ data: { contactoId: contacto.id, canalOrigenId: repartidorId, grupoId, asesorId: asesorMiguel, canalAsesorId: canalMockMiguel, idExternoOrigen: `antigua:${sufijo}`, contenidoInicial: 'Asignación antigua', estado: 'ASIGNADA' } }); ids.solicitudes.push(antigua.id);
    await db.canalWhatsapp.update({ where: { id: canalMetaMiguel }, data: { activo: false } });
    const noEnviar = vi.spyOn(proveedor, 'enviarPlantilla');
    await expect(operacionMeta.iniciarAtencion(antigua.id, sesion(usuarioMiguel))).rejects.toMatchObject({ status: 409 });
    expect(noEnviar).not.toHaveBeenCalled(); noEnviar.mockRestore();
    await db.canalWhatsapp.update({ where: { id: canalMetaMiguel }, data: { activo: true } });
    await operacionMeta.iniciarAtencion(antigua.id, sesion(usuarioMiguel));
    expect((await db.solicitudReparto.findUniqueOrThrow({ where: { id: antigua.id } })).canalAsesorId).toBe(canalMetaMiguel);
  });

  it('asocia mensajes y ecos al chat de Miguel sin reparto nuevo ni acceso de otro asesor', async () => {
    const contacto = await db.contacto.findUniqueOrThrow({ where: { id: contactoPendiente } });
    expect((await conversacionesMeta.obtener(conversacionRepartidor, sesion(usuarioMiguel))).id).toBe(conversacionRepartidor);
    await expect(conversacionesMeta.responder(conversacionRepartidor, 'No usar repartidor', sesion(usuarioMiguel))).rejects.toMatchObject({ status: 409 });
    await expect(conversacionesMeta.cerrar(conversacionRepartidor, sesion(usuarioMiguel))).rejects.toMatchObject({ status: 403 });
    const asignacionesAntes = await db.asignacionSolicitud.count({ where: { solicitudId: solicitudPendiente } });
    const mensajeId = `meta-fixture:${sufijo}:cliente`; ids.eventos.push(mensajeId);
    await entradasMeta.registrar(mensajeId, 'mensaje_canal', { idExterno: mensajeId, phoneNumberId: phoneMiguel, waId: contacto.waId, telefono: contacto.telefono, tipo: 'TEXTO', contenido: 'Gracias Miguel' });
    await entradasMeta.procesar(mensajeId); await entradasMeta.procesar(mensajeId);
    expect(await db.mensaje.count({ where: { idExternoWhatsapp: mensajeId, conversacionId: conversacionMiguel } })).toBe(1);
    expect(await db.asignacionSolicitud.count({ where: { solicitudId: solicitudPendiente } })).toBe(asignacionesAntes);
    const ecoId = `meta-fixture:${sufijo}:eco`; ids.eventos.push(ecoId);
    const eco = vi.spyOn(proveedor, 'enviarTexto');
    await entradasMeta.registrar(ecoId, 'eco_canal', { idExterno: ecoId, phoneNumberId: phoneMiguel, destinatario: contacto.waId, tipo: 'TEXTO', contenido: 'Desde Business App' });
    await entradasMeta.procesar(ecoId); await entradasMeta.procesar(ecoId);
    expect(await db.mensaje.count({ where: { idExternoWhatsapp: ecoId } })).toBe(1);
    expect(await db.mensaje.findUniqueOrThrow({ where: { idExternoWhatsapp: ecoId } })).toMatchObject({ conversacionId: conversacionMiguel, direccion: 'SALIENTE', origen: 'WHATSAPP_BUSINESS_APP' });
    expect(eco).not.toHaveBeenCalled(); eco.mockRestore();
    await expect(conversacionesMeta.obtener(conversacionMiguel, sesion(ids.usuarios[0]))).rejects.toMatchObject({ status: 403 });
    const salida = vi.spyOn(proveedor, 'enviarTexto');
    await conversacionesMeta.responder(conversacionMiguel, 'Respuesta NEXO', sesion(usuarioMiguel));
    expect(salida).toHaveBeenCalledWith(contacto.waId, 'Respuesta NEXO', phoneMiguel); salida.mockRestore();
    const totalHistorico = await db.mensaje.count({ where: { conversacionId: conversacionMiguel } });
    await db.asesor.update({ where: { id: asesorMiguel }, data: { activoReparto: false } });
    expect((await entradaMeta(telefono(4), 4)).solicitud.estado).toBe('NUEVA');
    expect(await db.mensaje.count({ where: { conversacionId: conversacionMiguel } })).toBe(totalHistorico);
  });

  it('permite Cloud API de asesor sin Coexistence, siempre desde su propio número', async () => {
    const asesor = ids.asesores[0]; const usuario = ids.usuarios[0];
    const phoneNumberId = `4${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const canal = await db.canalWhatsapp.create({ data: { tipo: 'ASESOR', proveedor: 'META', nombre: 'Cloud API fixture', numeroVisible: `+53${sufijo}`, phoneNumberId, wabaId: `5${Date.now()}`, asesorId: asesor, activo: true, estadoIntegracion: 'ACTIVO', modoCoexistencia: false } }); ids.canales.push(canal.id);
    const pendiente = await db.solicitudReparto.findFirstOrThrow({ where: { idExternoOrigen: `meta-fixture:${sufijo}:4` } });
    expect(await repartoMeta.asignarSolicitud(pendiente.id)).toBe(asesor);
    const envio = vi.spyOn(proveedor, 'enviarPlantilla');
    await operacionMeta.iniciarAtencion(pendiente.id, sesion(usuario));
    expect(envio).toHaveBeenCalledWith(expect.any(String), phoneNumberId, expect.any(String), expect.any(String), expect.any(Array));
    envio.mockRestore();
  });
});
