# VSL | CITAS Y CALENDARIOS

Ruta: `/reports/vsl-citas`. No modifica el contrato ni las acciones de VSL | CLOSERS.

## Integración de lectura

`fetchAppointments` en `src/server/adapters/appointments.adapter.server.ts` lee
`process.env.APPS_SCRIPT_CITAS_URL` únicamente en servidor y consulta mediante GET
esa URL con `action=report`, sin secret y sin caché. Aplica un timeout de 15 segundos
y maneja errores HTTP/JSON sin exponer la URL. El cargador privado de desarrollo
también admite esta variable desde `.env`. Los endpoints locales ya existen:

- `GET /api/reports/vsl-citas`: lectura de CITAS API.
- `POST /api/reports/vsl-citas/reconcile`: debe esperar a que el backend ejecute
  `CITAS_RECONCILIAR()` y devuelva `{ "ok": true }`. Solo entonces el frontend
  vuelve a consultar el reporte. Mientras tanto el botón informa que falta conexión.

La reconciliación sigue pendiente y conserva su respuesta 503; no se llama a ninguna
acción upstream de reconciliación. El frontend utiliza exclusivamente el proxy
`GET /api/reports/vsl-citas` para lectura, siguiendo la convención existente de reportes.

## Contrato esperado de lectura del adaptador

Objeto `{ ok: true, data: AppointmentRow[] }`, con una fila por registro de CITAS API,
usando las claves originales: `Id. de cita`, `FECHA CITA`, `Hora solicitada`,
`CLOSER ASIGNADO`, `Calendario`, `_Calendar ID`, `Resultado`, `_Updated At`.
Valores: string, número o null. No debe paginar silenciosamente: devolver el conjunto
completo para que opciones, filtros y totales se calculen sobre el mismo universo.

Preferir `FECHA CITA` como `YYYY-MM-DD` de America/Lima. Se admiten `D/M/YYYY`,
timestamps locales sin offset (Lima) e instantes ISO con offset/Z (convertidos a Lima).
No se aceptan seriales numéricos de Google Sheets como fechas. `Hora solicitada` es
fallback; nunca se utiliza Fecha de adición. `_Updated At` debe ser ISO con offset.

El proxy valida con Zod, normaliza y devuelve
`{ appointments: [{ id, date, closer, calendarId, showed }], invalid: number }`.
No transmite correo, teléfono ni otros campos de contacto.

## Decisiones de cálculo

- Mapping central de cuatro calendarios en `src/lib/appointments.ts`.
- ID de calendario prioritario; fallback por nombre solo si falta ID, normalizando
  acentos, espacios y mayúsculas. Otros calendarios se excluyen.
- Cada ID de cita cuenta una vez: gana `_Updated At` más reciente; en empate o sin
  fecha de actualización gana la última fila. Se deduplica antes de aplicar filtros.
- Solo `trim().toLowerCase() === "showed"` cuenta como sesión efectiva.
- Closers vacíos se conservan como `Sin closer asignado`. La tabla incluye los closers
  que tienen citas tras filtrar, incluso si ninguna es efectiva; siempre cuatro filas.
- Registros sin ID o sin fecha válida se excluyen con aviso visible de calidad de datos.
- Mes seleccionado: todos los días del mes, incluidos ceros. Todos los meses: fechas
  con citas en orden cronológico y etiquetas con año para evitar ambigüedad.
- No hay bloqueo de pantalla durante consultas en background; se conservan datos
  anteriores si falla el refresh. Se evita doble envío de reconciliación con un ref.

`generatedAt`, `total` y `metrics` del upstream no sustituyen las agregaciones del
dashboard: KPIs, tabla y gráfica siguen calculándose desde `data` con los filtros activos.
No se ejecutaron validaciones automáticas en el paso de integración de lectura.
