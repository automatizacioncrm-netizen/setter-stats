# Diagnóstico del reporte VSL / OEI / LIG

Fecha: 25 de septiembre de 2026.

## A. Causa del 502 comprobada

La URL configurada en `APPS_SCRIPT_URL` devuelve HTTP **200**, Content-Type
`application/json; charset=utf-8`, después de seguir la redirección de Google:

```json
{"ok":false,"error":"No se encontró la columna: Secuencia"}
```

Ocurre con `pipeline=all`, `vsl`, `oei` y `lig`. También se reprodujo con la
petición completa del usuario a la ruta HTTP real de TanStack en el puerto 8080.
No es un problema de CORS, proxy, JSON.parse, autenticación ni timeout en estas
consultas: el servicio ejecuta código y devuelve una excepción de lectura del Sheet.
No se observó un límite de longitud de URL o payload.

En el Apps Script adjuntado por el usuario, `API_BUILD_VSL_REPORT` llama a
`SHEET_GET_DATA_SHEET()`, lee los encabezados de la primera fila y ejecuta
`API_HEADER_INDEX(headers, "Secuencia")`. Esta función exige coincidencia exacta
después del trim y lanza ese error cuando no encuentra la columna. El acceso está
antes del filtrado por pipeline. `doGet` captura la excepción y devuelve `ok:false`.

No se pudo inspeccionar el Sheet remoto ni la implementación de
`SHEET_GET_DATA_SHEET()`: falta determinar por qué esa hoja no contiene el encabezado
esperado (hoja seleccionada, encabezado o implementación publicada). No se presume
que otro nombre de columna sea equivalente.

En TanStack, `requestScript` en
`src/server/adapters/apps-script.adapter.server.ts` convertía todo `ok:false` en
«Apps Script no pudo completar la operación», perdiendo el error original.
Conservar HTTP 502 es correcto mientras falle el servicio del que depende el reporte.

**No se modificó Apps Script ni el Sheet.** El archivo local `apps-script/10_API.gs`
ya tenía cambios preparados antes de esta tarea; se conservaron. El código adjunto
actual sí incluye los tres pipelines, aunque algunos comentarios todavía mencionan
solo dos. Su contrato se probó ejecutándolo sin modificaciones con un Sheet simulado.

## B. Archivos modificados en esta tarea

- `src/server/adapters/apps-script.adapter.server.ts`: LIG, omisión de null/undefined,
  diagnóstico HTTP/texto/JSON, errores saneados y logs opcionales.
- `src/server/config/env.server.ts`: detalles de error solo fuera de producción.
- `src/server/api/report.api.server.ts`: valida LIG y registra un resumen final opcional.
- `src/server/mappers/vsl-response.mapper.ts`: conserva ligBookers y bookers; usa las
  opciones de agendadores del contrato, sin sustituirlas por el agregado de OEI.
- `src/types/reports.ts`: tipo Pipeline y personas de LIG.
- `src/lib/pipeline-summary.ts`: incluye LIG al sumar Todos; mantiene respuestas antiguas.
- `src/components/reports/DashboardFilters.tsx`: opción LIG, roles separados,
  calendarios y estados recibidos del backend.
- `src/components/reports/SalesSection.tsx`: acepta LIG manteniendo setter y agendador.
- `src/pages/VslClosersDashboard.tsx`: título, estados y agregado de agendadores de LIG.
- `src/services/reports.ts`: muestra el detalle saneado de desarrollo y omite valores nulos.
- `tests/lig-report.cjs` y `package.json`: pruebas de compatibilidad y diagnóstico.
- Este documento.

## C. Contrato preservado

La ruta continúa siendo `GET /api/reports/vsl-closers`. El servidor envía
`action=vsl_report` y `key` en una petición GET a Apps Script, usando URLSearchParams
para codificar los valores y `redirect: "follow"`. El secreto permanece en el servidor.

Apps Script devuelve `{ok:true,data:{...}}`. Sus filas están en `data.detail.rows`,
la paginación en `data.detail.pagination`, y las opciones en
`data.filters.available`. TanStack conserva su respuesta mapeada existente:
`detail`, `detailTotal`, `detailPage`, `availableCalendars`, `availableBookers`, etc.
No se introdujo un contrato alternativo de `data:[]`.

Se conservan pipeline, calendar, dateFrom/dateTo, setter, booker, closer, status,
vslOrigin, includeDetail, search, page/pageSize y sort/direction. `leadType` se envía
solo para VSL; para los demás se usa el valor all por defecto de Apps Script.

Los roles siguen separados:

| Parámetro | Columna de Apps Script | Campo de respuesta |
| --- | --- | --- |
| setter | Setter asignado | setterAsignado |
| booker | Creado por cita | agendadorCita / createdByUserName |
| closer | Closer cita, con el fallback definido en Apps Script | closerCita / closerAsignado |

LIG muestra los calendarios que devuelve Apps Script. No se agregan calendarios
ni IDs artificiales desde el frontend. Las pruebas usaron los nombres
`Lanzamiento Interno Gratuito - EM` y `Lanzamiento Interno Gratuito - CM`.

## D. Diagnóstico de desarrollo

Ejemplo real recibido ahora desde TanStack:

```json
{
  "message": "Apps Script request failed",
  "status": 502,
  "upstreamStatus": 200,
  "contentType": "application/json; charset=utf-8",
  "details": "{\"ok\":false,\"error\":\"No se encontró la columna: Secuencia\"}"
}
```

