# Validación del frontend y Calendar — 10/10/2026

Esta revisión sustituye las limitaciones de integración descritas en executive-dashboard-validation.md. El endpoint desplegado ya entrega performance, leadsVslSinCita y leadsSinCitaPorEmbudo. No se modificó ni desplegó Apps Script, backend, API o Sheets para el ajuste visual.

## Presentación y filtros

SetterStatusChart y ConversionSummary se reutilizan una sola vez inmediatamente después de ExecutiveSummary, antes de las tablas de conversión. La cuadrícula usa dos columnas 2:1 en escritorio y una en móvil. La barra individual tiene altura compacta y los nombres se distribuyen en varias líneas.

ExecutivePerformance y SetterStatusTable muestran las seis personas oficiales en Todos y únicamente la identidad canónica seleccionada al filtrar. AppointmentDetailModal filtra exclusivamente setterEfectivo, deduplica appointmentId y no atribuye citas por creador. La paginación sigue siendo la de la API: se explica que el número de registros visibles corresponde a esa página y se suprime el resumen amplio cuando mezcla responsables.

Las tarjetas comerciales conservan los importes y conteos de su universo. Con setter seleccionado hay tres tarjetas y se oculta leads sin cita; al limpiar aparecen cuatro tarjetas y la sección de leads. El resumen de leads utiliza el contrato real, nunca una resta entre leads y citas. La fecha comercial procede de fechaVenta de la API.

## Evidencia de lecturas reales

Todos, sin fechas: performance registra 1.304 citas de actividad (90 LIG), pero los estados disponibles suman 1.214. No existe información para reconstruir las distribuciones LIG. Ambos gráficos muestran un aviso en ese alcance en lugar de inventar estados.

Cinthia, sin fechas: estados efectivos 131 citas (28 confirmadas, 66 asistidas, 20 canceladas, 17 no show), conciliados con performance 131/66. Las tarjetas comerciales de la consulta seleccionada entregan 147/75; se mantienen. El gráfico circular utiliza 131. El detalle de Calendar de la API también incluye otros responsables, que se excluyen por setterEfectivo en cada página.

Álvaro, sin fechas: performance entrega 48 citas y 8 asistencias, pero no existe una fila de estados canónica que permita conciliar ese alcance. Se informa la carencia sin reasignar IDs opacos ni alterar su atribución.

Todos, 1–10 octubre: tarjetas 125 leads, 85 citas, 18 asistencias, 3 ventas. Leads VSL: 115 oportunidades, 58 con cita histórica, 57 sin cita. OEI: 10 oportunidades, todas con cita. La venta de Veronica contiene fechaVenta 2026-10-05, reunión 2026-09-11 y closer Ezequiel Dario.

## Validación

TypeScript, ESLint de los archivos fuente modificados, compilación de producción y git diff --check pasan. Las 63 pruebas enfocadas en carga, contrato, setters y detalle pasan; las cuatro pruebas de detalle de ventas también pasan. La ejecución ampliada detectó ocho fallos históricos en contratos de report.cjs y carga de appointments.cjs, más una expectativa antigua de fecha de venta, corregida para exigir fechaVenta de la API. ESLint global mantiene miles de incidencias de formato previas.

La comprobación del navegador confirmó previamente las cuatro tarjetas generales y las tres tarjetas al seleccionar Álvaro, sin sección de leads. La revisión final de los gráficos en navegador quedó limitada por timeout intermitente de Apps Script y bloqueo de la pestaña de prueba; no se afirma validación visual completa de todos los escenarios.

## Archivos del ajuste visual

- src/pages/VslClosersDashboard.tsx: ubicación única de gráficos y selección efectiva.
- src/components/reports/ExecutivePerformance.tsx: tabla de setter seleccionado.
- src/components/reports/SetterStatusChart.tsx y ConversionSummary.tsx: presentación y avisos.
- src/components/reports/SetterStatusTable.tsx y AppointmentDetailModal.tsx: estados y detalle efectivos.
- src/lib/calendar-presentation.ts y setter-performance.ts: selección canónica y conciliación de alcance.
- tests/loading-dashboard.cjs, performance-contract.cjs y sales-detail.cjs: regresiones.

Cambios locales, sin commits, push ni despliegue.
