# Motor de reparto

`ServicioReparto.asignarConversacion(grupoId, conversacionId)` ejecuta una transacción PostgreSQL. Primero toma `pg_advisory_xact_lock(42017, grupoId)`, con alcance de grupo; después bloquea la conversación y comprueba si ya está asignada. Selecciona aleatoriamente un asesor activo entre quienes tienen el menor `contador_reparto`, bloquea su fila, crea el historial, asigna la conversación e incrementa los contadores. Si no hay asesor elegible, conserva `PENDIENTE_ASIGNACION`.

Todas las operaciones que cambian disponibilidad o grupo de un asesor toman el mismo bloqueo por grupo. Para cambiar de grupo se bloquean ambos grupos en orden creciente. El flujo entrante también bloquea por contacto (`42018, contactoId`) para impedir dos conversaciones operativas simultáneas. El índice parcial es la última barrera de integridad.

No se reinician contadores al igualarse. Un asesor reactivado vuelve a competir con su contador acumulado. Los tests de integración crean 100 asignaciones concurrentes y comprueban unicidad, suma de contadores y diferencia máxima 1 antes de cambios manuales de disponibilidad.
