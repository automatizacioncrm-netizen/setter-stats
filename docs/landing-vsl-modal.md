# Modal diario de leads Landing VSL — 27/10/2026

## Datos y origen del defecto

El contrato ampliado por el backend utiliza
`data.cohorteDiariaVsl.porDia[].detalles`. La primera versión ya conservaba ese
campo, pero solo admitía Asistió/No asistió/Sin resultado y exigía `citas[].estado`.
El contrato actualizado admite también Confirmado/Cancelado y entrega
`estadoConsolidado`/`estadoAgenda` en el historial. Además, el esquema eliminaba
campos de atribución, contacto y citas no declarados.

Se añadió `detalles` al esquema desplegado y al contrato normalizado, se preserva
en la transformación y se declara `LandingVslLeadDetail` en los tipos del reporte.
El proxy extrae correctamente `{ok,data}` y publica la cohorte en la raíz
del JSON final. Se preservan los campos recibidos de leads y citas, incluidos
campos adicionales. Los campos nuevos son opcionales para mantener compatibilidad
con la respuesta anterior; no se completan con datos ficticios.

El recorrido ahora es:

```text
Apps Script: {ok:true,data:{cohorteDiariaVsl:{porDia:[{detalles:…}],total:…}}}
→ fetchVslReport
→ reportApi / mapVslReportResponse
→ mapLandingVslCohort: validar y conservar detalles
→ Response.json: cohorteDiariaVsl.porDia[].detalles
→ getVslClosersReport
→ fila elegida por fecha
→ LandingVslDayModal: day.detalles
```

`includeDetail=false` no interviene en la conservación de `detalles`; sigue
controlando únicamente el detalle general del reporte. El detalle diario es
opcional: si está ausente, se muestra el resumen del día y un aviso de ausencia
de registros individuales. No se reemplaza por `[]` ni se fabrican leads.

## Comportamiento y validación

«Ver detalle» abre el diálogo existente de Radix para la fecha exacta elegida,
con título y siete resúmenes tomados de la fila original: total de leads,
agendados, confirmados, cancelados, asistidos, no asistidos y sin resultado.
La tabla contiene nombre, teléfono, correo, estado consolidado, creación,
reunión, Setter, Closer, número de citas y acción Ver citas.

Se incluyen búsqueda local por nombre/correo/teléfono, distintivos para los cinco
estados, scroll vertical y horizontal en móvil, botón Cerrar, Escape y devolución
del foco al botón de la fecha elegida. El historial muestra IDs, reunión,
creación de cita, calendario, estado real, Setter/creador y Closer. La búsqueda
no modifica contadores. Los contactos vacíos muestran No registrado; las
oportunidades sin cita muestran Sin cita. `numeroCitas` se muestra como lo entrega
el backend; si falta, se indica No disponible.

El mapper comprueba que la cantidad de detalles coincide con oportunidades, que
los Opportunity ID no se repiten, que cada fecha de creación coincide con su día
y que la distribución de los estados entregados coincide con el resumen diario.
Si hay una discrepancia, identifica el día y el tipo de error sin imprimir datos
personales. No ajusta silenciosamente los indicadores.

Se utiliza `estadoConsolidado` tal como lo entrega Apps Script, conservando
`estado` como compatibilidad con el contrato anterior. No se deriva una nueva
clasificación del historial. Confirmados y cancelados siguen incluidos en
sinResultado; no se suman de nuevo al total. Se validan por separado contra sus
contadores cuando existen. Las reuniones pueden estar fuera del rango de
creación. Se rechazan citas duplicadas o vinculadas a otra oportunidad.

## Archivos modificados

- `src/server/mappers/landing-vsl-cohort.mapper.ts`: esquema, conservación y
  conciliaciones de `detalles`.
- `src/types/reports.ts`: tipos de detalle y su propiedad opcional en cada día.
- `src/components/reports/LandingVslCohortDetail.tsx`: acción de apertura y cierre
  del modal por fecha; tabla principal conservada.
- `src/components/reports/LandingVslDayModal.tsx`: nuevo diálogo con tabla,
  búsqueda, resúmenes y citas.
- `tests/landing-vsl-cohort.cjs`: fixtures del contrato ampliado, prueba HTTP
  completa y pruebas de interacción con hooks controlados.
- `src/server/api/report.api.server.ts`: diagnóstico de cantidades de días,
  presencia del detalle y errores de contrato cuando se activa REPORTS_DEBUG.
- `src/server/adapters/apps-script.adapter.server.ts`: los logs de diagnóstico
  del reporte ya no imprimen URL autenticada, filtros de personas ni payloads.

No se editó Google Apps Script ni se cambiaron KPI, ventas, atribución, filtros,
otros pipelines o fórmulas comerciales. No se incorporaron las cifras de
referencia 196/61/135 como constantes de producción.

## Pruebas y límites

Dieciséis pruebas de cohorte aprobadas. Incluyen:

- Día con nueve oportunidades, los cinco estados, leads sin cita y varias citas.
- Reunión posterior al rango de creación y campos de contacto vacíos.
- Falta de `detalles`, duplicados, fecha incorrecta y estados que no concilian.
- Apertura, cierre por botón/Escape, devolución de foco y selección de otro día.
- Búsqueda por los tres campos sin modificar resúmenes.
- Prueba del servicio del cliente, proxy y adaptador reales con respuesta Apps
  Script simulada: preserva todos los campos de `detalles` con
  `includeDetail=false` y abre el modal con la cantidad exacta de registros.
- Comparación del resto del JSON con y sin cohorte: los indicadores y filtros
  existentes permanecen iguales.

Suite completa: 177 aprobadas, 24 fallidas y una omitida. Los 24 fallos son los
mismos de la ejecución anterior. TypeScript, lint de los archivos modificados
y build Vite/Vercel aprobados.

Además de fixtures simulados, se verificó la API real configurada usando el
proxy local y acceso de red autorizado: HTTP 200, 22 días completos, nueve
oportunidades únicas el primer día, los cinco estados y conservación exacta de
todos los campos de cada lead y cita con `includeDetail=false`.
La comparación fue en memoria; no se guardaron respuestas con datos personales.
No se publicaron cambios ni se realizó una prueba visual del navegador contra
el frontend desplegado. Queda pendiente desplegar el frontend/proxy y comprobar
allí la interacción real del modal.
