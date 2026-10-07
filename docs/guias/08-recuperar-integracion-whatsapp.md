# 08. Recuperar integración WhatsApp

## Objetivo
Restablecer recepción, envío y sincronización sin perder el historial.

## Prerrequisitos y datos
Acceso ADMIN a NEXO, observabilidad del backend/cola, panel Meta y Phone Number ID del canal afectado.

## Pasos
1. Comprobar `/salud`, PostgreSQL, Redis y el estado del canal en **Canales WhatsApp**. Si la API está caída, restablecer infraestructura antes de cambiar Meta.
2. En Meta, revisar entregas de webhook, suscripción `messages`/`smb_message_echoes`, estado del número, permisos y token. Comparar `metadata.phone_number_id` con NEXO.
3. Si fallan solo envíos, validar Access Token, plantilla aprobada e idioma. Si fallan solo ecos, validar Coexistence y suscripción de eco.
4. Marcar el canal inactivo y al asesor no disponible si la incidencia compromete la atención. Reasignar solicitudes abiertas que requieran continuidad.
5. Corregir `.env` solo para credenciales globales; corregir IDs y estado de canal en NEXO. Reiniciar API si cambió `.env`.
6. Repetir la prueba de repartidor → solicitud → plantilla → respuesta → eco. Reactivar el canal y reparto al confirmar.

## Errores y seguridad
Los eventos se conservan con identificador externo para evitar duplicados. No borrar la base, la cola ni el canal para “reiniciar”. Si un evento falla reiteradamente, revisar su error sin imprimir secretos ni datos del cliente en incidencias públicas.
