# 01. Alta de asesor

## Objetivo
Habilitar a un asesor nuevo con su propio número WhatsApp Business para recibir solicitudes V2.

## Prerrequisitos y datos
Acceso ADMIN a NEXO; grupo operativo; nombre, correo y contraseña inicial del asesor; número visible, Phone Number ID y WABA ID obtenidos de Meta. Se necesita una plantilla de inicio aprobada y permisos del token global sobre ese número.

## Pasos
1. En **Usuarios**, crear una cuenta con rol **ASESOR**. Entregar la contraseña por un canal seguro y exigir su cambio.
2. En **Asesores**, asociar la cuenta al grupo. Dejar `activoReparto=false` y `disponible=false` hasta terminar la conexión.
3. En Meta, completar el alta de WhatsApp Business App + Cloud API mediante Coexistence, verificar que el número aparezca bajo la WABA y que la aplicación esté suscrita al webhook. Seguir [03](03-conectar-whatsapp-asesor-coexistence.md).
4. En **Canales WhatsApp**, crear un canal **ASESOR** con proveedor **META**, el asesor, número visible, Phone Number ID y WABA ID. Activar Coexistence solo si ese número realmente usa WhatsApp Business App junto a Cloud API. Inicialmente queda inactivo.
5. Validar en Meta los permisos y la recepción de `messages` y `smb_message_echoes`; después marcar integración **ACTIVO** y activar el canal en NEXO.
6. En **Asesores**, marcar disponible y activar reparto. Enviar una consulta de prueba al repartidor, comprobar la asignación y usar **Iniciar atención**.
7. Verificar que el cliente recibió la plantilla desde el número del asesor, que su respuesta y un mensaje enviado desde Business App aparecen en **Conversaciones**, y que otro asesor no puede ver el chat.

## Entornos
En mock, el seed crea cuatro canales de demostración. En Meta, el token y secretos siguen en `.env`; no se guardan en el canal. Si faltan permisos, revisar `META_WHATSAPP_ACCESS_TOKEN` en servidor y reiniciar la API tras corregirlo.

## Errores frecuentes
Un canal `MOCK`, sin Phone Number ID/WABA ID o sin estado ACTIVO no recibe reparto en modo Meta. Un asesor no disponible tampoco. Si la plantilla falla, confirmar nombre, idioma, estado aprobado y variables en Meta. No activar reparto hasta verificar el número. Si un asesor tenía solo un canal demo, su asignación anterior queda visible pero **Iniciar atención** exige primero un canal Meta válido.
