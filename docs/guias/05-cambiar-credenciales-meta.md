# 05. Cambiar credenciales de Meta

## Objetivo
Actualizar los secretos globales sin escribirlos en base de datos, repositorio ni registros.

## Prerrequisitos y datos
ADMIN técnico del servidor y Meta; nuevo Access Token, App Secret o Verify Token; inventario de las WABA y números servidos por el token.

## Pasos
1. Comprobar en Meta que el nuevo token tendrá permisos para **todos** los Phone Number IDs activos. Preparar una ventana de mantenimiento y conservar una vía de reversión.
2. Cambiar `META_WHATSAPP_ACCESS_TOKEN`, `META_APP_SECRET` o `META_WEBHOOK_VERIFY_TOKEN` en el gestor de secretos o `.env` privado del backend. No compartir sus valores por chat ni introducirlos en NEXO.
3. Si cambia Verify Token, actualizar el mismo valor en la configuración del webhook de Meta y repetir la verificación GET.
4. Reiniciar o redesplegar la API. Revisar `/salud`, un mensaje repartidor, una plantilla asesor y estados de entrega.
5. Revocar el token anterior en Meta solo después de comprobar el nuevo. Seguir [07](07-rotar-access-token.md) para rotación detallada.

## Errores frecuentes
401/403 al enviar suele indicar token, permisos o activo incorrecto. Una firma rechazada indica App Secret incorrecto para esa aplicación. `META_GRAPH_API_VERSION` se cambia solo tras verificar compatibilidad de la versión elegida.
