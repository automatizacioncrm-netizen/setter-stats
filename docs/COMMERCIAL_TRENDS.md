# Conversión mensual por closer y producto

## Archivos principales

- `apps-script/vsl-commercial/API.gs`: API completa basada en el adjunto más reciente del usuario (4/11/2026). Conserva todas las funciones y agrega tendencias. Este es el archivo listo para publicar.
- `tests/fixtures/vsl-api-before-trends.gs`: copia original, exclusivamente como referencia de regresión. NO desplegarla.
- `src/lib/commercial-trends.ts`: contrato, rango máximo de 12 meses, normalización/listas blancas existentes, validación de ratios y comparación contra la Tabla 4.
- `src/server/api/commercial-trends.api.server.ts`, `src/routes/api.reports.commercial-trends.ts`: proxy privado del endpoint nuevo; utiliza únicamente APPS_SCRIPT_URL_VSL, comparte solicitudes iguales en curso y conserva los errores de transporte.
- `src/components/reports/CommercialTrendsCharts.tsx`: dos gráficos Recharts responsivos con leyenda, colores compartidos y tooltip de conteos/porcentaje.
- `src/components/reports/VslCommercialTable.tsx`: monta ambos gráficos después de la tabla. Sus columnas, filas, fórmulas y filtros permanecen iguales.
- `tests/commercial-trends.cjs`, `scripts/validate-commercial-trends.cjs`, `package.json`: pruebas y auditoría real posterior al despliegue.
- `src/routeTree.gen.ts`: actualización automática del router.

## Endpoint y funciones

`GET ?action=commercial_trends&from=2026-07&to=2026-11`

Devuelve success, from, to, months (ascendentes), series y generatedAt. Cada fila contiene month, product, closer, asistencias, ventas y conversion. No contiene cash ni detalle privado de oportunidades.

Funciones nuevas:

- COM_SOURCES_: lee VSL DATA y APPOINTMENTS_MASTER una sola vez.
- COM_BUILD_FROM_SOURCES_: contiene el mismo cuerpo comercial original; se extrajeron únicamente las lecturas de Sheets.
- COM_TRENDS_MONTHS_: valida meses y limita a 12 meses inclusive.
- COM_TRENDS_RESPONSE_: utiliza las mismas fuentes y el mismo cálculo comercial para cada mes, con un presupuesto de cálculo de 45 s.
- COM_TRENDS_VERIFY_: auditoría de solo lectura contra COM_BUILD_ por mes. Es una comprobación manual, no se ejecuta en cada consulta.

COM_BUILD_ conserva su firma y valida el mes antes de leer las hojas. Delega al mismo cálculo con sus dos fuentes. COM_API_RESPONSE_, COM_API_PROBAR, reglas de ventas, deduplicación, atribución, cash, hojas y demás endpoints no cambian. Se mantiene conversion=null cuando asistencias=0, incluso si ventas=0; con asistencias>0 y ventas=0 se conserva 0. No hay límite artificial del 100%.

El trabajo por mes sigue procesándose en memoria, pero ya no multiplica las lecturas de Sheets. No se garantiza latencia: las pruebas locales no miden la ejecución de Google sobre los registros reales.

## Caché y coherencia

Los dos gráficos comparten una sola consulta React Query de tendencias por rango/revisión. Reutilizan los resultados ya cargados de las consultas mensuales de la Tabla 4 para comprobar las asistencias y ventas, sin volver a solicitar cada mes desde los gráficos. Los productos y seis closers permitidos se normalizan con las mismas funciones del reporte.

Si la tabla y las tendencias pertenecen a versiones distintas de los datos, se muestra error de coherencia; no se sustituyen cifras ni se dibujan datos contradictorios. El refresco global y el filtro superior renuevan los resultados mediante sus claves existentes. Rango parcial de días y rangos mayores de 12 meses muestran la limitación y no inventan agregados.

Los meses solicitados se muestran como eje temporal. La ausencia de una combinación no genera una métrica cero: queda sin punto. N/D es null y produce un hueco (connectNulls=false). El tooltip distingue N/D de 0.00%. Los meses con asistencias y sin ventas pueden mostrar 0%, aunque la Tabla 4 oculte la fila sin ventas: la comprobación usa sus registros comerciales originales, no convierte filas ocultas en datos inventados.

## Publicación en Apps Script

1. Guardar una copia del API.gs actual en el editor de Google.
2. Reemplazar el contenido de ESE archivo por `apps-script/vsl-commercial/API.gs`. No agregarlo junto al archivo original, pues duplicaría constantes y doGet/doPost. El archivo entregado ya incluye los reportes existentes del adjunto.
3. Guardar y ejecutar manualmente `COM_TRENDS_VERIFY_('2026-07','2026-11')` desde una función temporal de prueba, si se desea comprobar los datos reales antes de publicar. Esta función no escribe Sheets ni sincroniza GHL.
4. Implementar → Administrar implementaciones → editar la aplicación web vigente → Nueva versión → Implementar. Mantener el mismo despliegue /exec y sus permisos existentes; no cambiar APPS_SCRIPT_URL_VSL.
5. Abrir `/exec?action=commercial_trends&from=2026-07&to=2026-11` y confirmar success:true.
6. Ejecutar `node scripts/validate-commercial-trends.cjs 2026-07 2026-11` desde el proyecto. Compara cada mes contra action=commercial y falla si difieren los conteos.
7. Recargar el dashboard. Revisar ambas leyendas, tooltips y huecos N/D. El resto de las tablas conserva sus endpoints.

## Evidencia de validación

El despliegue remoto actual se consultó y respondió `Acción no soportada` para commercial_trends. La nueva versión aún debe publicarse; no se afirma que el endpoint nuevo esté operativo en Google.

Las pruebas ejecutan la API original completa y la nueva con las mismas hojas de prueba en un entorno VM. Comparan íntegramente filas, totales, cash y diagnósticos para julio–noviembre; verifican deduplicación por Opportunity ID y Contact ID/producto, exclusión de ventas sin cita y selección de última versión de Appointment ID. Verifican dos lecturas de hojas en total para los cinco meses, N/D, cero ventas, meses sin datos, parámetros inválidos, duplicados y coherencia con Tabla 4. Estos son datos de prueba exclusivamente; producción usa siempre la API.
