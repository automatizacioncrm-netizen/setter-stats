# NO APLICA en VSL

Implementado localmente, sin publicar ni desplegar.

## Inspección real, 12 de octubre de 2026

La consulta `action=vsl_report&pipeline=vsl&dateFrom=2026-10-01&dateTo=2026-10-12` devolvió HTTP 200 y `ok: true`. **No devuelve `etapasPorEmbudo` ni `vslNoAplica` actualmente**. Sí devuelve `data.vslSeteo.porEtapa`, con la fase exacta `No Aplica(No califica/No desea)` y `total: 5`. Su cohorte tiene 129 leads, 33 seteados y 96 pendientes: `129 = 33 + 96`. La fase está clasificada como `seteado` en la respuesta real. Los pendientes son `Lead Pendiente de Agenda` y `Lead Agendado (Automatico)`.

[Evidencia sin datos personales](./vsl-no-aplica-real-response.json): contiene los agregados reales y el resultado de ejecutar el nuevo normalizador local sobre esos agregados. El campo final es `{ "fase": "No Aplica(No califica/No desea)", "total": 5, "porcentaje": 3.88 }`; **no es un campo ya desplegado en Apps Script**.

## Arquitectura y contrato

El servidor del dashboard normaliza la respuesta antes de entregarla al frontend. `src/server/mappers/vsl-no-aplica.ts` reutiliza `data.etapasPorEmbudo.porEmbudo.vsl.porEtapa` si existe; con la API actual usa el conteo ya agregado de `data.vslSeteo.porEtapa`. Publica en la respuesta propia del dashboard `vslNoAplica` y `etapasPorEmbudo.porEmbudo.vsl.porEtapa`. No vuelve a contar Opportunities ni consulta citas. Calcula únicamente el porcentaje con `totalLeadsVsl`. Rechaza discrepancias de totales o del alias frente al desglose; no oculta un conflicto con un cero.

El frontend consume `report.vslNoAplica.total` y `.porcentaje`, muestra dos decimales, conserva el dato cero y muestra `—` más una advertencia si el campo falta. Solo renderiza la card en `pipeline === "vsl"`, entre Pendientes y Asistió. Conserva la regla anterior que oculta TOTAL DE LEADS al seleccionar un setter: seis cards en VSL sin setter, cinco con setter. Grid de una columna en móvil, dos en tablet, tres en desktop y seis/cinco en pantallas amplias; skeletons concordantes.

Los filtros ya forman parte de la consulta y su clave de caché; no hay clasificación ni persistencia adicional en el frontend. Las respuestas de responsables distintos no reutilizan un alias parcial del primer reporte. OEI, LIG y ALL conservan sus cards anteriores.

## Apps Script local y despliegue futuro

`apps-script/10_API.gs` es una versión anterior al script actualmente desplegado: no contiene la implementación de `vslSeteo` observada en vivo. Se agregó un único agregador de fases sobre su `leadRegistros` ya filtrado y el alias derivado de ese agregador. Lee únicamente `fase`, proveniente de `OPPORTUNITIES_MASTER.Fase`, y separa por pipeline. Normaliza espacios y mayúsculas sin coincidencias parciales. No se modificó ninguna definición de seteo, reconciliación, ventas ni estados de Calendar.

**No reemplazar el script desplegado completo por esta copia anterior**, porque se perdería su implementación más reciente de seteo. Para una futura integración en la versión vigente, reutilizar el desglose ya existente (preferentemente `etapasPorEmbudo`, o `vslSeteo.porEtapa` confirmado) para crear el alias, tal como hace el normalizador. El dashboard local ya es compatible con la API vigente y con el contrato nuevo. Ningún despliegue se realizó en esta tarea.

NO APLICA es un subconjunto informativo de Seteados: no se resta de ese total ni se suma otra vez a la conciliación. Las pruebas verifican igualdad entre el alias y su etapa, fases distintas/OEI/LIG, cohorte filtrada por período y setter, normalización, dato ausente, inconsistencias, orden de cards y ausencia en otros embudos. Las pruebas existentes de carga cubren cambios de filtros y VSL → OEI → VSL sin mostrar cifras anteriores mientras se carga.

## Archivos modificados y validación

- `apps-script/10_API.gs`: agregador único de fases de la cohorte y alias derivado.
- `src/server/mappers/vsl-no-aplica.ts`: contrato, puente con el desglose real y validación de igualdad.
- `src/server/mappers/vsl-response.mapper.ts`: entrega de los nuevos campos al frontend.
- `src/types/reports.ts`: campos opcionales del reporte.
- `src/lib/merge-filtered-reports.ts`: evita reutilizar un desglose parcial entre fuentes.
- `src/components/reports/ExecutiveSummary.tsx`: card, acceso seguro, advertencia y grid.
- `src/pages/VslClosersDashboard.tsx`: grid y cantidad de skeletons.
- `tests/apps-script-v2.cjs`, `tests/performance-contract.cjs`, `tests/vsl-no-aplica.cjs`: cobertura de API y presentación.
- `package.json`: comando `test:no-aplica`.
- `docs/vsl-no-aplica-real-response.json` y este documento: evidencia y explicación.

TypeScript, build de producción local y ESLint de los archivos TS/TSX modificados: correctos. Suite del ajuste: **70/70 pruebas correctas**. Suite completa: **175 pruebas, 166 correctas, 8 fallos, 1 omitida**. Los ocho fallos están en `report.cjs` y `appointments.cjs`; se reprodujeron idénticos usando los archivos de API y mapper de `HEAD` anterior al ajuste. No hay nuevos fallos por esta implementación. No se corrigieron pruebas o contratos ajenos al requerimiento.
