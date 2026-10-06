# Nexo: reparto de consultas por WhatsApp

V1 de bandeja centralizada para un número oficial. El cliente recibe un menú configurable, el sistema asigna su conversación al asesor activo con menor `contador_reparto` y el asesor responde desde la aplicación. El modo `mock` reproduce el flujo sin credenciales de Meta.

## Requisitos

- Docker Engine con Docker Compose v2.
- Para ejecutar fuera de Docker: Node 22+, npm, PostgreSQL 16 y Redis 7.

## Inicio rápido

```bash
docker compose up --build -d
```

El contenedor API ejecuta migraciones y, solo en desarrollo, el seed. Espera a que `docker compose ps` marque `api` y `web` como saludables.

- Web: `http://localhost:3001` (el puerto 3000 ya lo usa otra aplicación en esta máquina)
- API y salud: `http://localhost:4000/salud`
- Webhook local: `http://localhost:4000/webhooks/meta/whatsapp`

PostgreSQL y Redis solo son accesibles desde la red interna de Compose. Para detener: `docker compose down`. El volumen de PostgreSQL persiste; `docker compose down -v` elimina los datos locales.

## Configuración

Consulta [.env.example](.env.example). Compose proporciona valores **solo de desarrollo** para iniciar sin `.env`. Para configuraciones propias, copia `.env.example` a `.env` y cambia los valores. Nunca publiques `.env`.

En producción, define `NODE_ENV=production`, secretos aleatorios de al menos 32 caracteres para `AUTH_SECRET` y `COOKIE_SECRET`, una base PostgreSQL protegida, Redis privado, `WEB_URL` y `API_URL` HTTPS públicos. Cambia también los valores Compose `POSTGRES_DB`, `POSTGRES_USER` y `POSTGRES_PASSWORD`. El seed de demostración se bloquea en producción. El build web utiliza `API_URL` como origen público del navegador; configúralo antes de construir.

## Usuarios de prueba

Solo tras el seed de desarrollo:

| Rol | Correo |
|---|---|
| Admin | `admin@local.test` |
| Supervisor | `supervisor@local.test` |
| RRHH | `rrhh@local.test` |
| Asesores | `andrea@local.test`, `carlos@local.test`, `lucia@local.test`, `miguel@local.test`, `jose@local.test` |

La contraseña local predeterminada es `DemoLocal!2026`, o el valor configurado en `ADMIN_INICIAL_PASSWORD`. Cámbiala para un entorno compartido. El seed no sobrescribe contraseñas existentes.

## Prueba del recorrido mock

1. Inicia sesión como admin y abre **Simulador**.
2. Usa un teléfono ficticio nuevo y envía `Hola`.
3. Selecciona una opción del menú. La pantalla muestra grupo y asesor.
4. Inicia sesión como ese asesor en otra ventana privada. La conversación aparece en su bandeja sin recargar mediante eventos SSE.
5. Envía una respuesta. Vuelve al simulador para verla.
6. En **Asesores**, RRHH o admin puede desactivar el reparto de ese asesor. Las conversaciones actuales permanecen asignadas; nuevas consultas lo excluyen.
7. Supervisor o admin puede ver pendientes, ejecutar reparto y reasignar con historial y auditoría.

## Comandos

```bash
docker compose exec api npm run prisma:migrate -w apps/api
docker compose exec api npm run seed -w apps/api
docker compose exec api npm test -w apps/api
docker compose exec api npm run build -w apps/api
docker compose up --build -d web
node scripts/smoke.mjs
```

En local, `npm install`, `npm run prisma:generate`, `npm run build`, `npm test` y `npm run lint` requieren las variables de `.env.example` y los servicios PostgreSQL/Redis. No uses `prisma db push` para desplegar.

## Arquitectura

- `apps/web`: Next.js, TypeScript, Tailwind; inicio, bandeja, gestión, simulador.
- `apps/api`: NestJS REST, Prisma, sesiones HttpOnly, RBAC, SSE, proveedor mock/Meta y BullMQ.
- `apps/api/prisma`: esquema, migración versionada y seed de desarrollo.
- `docs`: [arquitectura](docs/arquitectura.md), [modelo de datos](docs/modelo-datos.md), [motor de reparto](docs/motor-reparto.md), [despliegue](docs/despliegue.md).

## Datos necesarios para activar WhatsApp real

El cliente debe aportar acceso administrativo a Meta for Developers y a la Meta App con WhatsApp; acceso a su WABA y número empresarial; Phone Number ID, WABA ID, Access Token de System User con los permisos apropiados, App Secret y acceso para configurar/suscribir el webhook. Puede ser necesario verificar o registrar el número empresarial. Debe elegir un Verify Token propio y una versión de Graph API compatible. El Business Portfolio ID y número visible son opcionales.

Coloca todos estos datos en el archivo **`.env` de la raíz** (nunca en `.env.example` ni en código):

| Dato | Variable exacta |
|---|---|
| Modo | `WHATSAPP_MODE=meta` |
| Versión Graph API | `META_GRAPH_API_VERSION` |
| Access Token | `META_WHATSAPP_ACCESS_TOKEN` |
| Phone Number ID | `META_WHATSAPP_PHONE_NUMBER_ID` |
| WABA ID | `META_WHATSAPP_BUSINESS_ACCOUNT_ID` |
| App Secret | `META_APP_SECRET` |
| Verify Token propio | `META_WEBHOOK_VERIFY_TOKEN` |
| Business Portfolio ID opcional | `META_BUSINESS_PORTFOLIO_ID` |
| Número visible opcional | `WHATSAPP_BUSINESS_DISPLAY_NUMBER` |

La URL que se registrará en Meta es **`https://<DOMINIO_PUBLICO_DE_API>/webhooks/meta/whatsapp`**. El dominio exacto depende del despliegue futuro; no existe todavía una URL pública que podamos registrar. [Guía de configuración](docs/configuracion-meta-whatsapp.md).

## Alcance y límites de la V1

Texto y menú interactivo de lista. El esquema contempla adjuntos, pero la UI y el proveedor no envían ni descargan multimedia. Los mensajes salientes de texto fuera de la ventana de atención de Meta pueden requerir una plantilla aprobada; la V1 muestra el fallo de envío. El tiempo real SSE de esta versión funciona con una instancia de API; para múltiples réplicas se debe distribuir eventos mediante Redis Pub/Sub. Consultar [despliegue](docs/despliegue.md) antes de producción.
