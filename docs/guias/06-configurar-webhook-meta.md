# 06. Configurar el webhook de Meta

## Objetivo
Entregar a NEXO eventos entrantes y ecos por cada Phone Number ID activo.

## Prerrequisitos y datos
API pública HTTPS, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, acceso a la app y WABA en Meta. URL: `https://<DOMINIO_API>/webhooks/meta/whatsapp`.

## Pasos
1. Configurar en el servidor `WHATSAPP_MODE=meta`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_WHATSAPP_ACCESS_TOKEN` y `META_GRAPH_API_VERSION`. Reiniciar la API y comprobar `/salud`.
2. En Meta, registrar la URL de callback y el Verify Token correspondiente. Meta hará GET de verificación con `hub.challenge`.
3. Suscribir la aplicación a `messages` y `smb_message_echoes` en las WABA correspondientes. Confirmar en Meta los activos y permisos de cada número.
4. Enviar un mensaje de cliente a cada número. Revisar que `metadata.phone_number_id` coincida con el canal configurado en NEXO.
5. Enviar desde WhatsApp Business App de un asesor y comprobar el eco, estado y origen en su conversación NEXO.
6. Probar firma inválida: NEXO debe rechazar el POST. Un evento válido pero no conocido se registra y se responde sin error.

## Diagnóstico
No publicar App Secret o Verify Token. Si Meta informa fallo de verificación, revisar URL, HTTPS, token y accesibilidad. Si hay 403 en POST, comparar App Secret y cabecera `X-Hub-Signature-256`. Si un número no se enruta, revisar su Phone Number ID en **Canales WhatsApp**.
