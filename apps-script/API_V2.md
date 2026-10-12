# API de tres embudos: entrega y contratos

## Revisión y problemas corregidos

Se revisaron la API local, el adjunto completo y la integración del dashboard. El adjunto es la base de la API entregada: contiene los MASTER separados y el detalle que faltaban en la versión local anterior. Se conservan sus reglas comerciales de VSL/OEI y fechas de venta; LIG vende en fase `Ventas`.

Problemas detectados:

- El adjunto calculaba businessMetrics pero no lo devolvía.
- Agendamientos por setter contaba appointments por creador, duplicando leads reagendados. Ahora utiliza Opportunity ID y Setter asignado, aunque otra persona cree la cita.
- Appointments recalculaba Numero de citas incluso con `completed:false`. Ahora espera su terminación.
- El frontend rechazaba ventas LIG en all y ocultaba LIG del selector. Ahora admite los tres pipelines en el dataset principal.
- Opportunities repetidas duplicaban leads, ventas y cash. Se conserva la primera fila válida por ID; appointments se deduplican por Appointment ID.
- El frontend no reconocía el nuevo estado de reconciliación ni continuaba los checkpoints. Ahora lo conserva y repite la misma acción.

No se implementó el indicador 6. No se modificó el cálculo existente de diferencia de días.

**Revisión pendiente:** no se proporcionaron OPPORTUNITIES_MASTER, APPOINTMENTS_MASTER, 10_OPM_SYNC_V2, GHL_PIPELINES, MAPPER_GET_FULL_RECORD ni auxiliares. Dependencias externas utilizadas:

| Dependencia | Pendiente |
| --- | --- |
| APP_CONFIG.SHEET_ID | Configuración/acceso al Sheet real |
| GHL_PIPELINES.VSL_CLOSERS/OEI_EM/LIG.name | Nombres reales |
| OPM_SYNC_MISSING_ONLY | Checkpoints, retorno, locks internos |
| OPM_SYNC_UPDATED_ONLY | updatedAt y ausencia de escrituras de Numero de citas |
| APPOINTMENTS_MASTER_RECONCILIAR | Resolución de Opportunity, checkpoints y retorno |
| OPM_ACTUALIZAR_NUMERO_CITAS | Conteo real e idempotencia |

Las pruebas distinguen referencias locales y dependencias externas: no prueban que estas últimas existan en Google. Un worker faltante devuelve un error explícito con etapa. No se inventaron implementaciones de sincronización.

## Contratos POST

Apps Script acepta query/form parameters o JSON (`e.postData.contents`). Se exige `key=<FRONTEND_SECRET>`.

| action | Orden |
| --- | --- |
| reconcile_opportunities | MISSING → UPDATED |
| reconcile_appointments | APPOINTMENTS → COUNTS |
| reconcile_all | MISSING → UPDATED → APPOINTMENTS → COUNTS |
| vsl_reconciliar | Alias de reconcile_all |

MISSING/UPDATED requieren `completed:true` explícito. `completed:false` bloquea la siguiente etapa. Después de terminar una etapa de Opportunities se devuelve la siguiente como pendiente, para darle una nueva ejecución de Apps Script.

Appointments/conteo admiten workers síncronos sin campo completed: retornando sin excepción, ok:false o success:false se consideran terminados. **Este supuesto debe confirmarse con los módulos reales.** Si devuelven completed:false, se espera. COUNTS se persiste antes de recalcular, permitiendo reintentar un error sin repetir appointments.

Las propiedades API_RECON_*_STAGE_V2 guardan solo orquestación y se eliminan al completar el ciclo. No se eliminan ni reinician checkpoints de workers. All tiene su propia etapa. No se llama a OPM_FULL_SYNC ni se agregan locks externos. La coordinación entre acciones simultáneas que comparten workers debe confirmarse en sus módulos internos.

Ejemplo de respuesta pendiente (extracto; fechas simuladas):

