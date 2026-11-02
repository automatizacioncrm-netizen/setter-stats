# Tabla 3: validación mensual y estado del despliegue actual

## Cambios en el proyecto

- `src/lib/appointments-by-funnel.ts`: claves mensuales que conservan el año de etiquetas reales como OCTUBRE 2026, orden cronológico, rechazo de cortes o rangos incompatibles, validación de ratios y de TOTAL = ASISTIDOS + CANCELADOS REALES + NO SHOW + CONFIRMADOS + OTROS. No suma intervalos ni reemplaza métricas.
- `src/components/reports/VslQualityReport.tsx`: versión de caché calendar-month-funnels-v6 para no conservar respuestas de la estructura anterior. Sin cambios de lógica comercial en Tablas 1 y 2.
- `scripts/validate-vsl-table3.cjs`: auditoría repetible y de solo lectura del histórico, mes completo y parcial. Compara todas las métricas, no solo el total. No sincroniza GHL ni modifica Sheets.
- `tests/vsl-quality.cjs`: regresiones de meses/años, filtros, duplicados de agregados, estados, porcentajes y conservación de Tablas 1 y 2.

La organización de tres subtables independientes y sus columnas se conserva. Meses completos y rangos parciales válidos muestran el nombre del mes; un filtro de varios meses utiliza las filas separadas del backend. No existe una segunda consolidación de citas en React.

## Verificación de producción

La comprobación inicial del despliegue nuevo devolvió todavía históricos distintos al filtro de octubre completo: orgánico 40 frente a 49; VSL 155 frente a 192; LIG 90 frente a 106. La discrepancia ya estaba en las respuestas HTTP, antes del renderizado. No se sustituyeron números en el cliente para hacerlos coincidir.

La auditoría más reciente, ejecutada después con `node scripts/validate-vsl-table3.cjs 2026-10`, terminó con passed:true y código 0. Histórico y filtro completo ahora coinciden en todas las métricas:

| Grupo | Total octubre | Asistidos | Restantes | Cancelados | No show | Confirmados | Otros |
|---|---:|---:|---:|---:|---:|---:|---:|
| Orgánico | 49 | 29 | 20 | 7 | 10 | 3 | 0 |
| VSL Pago | 192 | 50 | 142 | 92 | 33 | 17 | 0 |
| LIG | 106 | 33 | 73 | 32 | 35 | 6 | 0 |

Los ratios coinciden con los cocientes de sus totales, sin recalcular los valores mostrados. Existe una única fila de octubre por embudo. La consulta parcial 2026-10-10 a 2026-10-20 confirma el filtro inclusivo y devuelve una fila por grupo. El rango 2026-10-22 a 2026-11-05 fue comprobado además con seis filas: octubre y noviembre separados para cada grupo. Las Tablas 1 y 2 conservan los contratos y sus filas del intervalo.

No se hizo otra sincronización para esta validación. El histórico utiliza únicamente las filas disponibles del endpoint; no se inventan meses ni citas.

## Alcance y limitación de la auditoría

El repositorio y los adjuntos no contienen el API.gs vigente con VSL_FUNNEL_REPORT_, VSL_FUNNEL_FULL_MONTH_PERIODS_, VSL_HTTP_BUILD_ y VSL_RANGE_BUILD_. `apps-script/10_API.gs` corresponde a la otra integración y no se modificó. No se reemplazó API.gs ni se duplicó ninguna de esas funciones. Se solicitó la ruta o el código actual al usuario.

No hay acceso directo a las filas de VSL_APPOINTMENTS. Por tanto, no se pudo comprobar si existe `_Appointment Updated At`, cómo se compara su hora, qué fila se conserva en empates ni si la versión vigente elimina o cancela correctamente una cita. Tampoco se certifica desde agregados la deduplicación por Appointment ID. Las pruebas locales de filas agregadas duplicadas no sustituyen esa prueba de origen.

La causa interna de la discrepancia inicial (deduplicación, cobertura temporal, materialización o versión desplegada) no puede atribuirse de forma concluyente sin ese código y/o datos. Sí quedó probado que era anterior al frontend y que el endpoint actual ya devuelve histórico y mes completo consistentes.

No se necesita publicar Apps Script por los cambios locales de este documento. Para auditar o corregir la deduplicación pendiente se necesita el código vigente; cualquier parche debe aplicarse allí de forma localizada, preservando VSL_KPI_CFG.periods, calendarios, sincronizadores, doPost y demás contratos.

## Pruebas

- 24 pruebas pertinentes aprobadas.
- TypeScript, lint del código modificado y del auditor, y build de producción correctos.
- Suite configurada completa: 255 pruebas, 230 aprobadas, 24 fallidas, 1 omitida.
- Auditoría HTTP real: passed:true para histórico, octubre completo y parcial. No se realizó una revisión visual manual en navegador.
