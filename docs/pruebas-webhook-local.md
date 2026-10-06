# Pruebas de webhook Meta desde local

El desarrollo normal usa el simulador y no requiere túnel. Para probar la integración real, levanta `docker compose up --build`, verifica `http://localhost:4000/salud` y expón temporalmente el puerto 4000 con Cloudflare Tunnel, ngrok o equivalente. Utiliza la URL HTTPS generada más `/webhooks/meta/whatsapp` como callback en Meta. Coloca el Verify Token elegido en `.env`, configura la suscripción `messages` y envía un mensaje de prueba.

El túnel debe conservar el cuerpo HTTP original y reenviar al puerto 4000. No guardes tokens del túnel en el repositorio. Cada nueva URL temporal requiere actualizar el callback de Meta. El modo `mock` permanece la vía principal para validar reparto y bandeja sin credenciales.