```json
{
  "ok": true, "success": true, "completed": false,
  "funcion": "API_RECONCILIAR_OPPORTUNITIES",
  "stage": "UPDATED_PENDING", "nextAction": "reconcile_opportunities",
  "mensaje": "Continuar desde checkpoint.",
  "resultado": {
    "success": true, "completed": false, "stage": "UPDATED_PENDING",
    "nextAction": "reconcile_opportunities",
    "result": {"MISSING": {"success": true, "completed": true}}
  },
  "timestamp": "2026-10-12T15:00:00.000Z"
}
```

resultado incluye startedAt, finishedAt y alias opportunities, appointments, appointmentCounts. Los counters/resultados corresponden a **esta llamada**, no se acumulan entre lotes. Al completar: completed:true, stage:COMPLETED, nextAction:null.

Error:

```json
{
  "ok": false, "success": false, "completed": false,
  "stage": "UPDATED", "nextAction": null, "resultado": null,
  "error": "No existe OPM_SYNC_UPDATED_ONLY().",
  "timestamp": "2026-10-12T15:00:00.000Z"
}
```

Se registra action, etapa y error; las excepciones no se ocultan.

Frontend: `POST /api/reports/vsl-closers/reconcile?action=reconcile_opportunities` (también reconcile_appointments/reconcile_all, este último por defecto), header `x-report-request: 1`. El servidor añade el secreto. `triggerVslReconciliation(action)` admite las tres acciones y continúa hasta completar, con máximo de 100 llamadas por invocación; si llega al límite permite retomar el checkpoint. Los errores/timeouts no disparan reintentos ciegos. Los counters mostrados corresponden a la última llamada.

## GET para LIG

Apps Script: action=vsl_report y action=appointment_detail, ambos con key. action=ping conserva el health check.

pipeline=all|vsl|oei|lig; omisión/valor inválido → all. All incluye VSL + OEI + LIG sin reconstrucción especial para actividad.

Filtros conservados: calendar, setter, booker, closer, status, vslOrigin, vslTipo, leadType, dateFrom, dateTo, dateField, dayGap, bookingMode, search, page, pageSize. El proxy mantiene además includeDetail, sort, direction. dayGap/bookingMode/dateField/vslTipo ahora también pasan por el GET principal del proxy.

Paid/organic solo se aplica a VSL. El proxy conserva leadType=all para otros pipelines. LIG usa los calendarios del adjunto: `Lanzamiento Interno Gratuito - EM` y `Lanzamiento Interno Gratuito - CM`.

bookingMode=manual|automatic; dateField=appointmentCreated|meetingDate; dayGap admite número o __SIN_DATO__. dayGap=0 exige cero real, no una fecha faltante.

Detalle: una fila por Appointment ID. Conserva nombreContacto/calendario/estado/fechaCreacionCita/creadoPorCita y agrega contacto/calendar/setter/booker/status/producto/appointmentCreatedAt/appointmentUpdatedAt. UpdatedAt conserva hora cuando existe. diferenciaDias sigue usando API_DATE_DIFF_DAYS_ entre creación del appointment y Fecha cita (fallback de reunión de Opportunity).

El detalle enriquecido conserva el JOIN obligatorio a Opportunity del adjunto. El resumen de citas sí puede incluir appointments todavía sin Opportunity resuelta. No se cambió esta arquitectura sin contar con su módulo de resolución.

## Métricas y supuestos financieros

businessMetrics contiene los ocho arrays solicitados y metadata:

- conversionPorCloser: reutiliza el cálculo del adjunto; ventas únicas atribuidas mediante citas asistidas históricas. Ventas sin cita asistida o con varios closers permanecen en diagnostics y no se asignan arbitrariamente.
- agendamientoPorSetter: setter, leadsAsignados, agendados, noAgendados, agendamientoPct; agendamientos queda como alias de leads agendados. Usa cualquier appointment histórico asociado por Opportunity ID, sin limitar su fecha ni atribuir el lead al creador de cita.
- conversionPorEmbudo: VSL/OEI/LIG, ventas únicas / leads únicos. Desconocidos excluidos. Pipelines no seleccionados con conteos cero y porcentaje null.
- leadsNoAgendadosVslPorMes: month de Creado el, leads, agendados, noAgendados, noAgendadosPct. Si falta fecha: SIN_FECHA, para no esconder datos incompletos.
- sesionesEntregadasPorCloser: sesionesEntregadas y alias sesiones; Appointment único cuyo estado efectivo es Asistió, respetando filtros de citas.
- cashPorEmbudo/cashPorProducto/cashPorEmbudoProducto: monedas separadas y nombres conocidos normalizados a CM/EM. Productos desconocidos conservan su nombre.

