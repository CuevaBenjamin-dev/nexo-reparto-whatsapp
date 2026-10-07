import { PrismaClient, Rol } from '@prisma/client';
import * as argon2 from 'argon2';

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('El seed de desarrollo no se ejecuta en producción');
  const modoDemo = (process.env.WHATSAPP_MODE || 'mock') === 'mock';
  if (!modoDemo && !process.env.ADMIN_INICIAL_PASSWORD?.trim()) {
    console.log(JSON.stringify({ evento: 'seed_meta_sin_cambios' }));
    return;
  }
  const db = new PrismaClient();
  try {
    const password = process.env.ADMIN_INICIAL_PASSWORD || 'DemoLocal!2026';
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    if (modoDemo) for (const [anterior, nuevo] of [['lucía@local.test', 'lucia@local.test'], ['josé@local.test', 'jose@local.test']]) {
      const cuenta = await db.usuario.findUnique({ where: { correo: anterior } });
      if (cuenta && !await db.usuario.findUnique({ where: { correo: nuevo } })) await db.usuario.update({ where: { id: cuenta.id }, data: { correo: nuevo } });
    }
    const cuentas: Array<{ nombre: string; apellido: string; correo: string; rol: Rol }> = [
      { nombre: 'Admin', apellido: 'Local', correo: process.env.ADMIN_INICIAL_CORREO || 'admin@local.test', rol: 'ADMIN' },
      ...(modoDemo ? [
        { nombre: 'Sofía', apellido: 'Supervisora', correo: 'supervisor@local.test', rol: 'SUPERVISOR' as Rol },
        { nombre: 'Renata', apellido: 'RRHH', correo: 'rrhh@local.test', rol: 'RRHH' as Rol },
        ...['Andrea', 'Carlos', 'Lucía', 'Miguel', 'José'].map(nombre => ({ nombre, apellido: 'Asesor', correo: `${nombre.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()}@local.test`, rol: 'ASESOR' as Rol })),
      ] : []),
    ];
    for (const cuenta of cuentas) await db.usuario.upsert({ where: { correo: cuenta.correo }, create: { ...cuenta, passwordHash: hash }, update: {} });
    if (modoDemo) {
    const corporativo = await db.grupo.upsert({ where: { nombre: 'Ventas Corporativas' }, create: { nombre: 'Ventas Corporativas', descripcion: 'Consultas empresariales' }, update: {} });
    const productos = await db.grupo.upsert({ where: { nombre: 'Productos' }, create: { nombre: 'Productos', descripcion: 'Productos y cotizaciones' }, update: {} });
    for (const nombre of ['Andrea', 'Carlos', 'Lucía', 'Miguel', 'José']) {
      const usuario = await db.usuario.findUniqueOrThrow({ where: { correo: `${nombre.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()}@local.test` } });
      await db.asesor.upsert({ where: { usuarioId: usuario.id }, create: { usuarioId: usuario.id, grupoId: ['Andrea', 'Carlos', 'Lucía'].includes(nombre) ? productos.id : corporativo.id }, update: {} });
    }
    const opciones = [
      { titulo: 'Productos', identificadorExterno: 'productos', grupoId: productos.id, orden: 1 },
      { titulo: 'Cotizaciones', identificadorExterno: 'cotizaciones', grupoId: productos.id, orden: 2 },
      { titulo: 'Ventas corporativas', identificadorExterno: 'corporativas', grupoId: corporativo.id, orden: 3 },
      { titulo: 'Otros', identificadorExterno: 'otros', grupoId: corporativo.id, orden: 4 },
    ];
    for (const opcion of opciones) await db.opcionWhatsapp.upsert({ where: { identificadorExterno: opcion.identificadorExterno }, create: opcion, update: {} });
      await db.configuracionWhatsapp.upsert({ where: { id: 1 }, create: { id: 1, nombrePlantillaInicio: 'plantilla_inicio_demo', idiomaPlantillaInicio: 'es' }, update: {} });
      await db.canalWhatsapp.upsert({ where: { phoneNumberId: 'mock-repartidor' }, create: { tipo: 'REPARTIDOR', proveedor: 'MOCK', nombre: 'Repartidor demo', numeroVisible: 'DEMO-REPARTIDOR', phoneNumberId: 'mock-repartidor', wabaId: 'mock-waba', activo: true, estadoIntegracion: 'ACTIVO' }, update: {} });
      for (const nombre of ['Andrea', 'Carlos', 'Lucía', 'Miguel']) {
        const correo = `${nombre.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()}@local.test`;
        const asesor = await db.asesor.findFirstOrThrow({ where: { usuario: { correo } } });
        await db.canalWhatsapp.upsert({ where: { phoneNumberId: `mock-asesor-${asesor.id}` }, create: { tipo: 'ASESOR', proveedor: 'MOCK', nombre: `Canal demo ${nombre}`, numeroVisible: `DEMO-ASESOR-${asesor.id}`, phoneNumberId: `mock-asesor-${asesor.id}`, wabaId: 'mock-waba', asesorId: asesor.id, activo: true, modoCoexistencia: true, estadoIntegracion: 'ACTIVO' }, update: {} });
      }
    }
    console.log(JSON.stringify({ evento: 'seed_desarrollo_completo', usuarios: cuentas.map(c => c.correo), password: 'Valor de ADMIN_INICIAL_PASSWORD o contraseña local documentada' }));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error); process.exit(1); });
