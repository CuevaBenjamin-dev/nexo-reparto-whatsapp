# Modelo de datos

El esquema está en `apps/api/prisma/schema.prisma`; la migración SQL versionada está en `apps/api/prisma/migrations/202610060001_inicio/migration.sql`.

| Tabla | Uso |
|---|---|
| `usuarios`, `sesiones` | Cuentas, roles y sesiones revocables |
| `grupos`, `asesores`, `opciones_whatsapp` | Organización, disponibilidad, contadores y menú |
| `contactos`, `conversaciones`, `mensajes` | Historial comercial |
| `asignaciones` | Historial de reparto y reasignación |
| `eventos_whatsapp` | Idempotencia y trazabilidad de webhooks |
| `auditoria` | Acciones administrativas |

Las tablas y campos del dominio usan español. `id_externo_whatsapp` y `identificador_externo` son únicos. Un índice único parcial impide más de una conversación con estado distinto de `CERRADA` por contacto. Las consultas frecuentes tienen índices por asesor/estado, contacto/estado, grupo/estado, fecha de mensajes y elegibilidad del asesor.

`contador_reparto` dirige el balanceo acumulativo; `total_asignaciones` conserva una métrica histórica. La reasignación manual incrementa ambos contadores del destinatario para considerar su carga, sin alterar el historial previo. Desactivar un asesor solo impide nuevas asignaciones.
