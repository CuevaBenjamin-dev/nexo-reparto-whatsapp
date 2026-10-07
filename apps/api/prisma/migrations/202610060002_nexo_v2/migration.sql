-- V2 es aditiva: conserva todas las filas y relaciones V1.
CREATE TYPE "TipoCanalWhatsapp" AS ENUM ('REPARTIDOR', 'ASESOR');
CREATE TYPE "EstadoIntegracion" AS ENUM ('PENDIENTE_CONFIGURACION', 'ACTIVO', 'INACTIVO', 'ERROR');
CREATE TYPE "EstadoSolicitudReparto" AS ENUM ('NUEVA', 'ASIGNADA', 'CONTACTO_INICIADO', 'EN_ATENCION', 'CERRADA', 'CANCELADA');
CREATE TYPE "OrigenMensaje" AS ENUM ('NEXO', 'WHATSAPP_BUSINESS_APP', 'CLIENTE', 'SISTEMA');
ALTER TYPE "TipoMensaje" ADD VALUE 'PLANTILLA';
ALTER TABLE "asesores" ADD COLUMN "disponible" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "canales_whatsapp" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "tipo" "TipoCanalWhatsapp" NOT NULL,
    "nombre" TEXT NOT NULL,
    "numero_visible" TEXT,
    "phone_number_id" TEXT,
    "waba_id" TEXT,
    "asesor_id" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT false,
    "modo_coexistencia" BOOLEAN NOT NULL DEFAULT false,
    "estado_integracion" "EstadoIntegracion" NOT NULL DEFAULT 'PENDIENTE_CONFIGURACION',
    "fecha_alta" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_baja" TIMESTAMP(3),
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "canales_whatsapp_asesor_id_fkey" FOREIGN KEY ("asesor_id") REFERENCES "asesores"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "canal_activo_configurado" CHECK (NOT "activo" OR ("numero_visible" IS NOT NULL AND "phone_number_id" IS NOT NULL AND ("tipo" = 'REPARTIDOR' OR "asesor_id" IS NOT NULL))),
    CONSTRAINT "canal_repartidor_sin_asesor" CHECK ("tipo" <> 'REPARTIDOR' OR "asesor_id" IS NULL)
);
CREATE UNIQUE INDEX "canales_whatsapp_numero_visible_key" ON "canales_whatsapp"("numero_visible");
CREATE UNIQUE INDEX "canales_whatsapp_phone_number_id_key" ON "canales_whatsapp"("phone_number_id");
CREATE INDEX "canales_whatsapp_asesor_id_activo_idx" ON "canales_whatsapp"("asesor_id", "activo");
CREATE UNIQUE INDEX "canal_repartidor_activo_unico" ON "canales_whatsapp"("tipo") WHERE "tipo" = 'REPARTIDOR' AND "activo" = true;
CREATE UNIQUE INDEX "canal_asesor_activo_unico" ON "canales_whatsapp"("asesor_id") WHERE "tipo" = 'ASESOR' AND "activo" = true AND "asesor_id" IS NOT NULL;

CREATE TABLE "solicitudes_reparto" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "contacto_id" INTEGER NOT NULL,
    "canal_origen_id" INTEGER NOT NULL,
    "asesor_id" INTEGER,
    "canal_asesor_id" INTEGER,
    "id_externo_origen" TEXT NOT NULL,
    "contenido_inicial" TEXT NOT NULL,
    "estado" "EstadoSolicitudReparto" NOT NULL DEFAULT 'NUEVA',
    "fecha_recepcion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_asignacion" TIMESTAMP(3),
    "fecha_primer_contacto" TIMESTAMP(3),
    "fecha_cierre" TIMESTAMP(3),
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "solicitudes_reparto_contacto_id_fkey" FOREIGN KEY ("contacto_id") REFERENCES "contactos"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "solicitudes_reparto_canal_origen_id_fkey" FOREIGN KEY ("canal_origen_id") REFERENCES "canales_whatsapp"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "solicitudes_reparto_asesor_id_fkey" FOREIGN KEY ("asesor_id") REFERENCES "asesores"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "solicitudes_reparto_canal_asesor_id_fkey" FOREIGN KEY ("canal_asesor_id") REFERENCES "canales_whatsapp"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "solicitudes_reparto_id_externo_origen_key" ON "solicitudes_reparto"("id_externo_origen");
CREATE UNIQUE INDEX "solicitud_operativa_contacto_canal_unica" ON "solicitudes_reparto"("contacto_id", "canal_origen_id") WHERE "estado" NOT IN ('CERRADA', 'CANCELADA');
CREATE INDEX "solicitudes_reparto_asesor_id_estado_fecha_recepcion_idx" ON "solicitudes_reparto"("asesor_id", "estado", "fecha_recepcion");
CREATE INDEX "solicitudes_reparto_contacto_id_estado_idx" ON "solicitudes_reparto"("contacto_id", "estado");
CREATE INDEX "solicitudes_reparto_canal_origen_id_estado_idx" ON "solicitudes_reparto"("canal_origen_id", "estado");

