# Arquitectura NEXO V2

## Punto de partida

NEXO V1 usa Next.js, NestJS, PostgreSQL/Prisma, Redis/BullMQ, sesiones y RBAC, un webhook Meta firmado, un proveedor mock/Meta, reparto transaccional por grupo y SSE. `conversaciones` representa el hilo del único número; `opciones_whatsapp` y `grupos` determinan el asesor. El usuario informa que el flujo Meta real V1 ya fue validado con un número de prueba. No se copian ni inspeccionan secretos para esta migración.

## Objetivo

Un canal `REPARTIDOR` recibe la primera consulta, crea una `solicitud_reparto`, la asigna al asesor disponible de menor contador y responde «En un momento lo atendemos». Cada asesor dispone de un canal `ASESOR` propio. El primer contacto desde ese canal usa una plantilla aprobada; los mensajes 1:1 posteriores pueden recibirse desde Meta y responderse desde NEXO dentro de la ventana de atención. Los envíos del asesor desde WhatsApp Business App se registran desde `smb_message_echoes`.

```text
Cliente → canal REPARTIDOR → solicitud_reparto → reparto → asesor
Asesor → canal ASESOR → plantilla → conversación 1:1 → cliente
Meta messages / smb_message_echoes / statuses → webhook firmado → BullMQ → conversación del canal
```

La documentación oficial de Meta describe `metadata.phone_number_id` en los webhooks y el endpoint de envío `/{Phone-Number-ID}/messages`; también distingue plantillas de texto libre fuera de la ventana de 24 horas ([webhook](https://www.postman.com/meta/whatsapp-business-platform/folder/tduohwq/webhook-payload-reference), [envío](https://www.postman.com/meta/whatsapp-business-platform/folder/13382743-ba8d099d-007e-4b52-b9f2-3cf3c60e4fbc), [ventana](https://www.postman.com/meta/whatsapp-business-platform/folder/fuaee8l/statuses-object)). El soporte de `smb_message_echoes` se implementa según la [referencia de Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/smb_message_echoes); la activación y validación reales de Coexistence dependen de los activos Meta del operador.

## Reutilización y cambios

| Área | Decisión |
|---|---|
| Autenticación, roles, auditoría, SSE, salud y Docker | Reutilizar y ampliar los eventos de asignación/canal. |
| Reparto | Reutilizar advisory lock y selección del mínimo. V1 y V2 comparten `contador_reparto` y por eso se serializan con un bloqueo global; V1 conserva además su bloqueo por grupo. Elegibilidad V2 exige usuario y asesor activos, disponibilidad y canal asesor activo. |
| Proveedor Meta/mock | Pasar `phone_number_id` del canal a cada envío. Añadir plantilla. El token y el App Secret siguen en variables del servidor. |
| Webhook y cola | Conservar HMAC sobre cuerpo RAW, registro idempotente y BullMQ; resolver cada evento por `metadata.phone_number_id`; aceptar `messages`, `smb_message_echoes`, estados y eventos desconocidos sin exponer contenido sensible en logs. |
| Conversaciones y mensajes | Añadir canal, solicitud y origen de mensaje. Filtrar acceso de asesor por canal propio; no mezclar hilos de números distintos. |
| Opciones y grupos V1 | Mantener tablas y flujo legado para datos históricos y compatibilidad; ocultarlos del flujo principal V2. |
| Interfaz | Añadir Asignaciones y Canales; adaptar bandeja y simulador sin rehacer el diseño general. |

## Migración de datos

Una migración versionada añade `canales_whatsapp`, `solicitudes_reparto`, `asignaciones_solicitud` y `configuracion_whatsapp` sin eliminar tablas ni filas V1. `conversaciones.canal_id` y `solicitud_reparto_id` son opcionales: los hilos V1 existentes conservan `NULL` y su significado original. Una solicitud puede enlazarse a varios hilos históricos cuando se reasigna. El índice V1 de una conversación operativa por contacto se sustituye por índices parciales: uno mantiene esa regla para filas legadas (`canal_id IS NULL`) y otro permite una conversación operativa por contacto **y canal** V2 (`canal_id IS NOT NULL`). Se añaden índices y restricciones de unicidad para `phone_number_id`, número visible, canal asesor activo y solicitud operativa; no se borran contactos, mensajes, asignaciones ni auditorías.

`mensajes.origen` distingue `NEXO`, `WHATSAPP_BUSINESS_APP`, `CLIENTE` y `SISTEMA`; se rellena para filas V1 según dirección/tipo. Los contactos se normalizan al registrar nuevos eventos. Los contactos históricos no se fusionan automáticamente porque podría haber colisiones o diferencias de identidad; la migración no altera su historial.

La migración `202610070001_proveedor_canal` añade el proveedor `MOCK | META` a cada canal. Clasifica los canales demo reconocibles durante la migración; los demás, incluido un repartidor Meta ya registrado, quedan `META` sin cambiar su estado ni sus IDs. Los índices permiten un canal activo por asesor y proveedor, y un repartidor activo por proveedor. El modo de ejecución filtra el proveedor en reparto, entradas, inicio y envío; un canal mock nunca puede suministrar el Phone Number ID a Graph API en modo Meta. Si no hay asesor Meta elegible, la solicitud permanece `NUEVA` sin incrementar contadores. Coexistence es opcional para un canal Meta de asesor.

`solicitudes_reparto.grupo_id` permite usar una opción/grupo existente cuando el cliente envía su identificador o título exacto. Las consultas libres conservan el reparto general sin mostrar el menú legado V1. `canal_origen_id`, `canal_asesor_id` y los hilos enlazados representan ambos números dentro del mismo proceso comercial. La bandeja identifica el proceso y permite pasar del hilo del repartidor al hilo del asesor; el asesor puede consultar la entrada original, pero solo responde desde su canal propio.

## Límites operativos

- El primer contacto y cualquier envío fuera de la ventana del canal asesor requieren una plantilla configurada y aprobada. NEXO bloquea texto libre si no existe un mensaje entrante del cliente en las últimas 24 horas para ese canal.
- El webhook responde rápido y el trabajo de dominio pasa por BullMQ. Eventos desconocidos quedan trazados y no generan HTTP 500.
- La V2 cubre texto 1:1, plantillas y ecos de WhatsApp Business App. La importación `history` y `smb_app_state_sync` queda preparada como evento registrado, sin sincronización obligatoria.
- Coexistence real requiere onboarding y suscripción `messages`/`smb_message_echoes` en Meta; el código y los fixtures mock no prueban por sí solos esa activación.
