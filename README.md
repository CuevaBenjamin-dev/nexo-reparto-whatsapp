# NEXO V2 — reparto de consultas por WhatsApp

NEXO recibe consultas en un número **repartidor**, crea una solicitud independiente y la asigna de forma equitativa a un asesor activo y disponible con canal propio. El asesor inicia el contacto desde su número mediante una plantilla aprobada y continúa desde NEXO o WhatsApp Business App. Los mensajes de cliente, NEXO y Business App se muestran en el chat del canal correspondiente. La bandeja V1 de número único y menú se conserva como flujo legado para datos existentes.

## Arquitectura

- `apps/web`: Next.js, TypeScript y Tailwind; Asignaciones, Conversaciones, Canales WhatsApp, gestión y simulador.
- `apps/api`: NestJS, Prisma, PostgreSQL, Redis/BullMQ, webhook firmado, proveedor Meta/mock, RBAC y eventos SSE.
- `canales_whatsapp`: número repartidor y números asesores, configurables por ADMIN sin secretos en la base.
- `solicitudes_reparto`: recepción, asignación, primer contacto y cierre. `conversaciones` y `mensajes` guardan cada chat por canal; una solicitud puede conservar varios hilos históricos si se reasigna.
- `docs/arquitectura-NEXO-v2.md`: análisis de V1, componentes reutilizados y migración aditiva. [Guías operativas](docs/guias/01-alta-asesor.md).

La migración `202610060002_nexo_v2` añade tablas, enums y columnas; mantiene usuarios, asesores, conversaciones, mensajes y auditoría V1. Las conversaciones legadas tienen `canal_id NULL`. Respaldar y probar la restauración antes de aplicarla a una base productiva. No usar `prisma db push` ni `docker compose down -v` sobre datos que se deseen conservar.

La migración `202610070001_proveedor_canal` clasifica los canales existentes como `MOCK` o `META` sin cambiar sus números, estado ni historial. Los IDs demo conocidos quedan en `MOCK`; los demás quedan en `META`. También permite conservar un repartidor y un canal por asesor para cada proveedor. No crea esquemas PostgreSQL ni reinicia la base.

## Inicio local

Requisitos: Docker Engine y Docker Compose v2. Sin Docker: Node 22+, npm, PostgreSQL 16 y Redis 7.

```bash
docker compose up --build -d
docker compose ps
```

El contenedor API aplica migraciones y ejecuta el seed solo si `NODE_ENV` no es `production`. Esperar a que `api` y `web` aparezcan saludables. Valores predeterminados: web `http://localhost:3001`, API `http://localhost:4000`, salud `http://localhost:4000/salud`. El puerto web cambia con `WEB_HOST_PORT` y el API con `API_HOST_PORT`; configurar también `WEB_URL` y `API_URL` para el navegador. PostgreSQL y Redis no se exponen al host.

Si ya existe una V1 local con Meta real, no ejecutar el comando anterior sobre su proyecto Compose. Usar otro nombre de proyecto, puertos y volumen de base separados. El archivo privado `.env.v2-test` usado durante desarrollo muestra ese patrón y está ignorado por Git.

## Variables

Ver [.env.example](.env.example). En modo `mock`, el seed crea un repartidor y cuatro canales asesores sintéticos para Andrea, Carlos, Lucía y Miguel; la arquitectura no limita la cantidad de asesores. El quinto asesor legado permanece sin canal V2. En modo `meta`, el seed no crea ni reactiva canales demo; si no se proporcionó `ADMIN_INICIAL_PASSWORD`, sale sin cambios. Los nombres, IDs y números reales se registran desde **Canales WhatsApp**.