`status` es el estado del proxy; `upstreamStatus` es el HTTP real de Google.
En producción se omiten los detalles. Los errores HTTP, HTML, JSON inválido,
fallos de transporte y respuestas `ok:false` no se convierten en reportes vacíos.
Los timeouts conservan HTTP 504; el límite del reporte sigue siendo 15 segundos.

Para activar temporalmente los logs, iniciar el proceso con `REPORTS_DEBUG=true`
y `NODE_ENV` distinto de production. Por ejemplo en PowerShell:

```powershell
$env:REPORTS_DEBUG = 'true'
node node_modules/vite/bin/vite.js --host 127.0.0.1
```

Los logs incluyen parámetros, URL saneada, estado, Content-Type, redirección,
duración, respuesta cruda/parseada limitada a 16.000 caracteres y resumen final.
Se redacta el secreto configurado y los campos de credenciales reconocidos.
Los logs están apagados por defecto. Para desactivarlos: quitar REPORTS_DEBUG
del entorno del proceso y reiniciar el servidor.

## E. Comandos y pruebas

Se usó Node directamente porque `npm` no está disponible en el PATH de esta sesión:

```powershell
# Ruta al segundo archivo adjunto, conservado sin modificaciones:
$env:APPS_SCRIPT_CONTRACT_PATH = 'C:\Users\User\.codex\attachments\b88aa869-a10f-4412-9023-ed88ffbd1736\Texto pegado.txt'
node --test tests/lig-report.cjs tests/consolidated-report.cjs tests/reconciliation.cjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
node --test tests/report.cjs tests/loading-dashboard.cjs tests/appointments.cjs tests/consolidated-report.cjs tests/reconciliation.cjs
```

Sin APPS_SCRIPT_CONTRACT_PATH solo se omite la prueba opcional que ejecuta el
archivo adjunto. Las demás pruebas nuevas siguen ejecutándose normalmente.

## F. Resultados

- **20/20 pruebas enfocadas pasan**, incluida la ejecución del Apps Script adjunto
  sin modificaciones con servicios de Google simulados. Cubren los cuatro valores
  de pipeline, filtros, roles separados, búsqueda, fechas, paginación, orden de la
  página, calendarios, totales, errores HTTP/JSON/HTML, timeout y secretos.
- **Build de cliente, SSR y Nitro correcto.** El primer intento tuvo EPERM al
  resolver enlaces de Windows dentro del sandbox; se repitió con autorización y pasó.
- **Typecheck pendiente por errores previos** en los servicios sin uso
  `src/services/reportApi.ts` y `src/services/reportView.ts`: tipos VslReport y
  VslReportResponse inexistentes y un spread sin tipo válido. No pertenecen al
  flujo activo `src/services/reports.ts` → ruta TanStack → adaptador.
- **Suite histórica: 20 pasan / 21 fallan.** Se ejecutó también contra una copia
  del estado anterior a estos cambios (índice Git, conservando los cambios previos
  del usuario): mismos 21 casos fallidos. Incluye expectativas antiguas del reporte,
  mocks del dashboard y un problema de carga CJS/ESM con Node 24. No se ocultaron fallos.
- **Datos remotos: todavía bloqueados.** Todas las consultas reales enumeradas
  abajo devuelven el error de Secuencia; las pruebas simuladas no demuestran que
  los datos remotos estén disponibles.

## G. URLs reales probadas

Las cuatro devolvieron HTTP 502 con upstreamStatus 200 y el error de Secuencia:

```text
http://127.0.0.1:8080/api/reports/vsl-closers?pipeline=all
http://127.0.0.1:8080/api/reports/vsl-closers?pipeline=vsl
http://127.0.0.1:8080/api/reports/vsl-closers?pipeline=oei
http://127.0.0.1:8080/api/reports/vsl-closers?pipeline=lig
```

También se probó la petición completa inicial:

```text
http://127.0.0.1:8080/api/reports/vsl-closers?pipeline=all&calendar=&dateFrom=&dateTo=&setter=&booker=&closer=&status=&vslOrigin=&includeDetail=false&search=&page=1&pageSize=25&sort=nombreContacto&direction=asc
```

Se consultó directamente la URL /exec configurada, con los cuatro pipelines y
credenciales omitidas del registro compartido: HTTP 200, JSON y el mismo error.
No se cambiaron `.env`, despliegues ni configuración remota.

## H. Pendientes y límites del Apps Script actual

1. Confirmar que APPS_SCRIPT_URL apunta a la implementación correcta y qué hoja
   devuelve SHEET_GET_DATA_SHEET(). Esa hoja debe tener el encabezado exacto
   `Secuencia` que requiere el script. Cambiar filtros en TanStack no evita la
   validación. Si existe otra URL publicada correcta, puede actualizarse `.env`
   y reiniciarse TanStack sin cambiar Apps Script.
2. El script pagina el detalle pero ignora `sort` y `direction`. Se conserva el
   comportamiento existente de TanStack: ordenar las filas de la página recibida.
   **No es un orden global entre páginas.** No se descargaron todas las páginas
   para simularlo ni se cambió la arquitectura de paginación.
3. El script no lee `includeDetail`; siempre construye su página de detalle.
   TanStack hace una sola consulta y devuelve `detail:[]` cuando vale false.
   No puede evitar el trabajo interno de Google con ese contrato inmutable.
4. Las fechas tienen tres cohortes independientes por diseño del script: leads
   y detalle usan `Creado el`; agendamientos usan `Fecha cita` con fallback a
   `Fecha de reunión`; ventas usan `Fecha de primer pago`. Se verificó y preservó
   esa semántica, también para LIG.
5. No es posible certificar que se muestran datos reales sin errores mientras
   Google devuelva `ok:false`. No se sustituyó ese error por éxito ni datos ficticios.
