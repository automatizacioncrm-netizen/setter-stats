# Auditoría del recorrido de cohorteDiariaVsl — 27/10/2026

## Causa demostrada

El contrato original facilitado por el usuario tiene `pipeline`, `porDia` y
`total.oportunidades`. Cada día contiene `fechaCreacion`, `oportunidades`,
`asistidos`, `noAsistidos` y `sinResultado`. El frontend exigía `totalLeads`
en la raíz y, en cada día, `fecha`, `totalLeads`, `leadsAsistidos`,
`leadsNoAsistidos`, `leadsPendientesResultado` y `porcentajeAsistencia`.

Por tanto, `schema.safeParse(value)` de `mapLandingVslCohort` fallaba antes de
ejecutar las conciliaciones. Su retorno contenía únicamente
`cohorteDiariaVslError`; `mapVslReportResponse` incorporaba ese retorno al JSON
final. La ausencia de `cohorteDiariaVsl` era consecuencia explícita del rechazo,
no un efecto de serialización ni una prueba de ausencia en Apps Script.

Los campos obligatorios ausentes en el bloque recibido eran `totalLeads`,
`porDia[0].fecha`, `porDia[0].totalLeads`, `porDia[0].leadsAsistidos`,
`porDia[0].leadsNoAsistidos`, `porDia[0].leadsPendientesResultado` y
`porDia[0].porcentajeAsistencia`. El mensaje comunicado corresponde precisamente
a ese fallo de esquema. Un campo ausente o nulo en la raíz habría producido
el mensaje diferente «La API no entrega la cohorte diaria de Landing VSL».

## Recorrido inspeccionado

Este repositorio utiliza TanStack Start/Vite, no Next.js. Los archivos efectivos son:

1. `src/routes/api.reports.vsl-closers.ts`: GET delega en `reportApi`.
2. `src/server/api/report.api.server.ts`: valida filtros y llama a `fetchVslReport`.
3. `src/server/adapters/apps-script.adapter.server.ts`: solicita `action=vsl_report`,
   valida HTTP/JSON/ok y devuelve el envelope original `{ok:true,data:reporte}`.
4. `src/server/mappers/vsl-response.mapper.ts`: extrae `parsed.data.data` y lee
   `d["cohorteDiariaVsl"]`. El nivel es correcto: `response.data.cohorteDiariaVsl`.
5. `src/server/mappers/landing-vsl-cohort.mapper.ts`: valida y normaliza el bloque.
6. `Response.json(data)` publica el reporte transformado sin envelope `data`.
   En esta respuesta final, el cliente lee `response.cohorteDiariaVsl`.
7. `src/services/reports.ts` conserva esa propiedad; `LandingVslCohortDetail.tsx`
   consume `report.cohorteDiariaVsl.porDia`.

Las interfaces están en `src/types/reports.ts`. No hay un fallback que sustituya
la cohorte por la página visible del detalle de Calendar. La caché del cliente
incluye los filtros en su clave. Cliente, proxy y adaptador usan `no-store`.

## Corrección mínima

Esta corrección adicional modifica exclusivamente el mapper de cohorte y sus
pruebas, además de esta documentación. No requiere cambios nuevos en Apps Script,
interfaces, ruta, autenticación, componentes ni cálculos de las otras secciones.
Los cambios de la funcionalidad anterior permanecen en el árbol de trabajo.

Antes:

```ts
const result = schema.safeParse(value); // solo admitía el contrato local
if (!result.success) return { cohorteDiariaVslError: mensajeGenerico };
```

Después:

```text
Contrato Apps Script proporcionado → validar campos y totales → normalizar
Contrato local anterior           → validar directamente
Ambos                             → conciliaciones existentes → JSON final
```

| Fuente verificada | Campo usado por la tabla |
|---|---|
| total.oportunidades | totalLeads |
| porDia[].fechaCreacion | porDia[].fecha |
| porDia[].oportunidades | porDia[].totalLeads |
| porDia[].asistidos | porDia[].leadsAsistidos |
| porDia[].noAsistidos | porDia[].leadsNoAsistidos |
| porDia[].sinResultado | porDia[].leadsPendientesResultado |

El porcentaje se representa como `asistidos / oportunidades × 100`, con dos
decimales y cero para denominador cero. No se usan `citasAsistidas` ni
`citasNoAsistidas`: son citas, mientras que la tabla mide oportunidades únicas.
No se recalcula ni se modifica ningún conteo del backend.

