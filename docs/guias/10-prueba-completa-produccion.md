# 10. Prueba completa en producción

## Objetivo
Validar con activos Meta reales el flujo repartidor → asesor → cliente → sincronización.

## Prerrequisitos y datos
Un cliente de prueba con consentimiento, repartidor activo, asesor de prueba disponible y canal Coexistence activo, plantilla aprobada, acceso ADMIN y al teléfono Business App del asesor.

## Pasos
1. Confirmar `/salud`, webhook HTTPS y canales activos; anotar hora y Phone Number IDs sin incluir secretos.
2. Cliente escribe al repartidor. Confirmar respuesta “En un momento lo atendemos.” y una solicitud ASIGNADA en NEXO sin menú.
3. Asesor abre **Asignaciones** y pulsa **Iniciar atención**. Confirmar que la plantilla llegó desde su número y quedó registrada como `NEXO` con estado de envío.
4. Cliente responde al número del asesor. Confirmar que el mensaje entra en el mismo hilo y abre la ventana de atención. Asesor responde desde NEXO; revisar entrega y lectura si Meta las reporta.
5. Asesor envía otro mensaje desde WhatsApp Business App. Confirmar que aparece una sola vez en NEXO con origen `WHATSAPP_BUSINESS_APP`.
6. Entrar con otro asesor e intentar abrir el hilo: debe denegarse. ADMIN debe ver solicitud, conversación, fechas y auditoría.
7. Marcar al asesor no disponible y repetir una consulta con otro cliente: no debe recibir la nueva asignación. Restaurar disponibilidad después.
8. Probar repetición de un webhook firmado en entorno controlado y confirmar que no duplica solicitud, mensaje ni contador. Cerrar o reasignar el caso de prueba según corresponda.

## Resultado y errores
Registrar evidencia sin secretos ni datos personales en repositorio. Si falla cualquier paso, mantener el canal inactivo o la operación en mock y seguir [08](08-recuperar-integracion-whatsapp.md). La prueba mock local no sustituye esta validación real.
