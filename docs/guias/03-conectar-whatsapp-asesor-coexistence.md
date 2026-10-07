# 03. Conectar WhatsApp Business del asesor con Coexistence

## Objetivo
Vincular un número de asesor a WhatsApp Business App y Cloud API para sincronizar mensajes nuevos con NEXO.

## Prerrequisitos y datos
Número y teléfono del asesor, cuenta Meta Business/WABA administrable, Phone Number ID, WABA ID, acceso a la app Meta y token con permisos sobre ese activo. Confirmar las condiciones vigentes de Coexistence en Meta antes de vincular un número real.

## Pasos
1. En Meta, seguir el flujo oficial de registro de WhatsApp Business App + Cloud API para el número. Completar la verificación solicitada allí; no ejecutar pasos de desvinculación o migración sin revisar su impacto.
2. Registrar el webhook HTTPS de NEXO y suscribir la app a `messages` y `smb_message_echoes` para la WABA. Véase [06](06-configurar-webhook-meta.md).
3. En NEXO, crear el canal **ASESOR** inactivo con `modoCoexistencia=true`, número visible, Phone Number ID, WABA ID y asesor vinculado.
4. Confirmar que un mensaje del cliente al número del asesor llega con `metadata.phone_number_id` correcto; comprobar que un mensaje escrito en Business App llega como eco y figura con origen `WHATSAPP_BUSINESS_APP`.
5. Configurar en **Canales WhatsApp** una plantilla de inicio aprobada con idioma y dos parámetros. Tras validar envío, activar el canal y luego el reparto.
6. Desde NEXO enviar una respuesta tras recibir mensaje del cliente y confirmar que sale por el Phone Number ID del asesor. Revisar estados `sent`, `delivered` y `read` cuando Meta los emita.

## Configuración y diagnóstico
Los IDs del número no son secretos y van en NEXO. `META_WHATSAPP_ACCESS_TOKEN`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` y `META_GRAPH_API_VERSION` van en `.env` del backend. La sincronización inicial de historial (`history`, `smb_app_state_sync`) no forma parte del flujo V2 verificado. Si faltan ecos, comprobar suscripción de campo, permisos del activo y entrega de webhooks en Meta.

**Estado:** pendiente de validación con números Meta reales; el flujo mock y los fixtures no prueban la elegibilidad real de Coexistence.
