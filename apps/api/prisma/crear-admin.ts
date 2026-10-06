import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

async function main() {
  const correo = process.env.ADMIN_INICIAL_CORREO?.trim().toLowerCase();
  const password = process.env.ADMIN_INICIAL_PASSWORD;
  if (!correo || !password || password.length < 12) throw new Error('Define ADMIN_INICIAL_CORREO y ADMIN_INICIAL_PASSWORD (mínimo 12 caracteres)');
  const db = new PrismaClient();
  try {
    const existente = await db.usuario.findFirst({ where: { rol: 'ADMIN' } });
    if (existente) throw new Error('Ya existe un administrador; no se creará otro por bootstrap');
    await db.usuario.create({ data: { nombre: 'Administrador', apellido: 'Inicial', correo, passwordHash: await argon2.hash(password, { type: argon2.argon2id }), rol: 'ADMIN' } });
    console.log('Administrador inicial creado. Protege la contraseña configurada y cámbiala si fue temporal.');
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Error al crear administrador'); process.exit(1); });