CREATE TABLE "asignaciones_solicitud" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "solicitud_id" INTEGER NOT NULL,
    "asesor_id" INTEGER NOT NULL,
    "tipo" "TipoAsignacion" NOT NULL,
    "asignado_por_usuario_id" INTEGER,
    "motivo" TEXT,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asignaciones_solicitud_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes_reparto"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "asignaciones_solicitud_asesor_id_fkey" FOREIGN KEY ("asesor_id") REFERENCES "asesores"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "asignaciones_solicitud_asignado_por_usuario_id_fkey" FOREIGN KEY ("asignado_por_usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "asignaciones_solicitud_solicitud_id_fecha_creacion_idx" ON "asignaciones_solicitud"("solicitud_id", "fecha_creacion");

CREATE TABLE "configuracion_whatsapp" (
    "id" INTEGER NOT NULL DEFAULT 1 PRIMARY KEY,
    "nombre_plantilla_inicio" TEXT,
    "idioma_plantilla_inicio" TEXT NOT NULL DEFAULT 'es',
    "mensaje_espera" TEXT NOT NULL DEFAULT 'En un momento lo atendemos.',
    "fecha_actualizacion" TIMESTAMP(3) NOT NULL
);

ALTER TABLE "conversaciones" ADD COLUMN "canal_id" INTEGER;
ALTER TABLE "conversaciones" ADD COLUMN "solicitud_reparto_id" INTEGER;
ALTER TABLE "conversaciones" ADD COLUMN "fecha_ultimo_cliente" TIMESTAMP(3);
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_canal_id_fkey" FOREIGN KEY ("canal_id") REFERENCES "canales_whatsapp"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_solicitud_reparto_id_fkey" FOREIGN KEY ("solicitud_reparto_id") REFERENCES "solicitudes_reparto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "conversaciones_solicitud_reparto_id_idx" ON "conversaciones"("solicitud_reparto_id");
CREATE INDEX "conversaciones_canal_id_estado_fecha_ultimo_mensaje_idx" ON "conversaciones"("canal_id", "estado", "fecha_ultimo_mensaje");
CREATE INDEX "conversaciones_contacto_id_canal_id_estado_idx" ON "conversaciones"("contacto_id", "canal_id", "estado");
DROP INDEX "conversaciones_contacto_operativa_unica";
CREATE UNIQUE INDEX "conversaciones_contacto_legado_operativa_unica" ON "conversaciones"("contacto_id") WHERE "canal_id" IS NULL AND "estado" <> 'CERRADA';
CREATE UNIQUE INDEX "conversaciones_contacto_canal_operativa_unica" ON "conversaciones"("contacto_id", "canal_id") WHERE "canal_id" IS NOT NULL AND "estado" <> 'CERRADA';

ALTER TABLE "mensajes" ADD COLUMN "origen" "OrigenMensaje" NOT NULL DEFAULT 'SISTEMA';
UPDATE "mensajes" SET "origen" = CASE WHEN "direccion" = 'ENTRANTE' THEN 'CLIENTE'::"OrigenMensaje" WHEN "tipo" = 'INTERACTIVO' THEN 'SISTEMA'::"OrigenMensaje" ELSE 'NEXO'::"OrigenMensaje" END;
