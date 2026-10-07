# 09. Despliegue a producción

## Objetivo
Publicar frontend, API, PostgreSQL y Redis con configuración segura y migración aditiva V2.

## Prerrequisitos y datos
Dominios HTTPS, base PostgreSQL y Redis persistentes, política de copias de seguridad, credenciales Meta, secretos de autenticación y operador ADMIN. Revisar impacto antes de aplicar sobre la V1 activa.

## Pasos
1. Respaldar la base V1 y comprobar restauración. Revisar la migración `202610060002_nexo_v2`: añade tablas y columnas; conserva conversaciones antiguas con `canal_id NULL`.
2. Configurar `.env` privado o gestor de secretos: `DATABASE_URL`, `REDIS_URL`, `WEB_URL`, `API_URL`, `AUTH_SECRET`, `COOKIE_SECRET`, `WHATSAPP_MODE=meta`, `META_GRAPH_API_VERSION`, `META_WHATSAPP_ACCESS_TOKEN`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`. Los IDs de cada número van en NEXO.
3. Ejecutar migraciones Prisma una sola vez sobre la base elegida. **No ejecutar seed de desarrollo en producción.** Iniciar API, web, PostgreSQL y Redis; verificar healthchecks y `/salud`.
4. Publicar la API bajo HTTPS y configurar webhook en Meta. Activar primero repartidor y luego canales asesores validados, de forma controlada.
5. Configurar plantilla aprobada y ejecutar [10](10-prueba-completa-produccion.md). Confirmar roles, contadores y auditoría.
6. Preparar reversión del binario y DB según el respaldo. No revertir la migración borrando tablas con datos V2.

## Plataformas
El frontend puede alojarse en Vercel Hobby; la API requiere un servicio Docker público con conexión a PostgreSQL y Redis administrados. Las URLs y credenciales son variables de entorno; no hay acoplamiento a un proveedor concreto.

## Pendientes Meta
La conexión real de Coexistence y el registro de cada número deben completarse y validarse manualmente en Meta antes de declarar operativa la integración.
