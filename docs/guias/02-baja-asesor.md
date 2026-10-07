# 02. Baja de asesor

## Objetivo
Detener nuevas asignaciones y conservar solicitudes, chats, mensajes y auditoría.

## Prerrequisitos y datos
ADMIN o RRHH para disponibilidad; ADMIN para canal y usuario. Identificador del asesor y lista de solicitudes abiertas.

## Pasos
1. **Primero en NEXO:** en **Asesores**, marcar `disponible=false` y `activoReparto=false`. Confirmar que no recibe nuevas solicitudes.
2. En **Asignaciones**, resolver o reasignar las solicitudes abiertas con un motivo. El hilo anterior queda histórico y el nuevo asesor inicia el contacto con una plantilla desde su propio número.
3. En **Canales WhatsApp**, desactivar el canal del asesor. Revisar que las conversaciones previas siguen visibles para ADMIN.
4. Si corresponde, desactivar el usuario en **Usuarios**; no borrar registros.
5. **Después en Meta:** retirar permisos, accesos y/o asociación del número según el procedimiento de la organización. Confirmar antes de desvincular Coexistence: esa acción externa puede tener consecuencias para la app y el historial.
6. Comprobar que el reparto sigue funcionando con los asesores restantes y que el antiguo chat permanece consultable.

## Configuración y errores
No hace falta cambiar `.env` si el token global aún sirve a los otros números. Si Meta envía eventos del número ya desactivado, NEXO conserva su registro de evento y no crea nuevas operaciones comerciales. Si hay solicitudes abiertas sin sucesor, mantenerlas visibles hasta reasignarlas.
