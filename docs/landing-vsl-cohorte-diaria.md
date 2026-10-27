# Detalle diario de leads Landing VSL

Actualización: el contrato remoto facilitado posteriormente por el usuario ya se
admite mediante normalización en el mapper. Véase
[la auditoría del contrato](auditoria-contrato-cohorte-vsl.md). Las notas siguientes
documentan la implementación inicial; para consumir ese resumen no es necesario
publicar la ampliación local del backend.

## Alcance

El nuevo desplegable se activa exclusivamente con `pipeline=vsl`. Conserva las
tres tarjetas existentes y sus fórmulas. Las vistas de todos los embudos, OEI,
LIG, Orgánico y Gira mantienen su presentación anterior. No se cambiaron cálculos
de Setter, Closer, ventas ni filtros globales.

## Archivos

- `apps-script/10_API.gs`: añade `cohorteDiariaVsl` al reporte VSL y las funciones
  `API_BUILD_LANDING_VSL_COHORT_` / `API_LANDING_COHORT_DATE_`.
- `src/server/mappers/landing-vsl-cohort.mapper.ts`: valida resúmenes, registros,
  rangos, porcentajes, IDs únicos y conciliación con las tarjetas.
- `src/server/mappers/vsl-response.mapper.ts`: transmite el nuevo bloque validado,
  sin derivarlo de las filas paginadas del detalle de Calendar.
- `src/types/reports.ts`: declara los tipos de cohorte, día, lead y cita.
- `src/components/reports/LeadsWithoutAppointmentSection.tsx`: conserva las tarjetas
  y sustituye el desplegable antiguo solamente en VSL.
- `src/components/reports/LandingVslCohortDetail.tsx`: resumen diario ordenable,
  acción Ver detalle, diez columnas, citas vinculadas y paginación.
- `tests/landing-vsl-cohort.cjs` y `package.json`: seis pruebas nuevas integradas
  en el comando de pruebas del proyecto.

## Contrato y conteo

La copia local del backend no contenía `cohorteDiariaVsl`. La API remota no pudo
inspeccionarse: `script.google.com` falló por DNS con `ENOTFOUND`. Por ello los
campos siguientes son un contrato explícito añadido a la copia local, no una
afirmación sobre la estructura que esté desplegada actualmente.

El contrato aditivo `data.cohorteDiariaVsl` contiene:

```text
version: 1
totalLeads
porDia[]:
  fecha (YYYY-MM-DD de creación de la oportunidad)
  totalLeads
  leadsAsistidos
  leadsNoAsistidos
  leadsPendientesResultado
  porcentajeAsistencia
  leads[]:
    opportunityId, nombreContacto, fechaCreacion, setter, closerAsignado
    pipeline: "vsl"
    resultadoAsistencia
    citas[]:
      appointmentId, fechaReunion, estadoCalendar, estadoAgenda
      agendador, closer, calendario
```

Se reutilizan los registros de oportunidades que superaron los filtros actuales
de origen, calendario, estado, Setter y Closer. La fecha de creación limita la
cohorte de oportunidades; las citas se buscan por Opportunity ID en el índice
histórico de APPOINTMENTS_MASTER, sin aplicarles el rango temporal del dashboard.
Solo se admiten los orígenes pagados actuales y calendarios permitidos de VSL.

Cada Opportunity ID se cuenta una sola vez. Cada Appointment ID vinculado se
incluye una sola vez. La prioridad del resultado es Asistió (showed), No asistió
(noshow), Sin resultado si hay citas sin esos resultados, o Pendiente de agenda
si no hay citas válidas. Confirmado y Cancelado permanecen visibles junto al
estado original de Calendar. Ambas clases sin resultado se suman a pendientes.

El porcentaje diario es asistidos / total × 100, redondeado a dos decimales.
El mapper exige que categorías, registros, días y total de la tarjeta concilien;
no corrige inconsistencias con ceros. Un resumen sin `leads` se puede mostrar,
pero al consultar ese día se informa que no existen registros individuales.
Un detalle parcial o incompatible se marca como no disponible.

Las fechas puras no se desplazan por UTC. Los timestamps del nuevo bloque se
normalizan mediante la zona configurada en Apps Script (`Session.getScriptTimeZone`).
No se modificó el normalizador general de las otras secciones. Si los datos
originales provocan una diferencia de cohortes con las tarjetas, la validación
la hace visible en vez de cambiar sus cifras.

## Experiencia

El resumen se monta al expandir «Detalle de leads Landing VSL». Muestra 31 días
por página; el detalle de un día muestra 25 leads por página. Se abre un día a
la vez. Las tablas conservan el estilo institucional y permiten desplazamiento
horizontal en móvil. Cada lead expone todas sus citas válidas en un subdetalle,
con fecha, estado original, agendador, Closer y calendario.

## Validación

- 75/75 pruebas focalizadas aprobadas (incluyen las seis nuevas).
- Se probaron citas posteriores al rango de creación, duplicados de Opportunity
  y Appointment ID, exclusión de otros embudos y calendario orgánico, prioridad
  showed sobre noshow, estados confirmed/cancelled, ausencia de citas, rangos
  inclusivos, timestamps en America/Lima, datos vacíos e incompletos.
- Se ejecutó el reporte completo del Apps Script real con hojas maestras simuladas,
  se verificó la conciliación con las tres tarjetas y los filtros de origen,
  Closer, Setter, estado y calendario.
- Se probaron expansión, acción diaria, ordenamiento y paginación usando el
  código real del componente con un entorno de hooks controlado.
- Suite completa: 167 aprobadas, 24 fallidas, una omitida. Los nombres de los 24
  fallos son exactamente los mismos que en la ejecución previa al cambio.
- TypeScript, ESLint de los archivos modificados y build Vite/Vercel: aprobados.
- Lint global, excluyendo salidas generadas y archivos temporales: 6426 errores
  y seis advertencias ajenos al cambio, principalmente formato CRLF. Se dejó
  intacto ese formato fuera de los archivos necesarios para esta funcionalidad.

## Pendiente en producción

Las verificaciones de datos fueron simuladas; no hubo prueba de navegador contra
la API real ni publicación. Para activar el detalle real se debe comprobar el
contrato que ya ofrece el despliegue y, si no coincide o carece de registros,
integrar esta ampliación en esa versión de Apps Script y publicar frontend/backend.
No conviene sustituir una versión remota más reciente con toda la copia local:
esta conserva reglas antiguas en otras secciones y esos cálculos no se tocaron.