Se conserva la selección financiera del adjunto: OEI usa **Monto de cuota 1**; VSL/LIG con Fecha de cuota 1 >= 2026-10-01 usan **Monto de cuota 1**; históricos usan **Monto del último pago**. Nunca se suman Monto Total Acordado ni Precio Acordado como cash. Metadata informa basis:master_field_snapshot, historicalTotal:false, campos/regla y limitación de verificación. **No hay evidencia proporcionada para certificar que cuota 1 represente pago liquidado**; debe verificarse con el mapper financiero antes de interpretarlo como cobro real.

Se mantienen las cohortes temporales del adjunto: leads por creación, citas por fecha seleccionada, ventas por fecha comercial. Conversiones pueden superar 100% si difieren las cohortes; se documenta, sin alterar las reglas comerciales. Sin denominador, conversión null. No se inventó cash histórico ni indicador de desertados.

rawRecords, vslSummary, sales, performance, filtros/paginación permanecen disponibles. El mapper transmite businessMetrics. Al combinar varias consultas por responsables, el cliente omite businessMetrics para evitar presentar los agregados de una sola consulta como si fueran del conjunto; requiere una consulta única.

## Ejemplos y validación

[examples-v2.json](examples-v2.json) contiene respuestas completas generadas ejecutando la API para pipeline=lig, pipeline=all, appointment_detail con diferenciaDias y businessMetrics. **Son MASTER simulados, no datos de producción.**

Comprobaciones: sintaxis VM/parser; funciones y constantes globales únicas dentro del archivo; referencias locales y dependencias externas explícitas; sin llamada a OPM_FULL_SYNC; pipelines/IDs duplicados; detalle/alias/filtros/paginación; appointments históricos; productos/monedas/cash; todas las etapas; errores/autenticación/JSON/worker faltante; reintento de COUNTS; checkpoints intactos; proxy/cliente de las tres acciones. TypeScript sin errores.

La suite completa mantiene ocho fallos anteriores en report.cjs y appointments.cjs. Se reprodujeron los mismos ocho leyendo versiones HEAD de los módulos modificados mediante preload sin modificar archivos del usuario. La suite enfocada pasa; una prueba heredada omitida no cuenta como validación.

No se ejecutó contra GHL/Sheets, no se verificaron headers reales ni se publicó. El orquestador llama al contador solo después de appointments; no puede garantizar que UPDATED_ONLY u otro archivo ausente no escriba esa columna. Tampoco se pueden descartar duplicados globales en módulos que no fueron proporcionados.

Referencias: [evento POST de Web Apps](https://developers.google.com/apps-script/guides/web) y [Script Properties](https://developers.google.com/apps-script/guides/properties).

## Archivos modificados exactamente

Backend/documentación:

- apps-script/10_API.gs
- apps-script/README.md
- apps-script/API_V2.md (nuevo)
- apps-script/examples-v2.json (nuevo)

Integración/frontend:

- src/server/adapters/apps-script.adapter.server.ts
- src/server/api/report.api.server.ts
- src/server/api/reconciliation.api.server.ts
- src/server/services/reconciliation.server.ts
- src/server/mappers/reconciliation.mapper.ts
- src/server/mappers/vsl-response.mapper.ts
- src/services/reconciliation.service.ts
- src/lib/merge-filtered-reports.ts
- src/types/reconciliation.types.ts
- src/types/reports.ts
- src/components/reports/DashboardFilters.tsx
- src/components/reports/ExecutivePerformance.tsx

Pruebas:

- tests/apps-script-v2.cjs (nuevo)
- tests/reconciliation.cjs
- tests/performance-contract.cjs
- tests/lig-report.cjs
- package.json (incluye la prueba nueva)

Se conservaron los cambios previos del usuario en VslClosersDashboard.tsx, loading-dashboard.cjs y documentación del dashboard. Downloads se utilizó como referencia y no se sobrescribió.
