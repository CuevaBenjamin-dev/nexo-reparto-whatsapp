# Configurar Meta WhatsApp Cloud API

No se necesitan credenciales para el modo `mock`. Para activar Meta:

1. En [Meta for Developers](https://developers.facebook.com/apps/) crea o selecciona una aplicación de tu organización y agrega/configura el producto **WhatsApp**. Asegura acceso administrativo al Business Portfolio, WABA y número empresarial.
2. En el panel de WhatsApp de la aplicación o en WhatsApp Manager identifica el **WABA ID**. La [colección oficial de Meta](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api) muestra cómo consultar los WABA asociados al portfolio.
3. Localiza el **Phone Number ID** del número que enviará mensajes. Se puede consultar con `GET /<WABA_ID>/phone_numbers` en Graph API, según la [referencia oficial de Meta](https://www.postman.com/meta/whatsapp-business-platform/request/86mq7mn/get-phone-numbers).
4. Para producción crea un System User y un token apropiado con permisos `whatsapp_business_messaging` y, para administrar/suscribir WABA, `whatsapp_business_management`. Guarda el token fuera del código. Los tokens temporales del panel sirven solo para pruebas limitadas. Consulta los [permisos y suscripción de Meta](https://www.postman.com/meta/whatsapp-business-platform/folder/ypn8q0n/webhook-subscriptions).
5. En configuración básica de la aplicación localiza **App Secret**. Define tú mismo un valor aleatorio para **Verify Token**; no es el Access Token ni el App Secret.
6. Elige una versión vigente y compatible de Graph API en el panel Meta. No hay versión hardcodeada en la aplicación.
7. Copia `.env.example` a `.env` en la raíz e introduce los datos de la tabla siguiente. En producción utiliza también secretos de autenticación, URLs HTTPS, PostgreSQL y Redis protegidos.
8. Publica la API tras HTTPS. Registra en Meta `https://<DOMINIO_PUBLICO_DE_API>/webhooks/meta/whatsapp` como callback, con el mismo `META_WEBHOOK_VERIFY_TOKEN`. La API responde al `GET` de verificación con `hub.challenge` cuando el token coincide.
9. Suscribe el campo/evento **`messages`** de WhatsApp Business Account y suscribe la aplicación al WABA. Meta exige una suscripción por WABA, no por cada teléfono, según la [documentación oficial](https://www.postman.com/meta/whatsapp-business-platform/folder/ypn8q0n/webhook-subscriptions).
10. Comprueba que Meta marca el webhook como verificado. Envía un mensaje desde un teléfono de prueba al número empresarial, selecciona una opción y responde desde la bandeja. Comprueba `/salud` y los logs estructurados sin secretos.
11. Cambia `WHATSAPP_MODE=mock` a `WHATSAPP_MODE=meta` y reinicia la API. Si falta una variable obligatoria, el arranque falla indicando su nombre.

| Dato de Meta | Variable `.env` | Obligatorio en Meta | Uso |
|---|---|---|---|
| Versión Graph API | `META_GRAPH_API_VERSION` | Sí | URL de llamadas Graph |
| System User Access Token | `META_WHATSAPP_ACCESS_TOKEN` | Sí | Autorización de envío |
| Phone Number ID | `META_WHATSAPP_PHONE_NUMBER_ID` | Sí | Número emisor en Graph API |
| WABA ID | `META_WHATSAPP_BUSINESS_ACCOUNT_ID` | Sí | Identidad de cuenta, suscripción |
| App Secret | `META_APP_SECRET` | Sí | HMAC del webhook |
| Verify Token definido por nosotros | `META_WEBHOOK_VERIFY_TOKEN` | Sí | Verificación inicial del webhook |
| Business Portfolio ID | `META_BUSINESS_PORTFOLIO_ID` | No | Referencia administrativa |
| Número visible | `WHATSAPP_BUSINESS_DISPLAY_NUMBER` | No | Información visual |

El endpoint `POST` valida la firma `X-Hub-Signature-256` del cuerpo original antes de registrar eventos. La URL exacta pública solo puede fijarse al conocer el dominio del despliegue. [Referencia oficial del payload](https://www.postman.com/meta/whatsapp-business-platform/folder/tduohwq/webhook-payload-reference).
