# Citas por fecha de reunión — filtro de embudo

## Alcance

Dentro de «Estados de Calendar y detalle de citas», se sustituyó únicamente el
bloque inferior de contactos por el nuevo reporte diario. La tabla y la llamada
a `SetterStatusTable` permanecen sin cambios: se comparó su integración con HEAD
y el contenido es idéntico. No se modificaron sus datos, totales, filtros ni
ordenamiento. Tampoco se modificaron Landing VSL, otros reportes, estilos globales,
KPI, fórmulas ni Apps Script. El componente compartido `LeadDetailTable` y su
uso opcional fuera de esta sección se conservan.

## Ruta y datos

Ruta del servidor: `/api/reports/daily-meetings?pipeline=vsl&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD`.
Utiliza el adaptador y la configuración privada existentes para consultar
`action=daily_meetings_report`. Envía el identificador del filtro principal
(`all`, `vsl`, `oei`, `lig`, `organico` o `gira`) y las fechas. No añade Setter,
Closer ni tipo de lead. También transmite `calendar` sin modificarlo cuando
el filtro principal lo selecciona. La autenticación permanece en el servidor.
Si falta pipeline en la URL se utiliza all; los identificadores desconocidos se
rechazan antes de consultar Apps Script.

El backend actualizado devuelve `pipeline` y dos alcances: `embudo_seleccionado`
para un embudo concreto y `todos_los_embudos_permitidos` para all. La validación
acepta ambos y exige que el embudo/alcance devueltos correspondan al solicitado.
No se filtran filas ni se reatribuyen calendarios en el cliente o proxy.

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
del embudo, calendario y ambas fechas y consume AbortSignal. No utiliza datos de una
página de contactos ni valores de otra selección. Al cambiar de rango se desmonta
el reporte y se cierra el modal anterior; al cambiar de embudo también se cambia
la identidad del reporte y del modal. La selección está ligada al embudo/rango
como protección adicional. El título reproduce el nombre del filtro seleccionado.

La tabla comienza en orden cronológico y permite ordenar fecha, contadores y
porcentaje de asistencia. La columna Sin estado se conserva en los datos y
validaciones, pero se reemplaza visualmente por % Asistencia en la tabla diaria.
Se usa el porcentaje de la API o, si falta, asistidos / totalCitas × 100, también
para TOTAL GENERAL. El modal mantiene sus contadores originales.
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

- `src/pages/VslClosersDashboard.tsx`: transmite el pipeline principal y lo añade
  a la clave del componente, sin tocar la tabla Setter.
- `src/components/reports/DailyMeetingsReport.tsx`: título dinámico, pipeline en
  la consulta, clave de caché y selección del modal.
- `src/routes/api.reports.daily-meetings.ts`: nueva ruta de servidor.
- `src/server/api/daily-meetings.api.server.ts`: valida y transmite pipeline y
  fechas, admite los dos alcances reales y comprueba la respuesta solicitada.
- `src/server/adapters/apps-script.adapter.server.ts`: reutilización del transporte
  autenticado para la nueva acción y su timeout independiente.
- `src/services/daily-meetings.ts` y `src/types/daily-meetings.ts`: parámetro
  pipeline, tipo Pipeline reutilizado y contrato actualizado de la respuesta.
- `src/routeTree.gen.ts`: registro generado de la nueva ruta.
- `tests/daily-meetings.cjs`, `tests/loading-dashboard.cjs`, `package.json`: pruebas
  del reporte y de su integración, registradas en la suite del proyecto.

## Verificaciones

- API real, rango 2026-10-01 a 2026-10-27, a través de la ruta local: HTTP 200
  en los seis identificadores. Días recibidos: VSL 23, all 24, OEI 8, LIG 24,
  Orgánico 19 y Gira 1. Todos sin advertencias, con detalle completo y totales
  oficiales iguales a la suma de los días.
- En VSL se verificaron exclusivamente los calendarios
  VSL PAGADO - CIRCULO MILLONARIO y VSL PAGADO - EQUIPO MILLONARIO.
- Regresión real de `/api/reports/vsl-closers?pipeline=vsl&includeDetail=false`:
  HTTP 200, 22 días de cohorte Landing VSL, acumulados conservados y todos los
  registros individuales completos, con todos sus campos preservados. Sus columnas,
  total general y modal no se modificaron en esta sincronización del filtro.
- Las comparaciones reales se hicieron en memoria, sin guardar respuestas ni
  imprimir registros personales o credenciales.
- 31/31 pruebas de reuniones/integración aprobadas: autenticación privada, pipeline,
  calendario y fechas,
  varios embudos, varias citas del mismo contacto, rangos, errores, vacío,
  advertencias sin alterar cifras, ordenamiento, modal por fecha, cierre/foco,
  cambio de rango y respuesta tardía mediante React Query real.
- Suite completa: 191 aprobadas, 24 fallidas y una omitida. Los fallos son
  exactamente los mismos que antes de este cambio.
- TypeScript, lint de archivos modificados y build Vite/Vercel aprobados.
- No se desplegó el cambio ni se realizó una comprobación visual en el navegador
  publicado. La prueba de interacción utiliza el código real con hooks controlados.