En modo `meta`, configurar como secretos del backend `META_WHATSAPP_ACCESS_TOKEN`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` y `META_GRAPH_API_VERSION`. La configuración V1 opcional `META_WHATSAPP_PHONE_NUMBER_ID` solo se usa como fallback para el flujo legado. Configurar también `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`, `COOKIE_SECRET`, `WEB_URL`, `API_URL` y `WHATSAPP_MODE`. En producción usar HTTPS, secretos aleatorios robustos y `NODE_ENV=production`; el seed de demostración está bloqueado.

Un canal `MOCK` nunca participa en el flujo V2 cuando `WHATSAPP_MODE=meta`. Para que un asesor sea elegible en Meta necesita un canal `META` activo con integración `ACTIVO`, número visible, Phone Number ID y WABA ID. Coexistence es opcional: permite ecos de WhatsApp Business App, pero el asesor puede atender desde NEXO con Cloud API sin él. Si no hay asesores elegibles, la solicitud queda `NUEVA`, el repartidor envía la respuesta de espera y ningún contador aumenta. Una asignación anterior que apuntaba a un canal demo puede iniciar atención desde el canal Meta válido del mismo asesor; si no existe, NEXO responde 409 antes de llamar a Graph API.

Las opciones/grupos existentes pueden clasificar una consulta si el cliente envía un identificador o título coincidente; las consultas libres siguen en el conjunto general. V2 no envía el menú V1 al repartidor. La solicitud conserva canal de entrada y canal de atención, y sus conversaciones enlazadas muestran el proceso comercial completo.

El token global debe tener acceso a todos los números gestionados. Phone Number ID, WABA ID y número visible de cada canal se almacenan en PostgreSQL; los secretos no. La plantilla de primer contacto se configura en NEXO con nombre e idioma. Debe estar aprobada en Meta y usar dos parámetros: nombre del cliente y del asesor.

## Cuentas demo y recorrido mock

| Rol | Correo |
|---|---|
| ADMIN | `admin@local.test` |
| SUPERVISOR | `supervisor@local.test` |
| RRHH | `rrhh@local.test` |
| ASESORES | `andrea@local.test`, `carlos@local.test`, `lucia@local.test`, `miguel@local.test` |

Solo para desarrollo, la contraseña seed predeterminada es `DemoLocal!2026` o `ADMIN_INICIAL_PASSWORD`. El seed no sobrescribe contraseñas existentes.

1. Entrar como ADMIN y abrir **Simulador → Flujo multicanal V2**. Enviar un mensaje desde un cliente ficticio al repartidor.
2. Revisar la respuesta “En un momento lo atendemos.” y la solicitud ASIGNADA en **Asignaciones**. No aparece el menú V1.
3. Entrar como el asesor asignado, pulsar **Iniciar atención** y ver la plantilla en su conversación.
4. En el simulador seleccionar su canal asesor; simular una respuesta del cliente y un eco de **Business App**. Comprobar los orígenes en el chat.
5. Responder desde NEXO; otro asesor no debe poder abrir ese hilo. ADMIN puede verlo y reasignar solicitudes.
6. RRHH puede marcar disponibilidad o desactivar reparto; las nuevas solicitudes excluyen al asesor no elegible.

El menú V1 sigue disponible en el simulador como **Flujo legado V1**. Está restringido a ADMIN/SUPERVISOR y solo funciona en desarrollo `mock`.

## Verificación

```bash
npm run build -w @reparto/api
npm run build -w @reparto/web
npm run lint -w @reparto/api
npm run lint -w @reparto/web
docker compose exec -T api npm test -w apps/api
node scripts/smoke.mjs
```

Si se usa otro proyecto Compose, anteponer `docker compose --env-file <archivo> -p <nombre>` a las operaciones Docker y definir `API_URL`, `WEB_URL` y `ADMIN_INICIAL_PASSWORD` para smoke. El API levanta migraciones y seed automáticamente en desarrollo; también pueden ejecutarse `npm run prisma:migrate -w apps/api` y `npm run seed -w apps/api` dentro del contenedor.

## Meta real

Publicar API con HTTPS y registrar `https://<DOMINIO_API>/webhooks/meta/whatsapp` en Meta. Suscribir `messages` y `smb_message_echoes`; configurar y activar repartidor y canales asesores con sus Phone Number IDs en NEXO. El webhook valida `X-Hub-Signature-256`, conserva eventos desconocidos y procesa estados con idempotencia. Revisar [guía de webhook](docs/guias/06-configurar-webhook-meta.md) y [guía de Coexistence](docs/guias/03-conectar-whatsapp-asesor-coexistence.md).

La integración V1 con Meta real fue validada por el usuario. **Coexistence V2 con números reales sigue pendiente de validación con activos Meta reales.** El modo mock y las pruebas automáticas verifican la lógica interna, pero no la elegibilidad del número ni la suscripción real en Meta.

## Operación y límites

[Guías 01–10](docs/guias/01-alta-asesor.md): alta y baja, conexión Coexistence, repartidor, credenciales, webhook, rotación, recuperación, despliegue y prueba productiva. El importado de historial previo de Business App (`history`, `smb_app_state_sync`) no se requiere para V2 y no se ha implementado. Los adjuntos entrantes se registran por tipo y referencia textual; la descarga y presentación de medios quedan fuera del alcance actual. SSE funciona con una instancia de API; para varias réplicas se necesita distribución de eventos compartida.
