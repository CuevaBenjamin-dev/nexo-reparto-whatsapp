-- Clasifica los canales existentes sin desactivarlos ni cambiar sus IDs.
CREATE TYPE "ProveedorCanalWhatsapp" AS ENUM ('MOCK', 'META');
ALTER TABLE "canales_whatsapp" ADD COLUMN "proveedor" "ProveedorCanalWhatsapp" NOT NULL DEFAULT 'META';
UPDATE "canales_whatsapp" SET "proveedor" = 'MOCK'
WHERE "phone_number_id" LIKE 'mock-%'
   OR "waba_id" = 'mock-waba'
   OR "numero_visible" LIKE 'DEMO-%';

-- Cada modo puede conservar su repartidor y un canal por asesor sin cruzar flujos.
DROP INDEX "canal_repartidor_activo_unico";
DROP INDEX "canal_asesor_activo_unico";
CREATE UNIQUE INDEX "canal_repartidor_activo_unico" ON "canales_whatsapp"("tipo", "proveedor")
  WHERE "tipo" = 'REPARTIDOR' AND "activo" = true;
CREATE UNIQUE INDEX "canal_asesor_activo_unico" ON "canales_whatsapp"("asesor_id", "proveedor")
  WHERE "tipo" = 'ASESOR' AND "activo" = true AND "asesor_id" IS NOT NULL;
CREATE INDEX "canales_whatsapp_proveedor_tipo_activo_idx" ON "canales_whatsapp"("proveedor", "tipo", "activo");

-- La clasificación es opcional: consultas libres continúan en el conjunto general.
ALTER TABLE "solicitudes_reparto" ADD COLUMN "grupo_id" INTEGER;
ALTER TABLE "solicitudes_reparto" ADD CONSTRAINT "solicitudes_reparto_grupo_id_fkey"
  FOREIGN KEY ("grupo_id") REFERENCES "grupos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "solicitudes_reparto_grupo_id_estado_idx" ON "solicitudes_reparto"("grupo_id", "estado");
