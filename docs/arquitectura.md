# Arquitectura

Cliente WhatsApp → Meta Cloud API → webhook NestJS → evento idempotente en PostgreSQL → BullMQ/Redis → procesamiento → motor de reparto → conversación/mensajes. El asesor responde por Next.js → API NestJS → proveedor de WhatsApp (`mock` o `meta`). Nunca se entregan tokens Meta al navegador.

El modo mock usa las mismas entidades y el mismo motor de reparto. El simulador invoca `/simulador/entrada` y lee `/simulador/:telefono`; se bloquea fuera de desarrollo o en modo Meta.

NestJS usa sesiones persistidas en PostgreSQL con token aleatorio guardado como HMAC-SHA-256, firmado mediante cookie HttpOnly, SameSite Strict y Secure en producción. Las mutaciones web exigen `Origin` igual a `WEB_URL`. El login se limita con Redis. Los roles se comprueban en backend; un asesor filtra por `asesor.usuario_id` también en las lecturas por ID. SSE `/tiempo-real/eventos` usa la sesión y limita eventos a sus destinatarios. La V1 ejecuta una sola instancia API para mantener la publicación SSE en memoria.

Los webhooks Meta validan `X-Hub-Signature-256` sobre `rawBody`, persisten el identificador externo y encolan con BullMQ. El worker se ejecuta dentro del proceso API. La cola recupera eventos pendientes al arrancar. Un evento ya procesado no vuelve a crear mensajes ni asignaciones.

Los servicios principales son `ServicioEntradas`, `ServicioReparto`, `ServicioConversaciones`, `ProveedorWhatsAppMock` y `ProveedorWhatsAppMeta`. Los controles administrativos registran auditoría.
