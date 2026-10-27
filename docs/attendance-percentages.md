# Asistencia sobre agendamientos — 27/10/2026

## Corrección

- Citas por fecha de reunión: `asistidos / totalCitas × 100`.
- Landing VSL: `asistidos / oportunidadesConCita × 100`, sin utilizar oportunidades
  creadas ni totalLeads como denominador.
- Ambas tablas priorizan `porcentajeAsistencia` de la API, ya en escala 0–100.
  Si falta o es null se usa la fórmula correspondiente. Con denominador cero se
  muestra `0.00 %`. Nunca se promedian porcentajes diarios para el pie general.
- La tabla diaria reemplaza únicamente su columna Sin estado por % Asistencia,
  después de No asistidos. Los datos de Sin estado, sus validaciones y el modal
  se conservan.

La causa de Landing VSL era el mapper: descartaba el porcentaje de la API y lo
recalculaba sobre oportunidades creadas. Además, una validación exigía ese mismo
denominador antiguo y habría rechazado los porcentajes nuevos válidos. Se retiró
esa comprobación obsoleta; se mantienen los controles de tipos finitos, rango del
porcentaje, conteos, fechas, duplicados, detalles y conciliaciones oficiales.

## Archivos

- `src/lib/attendance-percentage.ts`: cálculo de respaldo compartido con protección
  de cero y valores no finitos. Una base de agendados ausente permanece no disponible.
- `src/components/reports/DailyMeetingsReport.tsx`: columna, formato con dos decimales,
  ordenamiento y porcentaje oficial/ponderado en TOTAL GENERAL.
- `src/components/reports/LandingVslCohortDetail.tsx`: porcentaje de la API o respaldo
  sobre agendados para filas y pie; conserva todas las columnas y el modal.
- `src/server/mappers/landing-vsl-cohort.mapper.ts`: conserva el porcentaje recibido
  en días y total, usa el nuevo respaldo y elimina la validación del denominador viejo.
- `src/server/api/daily-meetings.api.server.ts`: conserva porcentajes diarios y
  generales y transmite el calendario seleccionado.
- `src/types/reports.ts`, `src/types/daily-meetings.ts`: tipos compatibles con porcentajes
  opcionales y ausentes sin inventar cifras.
- `src/pages/VslClosersDashboard.tsx`, `src/services/daily-meetings.ts`,
  `src/server/adapters/apps-script.adapter.server.ts`: transmiten calendar literalmente,
  junto con pipeline/fechas. Caché y selección del modal incluyen calendar.
- Pruebas en `tests/daily-meetings.cjs`, `tests/landing-vsl-cohort.cjs` y
  `tests/loading-dashboard.cjs`.

No se modificaron Apps Script, KPI del resumen, tablas de Setter/Closer, ventas,
estilos globales ni la lógica de Actualizar datos.

## Verificación

- 50/50 pruebas focalizadas aprobadas, incluyendo 7/4 → 57.14 %, 10/5 → 50.00 %,
  0/0 → 0.00 %, y Landing 9/4/2 → 50.00 %, 10/3/1 → 33.33 %, 12/7/0 → 0.00 %.
- Se probó prioridad del valor de la API, sin multiplicarlo otra vez, y respaldo
  ponderado de totales: reuniones 9/17 → 52.94 %, Landing 3/14 → 21.43 %.
- API real, pasando por ambas rutas locales, del 01/10/2026 al 27/10/2026:
  HTTP 200. Primer día de reuniones: siete citas, cuatro asistidas, 57.14 %;
  total general de la API 25.47 %. Primer día Landing: nueve creadas, cuatro
  agendadas, dos asistidas, 50.00 %; total general de la API 29.00 % y detalles completos.
- En VSL solo aparecen los dos calendarios pagados permitidos. Se consultó cada
  calendario por separado y ambas respuestas reales incluyeron exclusivamente
  el calendario solicitado. No se filtraron registros en el frontend.
- TypeScript, lint de archivos modificados y build Vite/Vercel aprobados.
- Suite completa: 191 aprobadas, 24 fallidas y una omitida; exactamente los mismos
  fallos que antes de la corrección, sin fallos nuevos.

Las verificaciones reales se realizaron en memoria, sin guardar respuestas con
datos personales ni imprimir credenciales. No se desplegaron cambios ni se realizó
una comprobación visual del navegador publicado.
