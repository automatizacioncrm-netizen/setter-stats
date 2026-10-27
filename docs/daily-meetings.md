# Citas por fecha de reunión — Todos los embudos

## Alcance

Dentro de «Estados de Calendar y detalle de citas», se sustituyó únicamente el
bloque inferior de contactos por el nuevo reporte diario. La tabla y la llamada
a `SetterStatusTable` permanecen sin cambios: se comparó su integración con HEAD
y el contenido es idéntico. No se modificaron sus datos, totales, filtros ni
ordenamiento. Tampoco se modificaron Landing VSL, otros reportes, estilos globales,
KPI, fórmulas ni Apps Script. El componente compartido `LeadDetailTable` y su
uso opcional fuera de esta sección se conservan.

## Ruta y datos

Nueva ruta del servidor: `/api/reports/daily-meetings?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD`.
Utiliza el adaptador y la configuración privada existentes para consultar
`action=daily_meetings_report`. Solo envía fechas; no envía pipeline, Setter,
Closer, calendario ni tipo de lead. La autenticación permanece en el servidor.

El contrato real se inspeccionó directamente en Apps Script: coincide con el
proporcionado y añade metadatos de contacto/estado original. Se preservan todos
los campos de los registros recibidos. La copia local de Apps Script no contiene
la acción nueva, de modo que no se utilizó para inferir el contrato ni se editó.

Se validan el envelope `{ok,data}`, tipos, fechas, alcance, unidad Appointment ID,
rangos devueltos, unicidad de días y citas y pertenencia del detalle a la fecha.
Dos citas distintas de una misma oportunidad o contacto se conservan. No se
reclasifican estados ni se deduplica por datos de contacto.

Las discrepancias entre categorías, total diario, longitud del detalle o totales
generales generan advertencias sin cambiar ni ocultar los valores oficiales.
Los diagnósticos incluyen solo fechas, cantidades y tipo de discrepancia.

## Interfaz

El componente se monta al abrir el desplegable. Su caché de React Query depende
exclusivamente de ambas fechas y consume AbortSignal. No utiliza datos de una
página de contactos ni valores de otra selección. Al cambiar de rango se desmonta
el reporte y se cierra el modal anterior; la selección también está ligada al
rango como protección adicional.

La tabla comienza en orden cronológico y permite ordenar fecha y contadores.
El pie `TOTAL GENERAL` toma directamente `data.total`, permanece en `tfoot` y no
participa en el ordenamiento. Incluye fondo azul claro y no tiene botón de detalle.

El modal utiliza únicamente `porDia[].detalles` de la fecha elegida. Tiene las doce
columnas solicitadas, seis contadores oficiales, desplazamiento interno, cierre
por botón/Escape y devolución de foco. Usa `appointmentId` como clave. Los campos
vacíos muestran «—». Carga, error, reintento y vacío son estados separados.

La espera del nuevo endpoint es de 30 segundos, tras observar un timeout con el
límite heredado de 15 segundos. Los reportes existentes siguen usando 15 segundos
y la reconciliación conserva su límite anterior.

## Archivos

- `src/pages/VslClosersDashboard.tsx`: sustitución del bloque y eliminación de su
  consulta de contactos, sin tocar la tabla Setter.
- `src/components/reports/DailyMeetingsReport.tsx`: tabla diaria y modal.
- `src/routes/api.reports.daily-meetings.ts`: nueva ruta de servidor.
- `src/server/api/daily-meetings.api.server.ts`: contrato, filtros, validación y
  advertencias de consistencia.
- `src/server/adapters/apps-script.adapter.server.ts`: reutilización del transporte
  autenticado para la nueva acción y su timeout independiente.
- `src/services/daily-meetings.ts` y `src/types/daily-meetings.ts`: servicio cliente
  y tipos del reporte.
- `src/routeTree.gen.ts`: registro generado de la nueva ruta.
- `tests/daily-meetings.cjs`, `tests/loading-dashboard.cjs`, `package.json`: pruebas
  del reporte y de su integración, registradas en la suite del proyecto.

## Verificaciones

- API real, rango 2026-10-01 a 2026-10-27, a través de la nueva ruta local:
  HTTP 200, 24 días, cero advertencias, detalle completo por día, Appointment ID
  únicos y conservación exacta de totales oficiales y campos de cada cita.
  Respuesta final en 11.7 segundos en la lectura de comprobación.
- Las comparaciones reales se hicieron en memoria, sin guardar respuestas ni
  imprimir registros personales o credenciales.
- 27/27 pruebas focalizadas aprobadas: autenticación privada, solo fechas,
  varios embudos, varias citas del mismo contacto, rangos, errores, vacío,
  advertencias sin alterar cifras, ordenamiento, modal por fecha, cierre/foco,
  cambio de rango y respuesta tardía mediante React Query real.
- Suite completa: 184 aprobadas, 24 fallidas y una omitida. Los fallos son
  exactamente los mismos que antes de este cambio.
- TypeScript, lint de archivos modificados y build Vite/Vercel aprobados.
- No se desplegó el cambio ni se realizó una comprobación visual en el navegador
  publicado. La prueba de interacción utiliza el código real con hooks controlados.
