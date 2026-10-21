# Soporte de Orgánico y GIRA

Se amplió el reporte existente /reports/vsl-closers, sin modificar Google Apps Script, endpoints ni secretos.

## Archivos modificados en esta tarea

- package.json
- src/components/reports/DashboardFilters.tsx
- src/components/reports/LeadsWithoutAppointmentSection.tsx
- src/components/reports/SalesSection.tsx
- src/lib/executive-presentation.ts
- src/lib/pipeline-summary.ts
- src/lib/report-filter-state.ts
- src/lib/report-record.ts
- src/pages/VslClosersDashboard.tsx
- src/server/adapters/apps-script.adapter.server.ts
- src/server/api/report.api.server.ts
- src/server/mappers/leads-without-appointment.mapper.ts
- src/server/mappers/vsl-response.mapper.ts
- src/services/reports.ts
- src/types/reports.ts
- tests/lig-report.cjs
- tests/performance-contract.cjs
- tests/additional-pipelines.cjs
- docs/additional-pipelines.md (esta entrega)

Los cambios previamente preparados en AppointmentDetailModal.tsx, reports.ts y appointment-detail.cjs se conservaron; únicamente reports.ts recibió ampliaciones adicionales de esta tarea.

## Contratos y comportamiento

- Pipeline admite all, vsl, oei, lig, organico y gira. Se ampliaron también el schema Zod de la API interna, los parámetros del adaptador y mapper y el tipo usado por SalesSection.
- DashboardFilters.tsx incorpora Captación Orgánica (organico), VSL GIRA (gira) y Todos los embudos (all).
- Los nuevos pipelines usan agendador/booker como OEI y LIG, incluyendo selección, cambio entre embudos, atribución de filas y detalle/modal de citas.
- Se conserva pipelineSummary completo. Todos suma las nuevas secciones cuando están presentes, conservando compatibilidad con respuestas anteriores.
- etapasPorEmbudo conserva las secciones nuevas incluso cuando la respuesta no contiene etapas VSL. El contrato incluye OEI, Orgánico y GIRA.
- Se ampliaron los contratos, mapper y presentación de leads sin cita para consumir los indicadores nuevos si la API los entrega, sin caer en el indicador VSL.
- Se reutilizan changeReportFilters y rangeForPreset; no se agregó otro filtro de fechas.
- La reconciliación ya tenía el mapa de seis valores correcto. Se conserva su loop completed=false, su finalización completed=true y el refetch posterior del dashboard.

## Verificación

- TypeScript: node node_modules/typescript/bin/tsc --noEmit, código de salida 0.
- Build: bun run build, código de salida 0.
- Suite enfocada: 118 pruebas, 117 aprobadas, 1 omitida, 0 fallos. Incluye los contratos existentes, filtros, dashboard, reconciliación y las pruebas nuevas.
- Suite completa: 183 pruebas, 158 aprobadas, 1 omitida, 24 fallos. Comparación contra una copia del estado previo preparado en Git: 180 pruebas, 155 aprobadas, 1 omitida, los mismos 24 fallos. No aparecen fallos nuevos.
- additional-pipelines.cjs prueba ambos pipelines de extremo a extremo con fetch simulado: frontend → API interna → adaptador. Comprueba 2026-10-01 a 2026-10-31 mediante el cálculo de mes existente, cambio de mes conservando pipeline, cambio de pipeline conservando fechas, todos los periodos, booker, detalle, etapas, resumen y tres checkpoints de reconciliación.
- lig-report.cjs recorre los seis pipelines contra el endpoint; performance-contract.cjs comprueba las seis opciones del selector.
- Las verificaciones no consultaron la API de producción.

## Reglas que se conservaron específicas

- VSL Origen, cohorte pagada, seteo VSL y No Aplica siguen siendo exclusivos de VSL; la detección automática por nombre en el modal se limita explícitamente a VSL.
- No calificados y pendientes de seteo LIG mantienen sus fases y cálculos propios.
- El mapper de reconciliación conserva su contrato legacy de opportunities.vsl/oei: describe una respuesta histórica, no una lista de pipelines seleccionables.
- No se amplían los scripts de Google Apps Script ni sus fixtures de negocio a los nuevos pipelines.

## Fallos existentes de la suite completa

- performance table filters existing rows and totals across pipeline changes, preserving clicks
- tests\appointments.cjs
- NO APLICA uses the filtered lead cohort, exact phases, period and setter
- closer normalization is consistent between attended appointments and sale attribution
- missing booking date is not a zero gap and empty opportunities do not hide real appointments
- all includes three pipelines and LIG once, including its sale and appointments
- paid/organic apply to VSL only, including stale filters for LIG/OEI
- booking counts assigned opportunities, not appointments or the booker
- monthly VSL uses historical appointments outside the selected dates
- appointment detail preserves fields and aliases, dates, gap, filters and pagination
- unique opportunity IDs prevent duplicate sales/cash/leads and unknown pipelines are excluded
- cash retains historical last payment field, separates currencies and product codes
- missing/updated checkpoints gate later phases and worker checkpoints remain untouched
- appointments incomplete never recalculates counts; all respects every stage
- standalone appointment continuation and count failure resume without rerunning appointments
- POST authentication, JSON input, failures and missing worker are explicit
- executive sections consume performance without appointment requests
- Apps Script paid report: all/date/setter/closer/status/origin filters and detail-only search
- service and internal endpoint forward leadType with filters; missing/invalid values use paid
- report response defaults, numeric strings, phone strings and pagination
- real leads and classified leads are distinct; rates use the six agenda states
- central adapter forwards only allowed params and sanitizes upstream failures
- report and endpoint carry sales through the same filtered GET, independent of detail page
- cron authenticates before upstream call and shares manual reconciliation service

## Archivos locales de validación

pipelines-typecheck.local, pipelines-build.local, pipelines-focused.local, pipelines-tests.local, pipelines-baseline.local y pipelines-audit.local conservan los resultados. La copia temporal .pipeline-baseline.local se retuvo porque la revisión automática rechazó su borrado recursivo.
