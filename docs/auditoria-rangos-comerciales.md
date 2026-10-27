# Auditoría de rangos comerciales — 27/10/2026

## Diagnóstico demostrado

El proyecto usa TanStack Start, React Query y Vite, no Next.js. La ruta
`src/routes/api.reports.vsl-closers.ts` delega en `reportApi` de
`src/server/api/report.api.server.ts`. La respuesta de Apps Script pasa por
`mapVslReportResponse` y después por `mapPerformance`.

`mapPerformance` compartía un esquema de asistencia para Setter y Closer con
la condición `citasAsistidas <= agendamientos`. Un fixture con cuatro
agendamientos y cinco asistencias reproducía exactamente el error
«La API entregó indicadores incompletos o inconsistentes». Al rechazarse el
objeto completo `performance`, `ExecutivePerformance` mostraba ese mismo
error en las secciones 2 y 3, sin afectar las otras secciones.

Se quitó esa condición exclusivamente para Setter: las fechas de creación
y reunión representan cohortes distintas. Closer conserva la condición de
subconjunto por fecha de reunión. Se mantienen los campos obligatorios,
conteos enteros finitos no negativos, porcentajes finitos o nulos, nombres
únicos y conciliaciones de totales. Los diagnósticos individuales siguen
siendo opcionales; no se agregaron ceros para reemplazar campos faltantes.

Además, `ExecutivePerformance` descartaba setters con cero agendamientos.
Ahora conserva sus filas si tienen asistencias; el denominador cero continúa
mostrando «No aplicable». Los porcentajes superiores a 100 ya eran aceptados
y ahora pueden llegar a la tabla sin el rechazo por conteos.

## Fechas, estado y concurrencia

`DashboardFilters` usa el mismo estado `filters` que el query principal de
`VslClosersDashboard`. `rangeForPreset` calcula Este mes hasta hoy y Mes pasado
completo usando America/Lima. Los valores personalizados son cadenas YYYY-MM-DD;
servicio, ruta y adaptador los transmiten sin convertirlos a UTC.

`runFilterTransition` aplazaba `apply()` dos animation frames y cancelaba los
frames previos al recibir otro cambio. Dos ediciones rápidas podían perder
la primera actualización. Ahora cada actualización se aplica inmediatamente;
solo la animación y su temporizador se cancelan. La prueba usa los handlers
reales y edita Desde, Hasta=20 y Hasta=25 antes de ejecutar los frames: tanto
la interfaz como la clave de consulta conservan 26/09–25/10.

No se encontró una constante que sustituya el día 25 por el 20. Este defecto
de cancelación no demuestra el origen de la petición histórica observada:
una petición del día 20 también puede ser una selección intermedia legítima.
Para atribuir ese caso concreto faltan la traza de red y su secuencia temporal.

React Query identifica cada consulta por filtros completos, detalle y fuentes;
consume AbortSignal, no usa placeholderData del período anterior y asocia
datos/carga/error a la clave vigente. No se modificó esa lógica. El contexto
de opciones es deliberadamente independiente del rango. Servicio, proxy y
adaptador usan no-store. Apps Script local compara los límites de fechas de
forma inclusiva. No se verificó el despliegue remoto ni se ejecutó una prueba
de navegador real con respuestas HTTP reordenadas.

## Backend y límites

Se intentaron lecturas reales A, B y C con la configuración privada local.
Fallaron por DNS: ENOTFOUND para script.google.com. No se guardaron secretos
ni respuestas comerciales en este documento.

La copia `apps-script/10_API.gs` conserva una lógica anterior: asistencia de
Setter sobre citas creadas dentro del período y atribución de ventas mediante
citas históricas asistidas. Difiere de las reglas recientes descritas por el
usuario. No se editó: no hay evidencia de que sea la versión desplegada.
Queda pendiente comprobar el contrato y la atribución comercial en producción.

## Verificación

- A: vsl, 2026-10-01 a 2026-10-27: fixture, parámetros exactos y tablas válidas.
- B: vsl, 2026-09-26 a 2026-10-25: fixture con 125% de asistencia Setter, válido.
- C: all, mismo rango personalizado: fixture, alcance y tablas válidos.
- Fixture con cero agendamientos y dos asistencias: fila visible y No aplicable.
- Conteos negativos, decimales, cadenas o nulos: siguen rechazados.
- Closer con asistencias mayores que citas asignadas: sigue rechazado.
- Cambios rápidos Este mes → Personalizado y ediciones antes del siguiente frame:
  conservan ambos límites y la última fecha.
- Pruebas focalizadas: 69/69 aprobadas.
- Suite configurada en package.json: 161 aprobadas, 24 fallidas, 1 omitida.
  Comparación con HEAD mediante lectura de los cinco archivos originales:
  158 aprobadas, las mismas 24 fallidas y 1 omitida. Las tres pruebas nuevas pasan.
- TypeScript y build Vite/Vercel: aprobados.
- ESLint de los tres archivos fuente modificados: aprobado.
- ESLint sobre src: 5888 errores y 6 advertencias, principalmente formato CRLF
  en archivos ajenos al cambio. El comando global `eslint .` se inició, pero
  se interrumpió tras varios minutos sin resultado; recorre también carpetas
  generadas no excluidas por la configuración actual. No se hicieron cambios
  masivos de formato para resolver incidencias ajenas a esta corrección.

Los cambios de producción se limitan a `performance.mapper.ts`,
`ExecutivePerformance.tsx` y `VslClosersDashboard.tsx`. No se editaron cálculos
comerciales, Apps Script, filtros de personas/calendario, rutas ni las otras
secciones del reporte. No se desplegó ni se publicó ningún cambio.
