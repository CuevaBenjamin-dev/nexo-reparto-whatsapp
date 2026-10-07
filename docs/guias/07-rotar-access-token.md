# 07. Rotar Access Token

## Objetivo
Sustituir `META_WHATSAPP_ACCESS_TOKEN` sin cortar la atención de todos los canales.

## Prerrequisitos y datos
Acceso seguro a Meta y al servidor; token nuevo con permisos y acceso a todas las WABA/números activos; plan de reversión.

## Pasos
1. En Meta, emitir un token nuevo conforme a la política vigente y validar sus permisos sobre cada Phone Number ID activo. No revocar todavía el anterior.
2. Guardar el token nuevo en el gestor de secretos o `.env` privado como `META_WHATSAPP_ACCESS_TOKEN`. Reiniciar solo la API.
3. Comprobar `/salud`. Enviar una respuesta automática desde el repartidor y una plantilla desde cada canal asesor representativo. Revisar estados y errores de Meta.
4. Si todo funciona, revocar el token anterior en Meta. Registrar fecha de rotación en el sistema de gestión de credenciales de la organización.
5. Si falla, restaurar el token anterior de forma segura, reiniciar API y verificar de nuevo.

## NEXO y errores
Los canales no cambian durante la rotación. No pegar el token en **Canales WhatsApp** ni en auditoría. Un error 401/403 exige revisar permisos del token y propiedad de los activos antes de reintentar.
