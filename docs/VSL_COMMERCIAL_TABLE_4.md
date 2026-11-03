# Tabla 4: reporte comercial VSL

Ubicación: `/reports/vsl-calidad`, después de Tabla 3. Mantiene las Tablas 1–3 y el fondo actual.

## Conexión

`GET /api/reports/vsl-commercial?month=YYYY-MM` utiliza el transporte privado existente y exclusivamente `APPS_SCRIPT_URL_VSL`, con `action=commercial`. Conserva la validación, timeout y saneamiento de errores del transporte. La URL privada nunca se devuelve al navegador. No ejecuta sincronizaciones ni modifica Sheets.

Solicita un mes por consulta; el cliente comparte resultados por mes, no reconsulta por render/foco y tiene actualización manual. El servidor comparte peticiones idénticas en curso. Los errores se muestran por mes, sin reutilizar los resultados de otro período.

## Presentación y datos

Once columnas con productos paralelos; mes fusionado mediante rowSpan. Primero se valida la estructura y los campos comunes de todas las filas, después se excluyen los productos distintos de EQUIPO MILLONARIO y CIRCULO MILLONARIO y se valida el contrato estricto. Los errores numéricos incluso en filas excluidas se mantienen. El pivot no suma registros duplicados permitidos: los rechaza por contrato. Usa closerId cuando viene presente; de lo contrario conserva el nombre original como identidad normalizada por mayúsculas. No fusiona FIORELA/FIORELLA sin confirmación de identidad.

Conversión: ventas/asistencias; cero/cero muestra 0.00%, ventas sin asistencia N/D. El cash se mantiene separado por moneda, sin conversión ni atribución en frontend. Productos inexistentes muestran guiones.

Los filtros de año, meses, closer y producto son exclusivos de Tabla 4. Inicialmente consulta julio–octubre de 2026; puede seleccionarse otro año/rango. Actualizar tabla 4 recarga solo sus meses. Al completarse una sincronización global se vuelven a consultar los meses activos. APROBADO es una etiqueta visual, no una certificación de los datos.

## Validación ejecutada

- Health y commercial reales accesibles.
- Auditoría `node scripts/validate-vsl-commercial.cjs`: julio 4 filas/2 closers, agosto 6/3, septiembre 6/3, octubre 7/4. Conservación exacta de asistencias, ventas, cashPEN y cashUSD al pivotar.
- Octubre: API informa 15 ventas del mes, 1 atribuida y 14 sin atribuir. No se reasignan en frontend; diagnósticos disponibles bajo la tabla.
- 5 pruebas nuevas de transformación, identidad, monedas, ratios, contrato, transporte y renderizado (11 columnas).
- 26 pruebas existentes del reporte pasan.
- Suite completa: 262 pruebas, 237 aprobadas, 24 fallidas, 1 omitida. Son los 24 fallos preexistentes registrados antes de esta tarea.
- TypeScript, lint de archivos modificados y build correctos.

Los agregados no permiten auditar la atribución sobre filas originales de Sheets ni verificar la exhaustividad de GHL. No se han cambiado fórmulas de Apps Script.

## Corrección de exclusión de productos

Auditoría real posterior: octubre 12 filas recibidas / 1 excluida / 11 permitidas; septiembre 21 / 6 / 15; agosto 15 / 0 / 15; julio 15 / 1 / 14. La exclusión ocurre antes de generar los closers, agrupar productos o calcular ventas, conversiones y cash. No cambia el endpoint, la variable privada, el diseño de once columnas ni otras tablas. 33 pruebas pertinentes aprobadas; TypeScript y lint de archivos modificados correctos.
