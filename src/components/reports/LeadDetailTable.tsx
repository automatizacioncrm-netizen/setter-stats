import { getReportRecordValue } from "@/lib/report-record";
import type { DetailQuery, LeadDetailRow } from "@/types/reports";
const columns: [keyof LeadDetailRow, string][] = [
  ["pipeline", "Embudo"],
  ["nombreContacto", "Nombre contacto"],
  ["telefono", "Teléfono"],
  ["correo", "Correo electrónico"],
  ["setterAsignado", "Setter"],
  ["agendadorCita", "Agendador cita"],
  ["closerCita", "Closer cita"],
  ["calendarioCita", "Calendario"],
  ["vslOrigen", "VSL Origen"],
  ["estadoAgenda", "Estado de agendamiento"],
  ["fechaAgendamiento", "Fecha de agendamiento"],
  ["fase", "Fase"],
  ["fuente", "Fuente"],
];
const isSortable = (key: keyof LeadDetailRow): key is DetailQuery["sort"] =>
  ![
    "pipeline",
    "secuencia",
    "agendadorCita",
    "createdByUserName",
    "closerCita",
    "closerOpportunity",
    "calendarioCita",
    "estadoCita",
    "estadoAgendaOriginal",
    "fuenteEstadoAgendamiento",
    "fechaAgendamiento",
    "fechaCita",
    "productoEvento",
    "fechaPrimerPago",
    "fechaVenta",
    "planPagos",
    "numeroCuotasPactadas",
    "moneda",
    "montoTotalAcordado",
    "montoUltimoPago",
    "leadType",
  ].includes(key);
export function LeadDetailTable({
  rows,
  total,
  page,
  query,
  onChange,
  busy,
}: {
  rows: LeadDetailRow[];
  total: number;
  page: number;
  query: DetailQuery;
  onChange: (q: Partial<DetailQuery>) => void;
  busy: boolean;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <h2 className="font-semibold">Detalle de leads</h2>
      <p className="text-xs text-muted-foreground">
        La búsqueda consulta todos los registros. El orden se aplica a la página actual.
      </p>
      <div className="flex flex-wrap gap-3">
        <label className="flex-1 text-sm">
          Buscar por nombre, email o teléfono
          <input
            type="search"
            maxLength={300}
            value={query.search}
            onChange={(e) => onChange({ search: e.target.value, page: 1 })}
            className="mt-1 block w-full rounded border p-2"
          />
        </label>
        <label className="text-sm">
          Filas por página
          <select
            value={query.pageSize}
            onChange={(e) => onChange({ pageSize: Number(e.target.value), page: 1 })}
            className="mt-1 block rounded border p-2"
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="overflow-x-auto" aria-busy={busy}>
        <table className="w-full min-w-[1200px] text-sm">
          <thead>
            <tr>
              {columns.map(([key, label]) => (
                <th
                  key={key}
                  className="p-2 text-left"
                  aria-sort={
                    query.sort === key
                      ? query.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  {isSortable(key) ? (
                    <button
                      onClick={() =>
                        onChange({
                          sort: key,
                          direction:
                            query.sort === key && query.direction === "asc" ? "desc" : "asc",
                          page: 1,
                        })
                      }
                    >
                      {label} ↕
                    </button>
                  ) : (
                    label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...rows]
              .sort(
                (a, b) =>
                  String(getReportRecordValue(a, query.sort)).localeCompare(
                    String(getReportRecordValue(b, query.sort)),
                    "es",
                    { numeric: true },
                  ) * (query.direction === "asc" ? 1 : -1),
              )
              .map((row, i) => (
                <tr key={i} className="border-t">
                  {columns.map(([key]) => (
                    <td key={key} className="p-2">
                      {getReportRecordValue(row, key) || "—"}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p>No existen registros para esta búsqueda.</p>}
      <div className="flex items-center justify-between gap-3 text-sm">
        <button disabled={busy || page <= 1} onClick={() => onChange({ page: page - 1 })}>
          Anterior
        </button>
        <span>
          {total} registros · Página {page} de {Math.max(1, Math.ceil(total / query.pageSize))}
        </span>
        <button
          disabled={busy || page * query.pageSize >= total}
          onClick={() => onChange({ page: page + 1 })}
        >
          Siguiente
        </button>
      </div>
    </section>
  );
}
