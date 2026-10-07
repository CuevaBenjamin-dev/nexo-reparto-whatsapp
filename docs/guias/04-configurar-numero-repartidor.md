# 04. Configurar el número repartidor

## Objetivo
Recibir nuevas consultas por un número base, asignarlas y responder “En un momento lo atendemos.”

## Prerrequisitos y datos
ADMIN en NEXO; número habilitado en Cloud API, Phone Number ID, WABA ID y token global autorizado. Al menos un asesor activo, disponible y con canal asesor operativo.

## Pasos
1. En Meta, habilitar el número base y confirmar su Phone Number ID. Suscribir `messages` al webhook HTTPS de NEXO.
2. En **Canales WhatsApp**, crear un canal **REPARTIDOR** sin asesor vinculado. Registrar número visible, Phone Number ID y WABA ID; dejarlo inactivo hasta probar la integración.
3. Confirmar en Meta que llegan mensajes firmados y que el token puede responder desde ese número. Marcar integración ACTIVO y activar el canal en NEXO. Solo puede haber uno activo.
4. Enviar un mensaje de prueba al repartidor. NEXO crea una solicitud, asigna asesor elegible y responde con el texto configurado. No aparece el menú V1.
5. Verificar la solicitud en **Asignaciones** y la respuesta automática en **Conversaciones** con canal repartidor.

## Configuración y errores
El texto se edita en **Canales WhatsApp → Primer contacto**. Las credenciales globales siguen en `.env` del backend. Si no hay asesor elegible, la solicitud queda NUEVA para reparto manual posterior; el cliente recibe igualmente la confirmación.