Se conservan las validaciones de enteros no negativos, fechas, categorías,
duplicados, porcentajes y conciliación con las tarjetas. Se añade la comparación
de los totales de cada categoría del contrato recibido con la suma de sus días.
Un fallo de esquema informa rutas, tipos y códigos (máximo cinco), sin imprimir
valores, mensajes Zod que contengan valores, secretos ni payloads originales.

El bloque proporcionado no incluye leads individuales: se muestra el resumen
diario y el aviso existente al abrir el detalle. No se fabrican filas. Los
metadatos y nombres originales se normalizan al contrato interno de presentación;
no se promete que el JSON final sea una copia literal del bloque upstream.

## Filtros, URL y fechas

Se verificó en pruebas el transporte exacto de `pipeline=vsl`, `leadType=paid`,
`dateFrom` y `dateTo` entre servicio, proxy y adaptador. Los días fuera del rango
continúan rechazándose. `fechaCreacion` ya llega como YYYY-MM-DD y se conserva
literalmente; la adaptación no introduce conversiones UTC.

La configuración local tiene secreto presente y una URL HTTPS de script.google.com
terminada en `/exec`, sin query preconfigurada. No se imprimieron el identificador
del despliegue ni las credenciales. La lectura directa falló con DNS `ENOTFOUND`.
También se intentó el endpoint público de Vercel, sin conseguir una respuesta.
No se pudo confirmar que las variables de Production sean las mismas que las
locales ni que ese `/exec` corresponda a la última versión publicada.

`API_BUILD_VSL_COHORT_DAILY_`, mencionada por el usuario, no aparece en el archivo
local. La copia local conserva la ampliación previa `API_BUILD_LANDING_VSL_COHORT_`.
Esto demuestra que no se debe asumir equivalencia entre la copia y el despliegue.
La adaptación se basa en la estructura que el usuario facilitó, no en una captura
HTTP de producción ni en nombres inferidos.

## Pruebas

- Once pruebas de cohorte aprobadas, incluyendo cinco nuevas para este diagnóstico.
- 80/80 pruebas focalizadas aprobadas.
- Suite completa: 172 aprobadas, 24 fallidas y una omitida; exactamente los mismos
  24 fallos que antes de esta corrección. TypeScript, lint de los dos archivos
  modificados y build Vite/Vercel aprobados.
- Prueba HTTP simulada: servicio del navegador → `reportApi` → adaptador real →
  respuesta Apps Script simulada → `Response.json` → cliente. Comprueba presencia
  de `cohorteDiariaVsl` en el JSON final, procesamiento de `porDia`, filtros exactos
  y cabecera `no-store`.
- Casos con registros, `porDia:[]` con totales cero, día con ceros, null inválido,
  estructura incompatible, envelope incorrecto y totales que no concilian.
- Comparación de la respuesta general con y sin cohorte: los campos de indicadores,
  filtros y otras secciones son iguales, excluyendo solo cohorte/error de cohorte.
- El resumen suministrado conserva 20 oportunidades, ocho asistidas, cinco no
  asistidas y siete pendientes; muestra 40 %, sin usar las nueve citas asistidas.
- La interfaz muestra la fecha y el resumen normalizado y mantiene el aviso de
  ausencia de registros individuales. No se probó un navegador contra producción.

## Despliegue y comprobación pendiente

1. Publicar la corrección del frontend/proxy mediante el flujo normal de Vercel
   del proyecto, conservando las variables privadas actuales. No hace falta
   reescribir historia ni cambiar autenticación.
2. Consultar el endpoint con `pipeline=vsl`, `leadType` y las fechas elegidas;
   confirmar en el JSON final `cohorteDiariaVsl.totalLeads` y `porDia`, sin error.
3. Repetir con un período sin oportunidades y comprobar `totalLeads:0, porDia:[]`.
4. Comparar las tarjetas y los restantes indicadores antes/después.
5. Apps Script no necesita cambios para consumir el resumen cuyo contrato se
   proporcionó. Verificar que `APPS_SCRIPT_URL` en Vercel Production apunta al
   `/exec` que ya devuelve ese contrato. Cambiarla solo si se demuestra lo contrario.
   No reemplazar el backend remoto por toda la copia local, que tiene otras reglas.

La corrección está verificada de extremo a extremo con respuestas simuladas.
La llegada del objeto en el despliegue real sigue pendiente de comprobación;
no se declara resuelto en producción y no se publicó ningún cambio.
