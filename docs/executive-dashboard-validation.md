# Validación del dashboard comercial — 10/10/2026

## Implementación local

Configuración central en `src/lib/report-team.ts`: tres closers y seis setters, con identificadores internos estables (no son User IDs de GHL), normalización exacta de tildes, mayúsculas y espacios, y únicamente los alias confirmados por el usuario. Los selectores incluyen todo el equipo, incluso sin actividad. No hay coincidencias parciales ni mapeos inventados de IDs externos.

`ExecutivePerformance.tsx` consume directamente las tres colecciones de `performance`. Cada tabla completa tiene 3, 6 y 3 filas respectivamente. Agrega los alias por identidad canónica, completa personas ausentes con cero y calcula los porcentajes sobre sus conteos. Con denominador cero muestra «No aplicable». Los errores o contratos incompletos se muestran explícitamente, sin fabricar ceros ni descargar todas las páginas de Calendar.

Las personas excluidas permanecen en la respuesta original, los totales comerciales y el diagnóstico; sus eventos no se reparten entre integrantes del equipo. El diagnóstico indica ventas de otros responsables y citas fuera del equipo de setters. Los gráficos y estados de Calendar usan los mismos seis nombres. El pie de la tabla se llama «Total equipo visible» y no abre un detalle general que contenga personas excluidas. Las tarjetas generales conservan los conteos originales. No se encontraron exportaciones de desempeño individual en estos componentes.

Selector comercial: Todos (VSL + OEI), VSL | Closers y Lanzamiento I. Pagado OEI - EM. En Todos se exige alcance comercial `vsl+oei` y actividad `vsl+oei+lig`; en una selección específica se exige el embudo seleccionado. La API antigua que incluya ventas LIG en Todos genera un error explícito, no una colección financiera recortada artificialmente.

La tabla financiera conserva todas las ventas y separa embudo/producto/moneda; no convierte moneda vacía a USD ni limita porcentajes al 100 %. El detalle de ventas y sus filtros se conservan.

## Contrato y comprobaciones reales

El mapper local anterior eliminaba `performance` de la respuesta de Apps Script. `performance.mapper.ts` valida el contrato completo, los conteos, la asistencia no superior a las citas asignadas, las filas repetidas y la conciliación de ventas atribuidas/no atribuidas/ambiguas contra el total cuando están informados. `vsl-response.mapper.ts` ahora conserva ese contrato y valida el total comercial. Estas comprobaciones de agregados no sustituyen la verificación de IDs dentro del productor.

Lecturas GET autenticadas contra el Apps Script configurado localmente, sin imprimir credenciales:

- Todos: 78 ventas (45 VSL, 33 OEI); conversión VSL + OEI. Actividad: 1.303 citas, incluidas 89 LIG.
- OEI: 33 ventas; 22 sin cita asistida y ninguna ambigua. Equipo visible: Fiorela 11 asistencias / 3 ventas; Ezequiel 11 / 5; Amaranta 7 / 2. Existe otra venta atribuida a un ID externo no resuelto, conservada fuera del equipo.
- VSL: 45 ventas; 9 sin cita asistida y 1 ambigua. Fiorela 43 asistencias / 6 ventas; Ezequiel 81 / 5; Amaranta 72 / 8.

La API pública devolvió 79 ventas (46 VSL, 33 OEI), ninguna LIG y ningún `performance`. La diferencia de una venta VSL entre ambas lecturas no puede atribuirse a LIG. No se verificó que producción y la configuración local usen exactamente la misma versión/dataset. El frontend y backend local deben desplegarse para publicar el mapper nuevo.

## Pendientes que requieren el código de Apps Script desplegado

Los adjuntos recibidos contienen solicitudes, pero no el archivo nuevo `10_API.gs`. El archivo del repositorio es una versión anterior, VSL solamente, que no genera `performance` ni usa los builders de oportunidades/citas maestros de la API actual. No se reemplazó la API desplegada con esa versión antigua.

Falta verificar y, si procede, implementar en el productor:

1. VSL: setter asignado con creador de cita como respaldo. OEI/LIG: creador de cita con setter asignado como respaldo. El helper de detalle local ya respeta esta prioridad, pero los agregados dependen del productor.
2. Búsqueda por setter sobre ambos campos, conteo por Appointment ID único y atribución de ventas por Opportunity ID único; los agregados recibidos no contienen el detalle necesario para demostrar estos cruces.
3. Resumen compacto de leads VSL sin ninguna cita histórica, por oportunidades únicas y cohortes de creación. No se usa la resta de leads menos citas como sustituto. El panel informa su falta de disponibilidad.

Por ello, no se certifica todavía la atribución de origen ni la conciliación individual de todas las ventas. Se necesita la ruta o contenido de la versión desplegada de Apps Script para completar estos puntos y determinar el despliegue requerido. No se modificaron Sheets, GHL, sincronizaciones ni importes originales.

## Archivos involucrados

- `src/lib/report-team.ts`, `setter-performance.ts`, `report-filter-state.ts`, `report-record.ts`: equipo, alias, restricciones y fallback de detalle.
- `src/components/reports/ExecutivePerformance.tsx`, `ExecutiveTable.tsx`, `SetterStatusTable.tsx`, `DashboardFilters.tsx`: tablas, diagnóstico, porcentajes, estados y selectores. `SetterStatusChart.tsx` recibe la restricción mediante la utilidad compartida.
- `src/pages/VslClosersDashboard.tsx`: integración y consultas canónicas de personas.
- `src/server/mappers/performance.mapper.ts`, `vsl-response.mapper.ts`, `src/types/reports.ts`: preservación y validación del contrato.
- `src/lib/merge-filtered-reports.ts`: evita presentar como completo el desempeño de consultas solapadas por alias.
- `SalesFinancialTable.tsx`, `SalesSection.tsx`, `src/lib/executive-metrics.ts`, `sales-detail.ts`: presentación financiera por moneda y métricas.
- `src/services/reports.ts`: mantiene los servicios de detalle; la sección ejecutiva ya no llama a la descarga completa de citas.
- `tests/performance-contract.cjs`, `setter-performance.cjs`, `report-filter-ux.cjs`, `executive-metrics.cjs`, `appointment-detail.cjs`, `loading-dashboard.cjs`, `frontend-report-semantics.cjs`, `lig-report.cjs`, `package.json`: contrato, filas exactas, alias, personas excluidas, ceros, alcances, porcentajes y regresiones.

## Validación final

- TypeScript: pasa.
- ESLint de 18 archivos de código modificados: pasa.
- Compilación de producción: pasa. Nitro requirió ejecución fuera del sandbox por el EPERM de resolución de dependencias ya observado. No es un despliegue.
- Suite completa: 129 pruebas, 120 aprobadas, 8 fallidas y 1 omitida. Los fallos restantes son previos: siete contratos/configuraciones antiguas en `report.cjs` y una carga CommonJS en `appointments.cjs`. La prueba omitida requiere una ruta externa de contrato Apps Script no configurada.
- Pruebas focalizadas: las nuevas restricciones de equipo, alias, porcentajes, scopes, errores y conservación de totales pasan; se comprobó renderizado React estático, no una revisión visual interactiva.
- Sin commits, push, despliegues ni escrituras al origen.
