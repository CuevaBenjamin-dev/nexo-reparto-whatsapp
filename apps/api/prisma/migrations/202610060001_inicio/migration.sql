-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'SUPERVISOR', 'RRHH', 'ASESOR');

-- CreateEnum
CREATE TYPE "EstadoConversacion" AS ENUM ('ESPERANDO_OPCION', 'PENDIENTE_ASIGNACION', 'ABIERTA', 'CERRADA');

-- CreateEnum
CREATE TYPE "DireccionMensaje" AS ENUM ('ENTRANTE', 'SALIENTE');

-- CreateEnum
CREATE TYPE "TipoMensaje" AS ENUM ('TEXTO', 'INTERACTIVO', 'IMAGEN', 'DOCUMENTO', 'AUDIO', 'VIDEO', 'UBICACION');

-- CreateEnum
CREATE TYPE "EstadoEnvio" AS ENUM ('PENDIENTE', 'ENVIADO', 'ENTREGADO', 'LEIDO', 'FALLIDO');

-- CreateEnum
CREATE TYPE "TipoAsignacion" AS ENUM ('AUTOMATICA', 'MANUAL', 'REASIGNACION');

-- CreateEnum
CREATE TYPE "EstadoEvento" AS ENUM ('PENDIENTE', 'PROCESANDO', 'PROCESADO', 'FALLIDO');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "debe_cambiar_contrasena" BOOLEAN NOT NULL DEFAULT false,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesiones" (
    "id" UUID NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "vence_en" TIMESTAMP(3) NOT NULL,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sesiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grupos" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grupos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asesores" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "grupo_id" INTEGER NOT NULL,
    "activo_reparto" BOOLEAN NOT NULL DEFAULT true,
    "contador_reparto" INTEGER NOT NULL DEFAULT 0,
    "total_asignaciones" INTEGER NOT NULL DEFAULT 0,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asesores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opciones_whatsapp" (
    "id" SERIAL NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "identificador_externo" TEXT NOT NULL,
    "grupo_id" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opciones_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contactos" (
    "id" SERIAL NOT NULL,
    "telefono" TEXT NOT NULL,
    "nombre" TEXT,
    "wa_id" TEXT NOT NULL,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contactos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversaciones" (
    "id" SERIAL NOT NULL,
    "contacto_id" INTEGER NOT NULL,
    "grupo_id" INTEGER,
    "asesor_id" INTEGER,
    "estado" "EstadoConversacion" NOT NULL DEFAULT 'ESPERANDO_OPCION',
    "fecha_inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_cierre" TIMESTAMP(3),
    "fecha_ultimo_mensaje" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensajes" (
    "id" SERIAL NOT NULL,
    "conversacion_id" INTEGER NOT NULL,
    "id_externo_whatsapp" TEXT,
    "direccion" "DireccionMensaje" NOT NULL,
    "tipo" "TipoMensaje" NOT NULL DEFAULT 'TEXTO',
    "contenido" TEXT NOT NULL,
    "estado_envio" "EstadoEnvio",
    "fecha_whatsapp" TIMESTAMP(3),
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensajes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asignaciones" (
    "id" SERIAL NOT NULL,
    "conversacion_id" INTEGER NOT NULL,
    "asesor_id" INTEGER NOT NULL,
    "grupo_id" INTEGER NOT NULL,
    "tipo" "TipoAsignacion" NOT NULL,
    "asignado_por_usuario_id" INTEGER,
    "motivo" TEXT,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asignaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_whatsapp" (
    "id" SERIAL NOT NULL,
    "identificador_externo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "estado" "EstadoEvento" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eventos_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidad_id" TEXT NOT NULL,
    "datos" JSONB,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_correo_key" ON "usuarios"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "sesiones_token_hash_key" ON "sesiones"("token_hash");

-- CreateIndex
CREATE INDEX "sesiones_usuario_id_vence_en_idx" ON "sesiones"("usuario_id", "vence_en");

-- CreateIndex
CREATE UNIQUE INDEX "grupos_nombre_key" ON "grupos"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "asesores_usuario_id_key" ON "asesores"("usuario_id");

-- CreateIndex
CREATE INDEX "asesores_grupo_id_activo_reparto_contador_reparto_idx" ON "asesores"("grupo_id", "activo_reparto", "contador_reparto");

-- CreateIndex
CREATE UNIQUE INDEX "opciones_whatsapp_identificador_externo_key" ON "opciones_whatsapp"("identificador_externo");

-- CreateIndex
CREATE INDEX "opciones_whatsapp_activo_orden_idx" ON "opciones_whatsapp"("activo", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "contactos_telefono_key" ON "contactos"("telefono");

-- CreateIndex
CREATE UNIQUE INDEX "contactos_wa_id_key" ON "contactos"("wa_id");

-- CreateIndex
CREATE INDEX "conversaciones_asesor_id_estado_fecha_ultimo_mensaje_idx" ON "conversaciones"("asesor_id", "estado", "fecha_ultimo_mensaje");

-- CreateIndex
CREATE INDEX "conversaciones_contacto_id_estado_idx" ON "conversaciones"("contacto_id", "estado");

-- CreateIndex
CREATE INDEX "conversaciones_grupo_id_estado_idx" ON "conversaciones"("grupo_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "mensajes_id_externo_whatsapp_key" ON "mensajes"("id_externo_whatsapp");

-- CreateIndex
CREATE INDEX "mensajes_conversacion_id_fecha_creacion_idx" ON "mensajes"("conversacion_id", "fecha_creacion");

-- CreateIndex
CREATE INDEX "asignaciones_conversacion_id_fecha_creacion_idx" ON "asignaciones"("conversacion_id", "fecha_creacion");

-- CreateIndex
CREATE UNIQUE INDEX "eventos_whatsapp_identificador_externo_key" ON "eventos_whatsapp"("identificador_externo");

-- CreateIndex
CREATE INDEX "eventos_whatsapp_estado_fecha_creacion_idx" ON "eventos_whatsapp"("estado", "fecha_creacion");

-- CreateIndex
CREATE INDEX "auditoria_fecha_idx" ON "auditoria"("fecha");

-- AddForeignKey
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asesores" ADD CONSTRAINT "asesores_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asesores" ADD CONSTRAINT "asesores_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opciones_whatsapp" ADD CONSTRAINT "opciones_whatsapp_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_contacto_id_fkey" FOREIGN KEY ("contacto_id") REFERENCES "contactos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_asesor_id_fkey" FOREIGN KEY ("asesor_id") REFERENCES "asesores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_conversacion_id_fkey" FOREIGN KEY ("conversacion_id") REFERENCES "conversaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignaciones" ADD CONSTRAINT "asignaciones_conversacion_id_fkey" FOREIGN KEY ("conversacion_id") REFERENCES "conversaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignaciones" ADD CONSTRAINT "asignaciones_asesor_id_fkey" FOREIGN KEY ("asesor_id") REFERENCES "asesores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignaciones" ADD CONSTRAINT "asignaciones_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignaciones" ADD CONSTRAINT "asignaciones_asignado_por_usuario_id_fkey" FOREIGN KEY ("asignado_por_usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Una sola conversación operativa por contacto, incluso con entradas concurrentes.
CREATE UNIQUE INDEX "conversaciones_contacto_operativa_unica"
ON "conversaciones" ("contacto_id") WHERE "estado" <> 'CERRADA';
