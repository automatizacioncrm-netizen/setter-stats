import { useQuery } from "@tanstack/react-query";
import type { ReportFilters } from "@/types/reports";
import { getCompleteAppointments } from "@/services/reports";
import { closerCalendarFilters, groupCloserCalendar } from "@/lib/closer-calendar-detail";

export function CloserCalendarDetail({ filters }: { filters: ReportFilters }) {
  const detailFilters = closerCalendarFilters(filters);
  const query = useQuery({
    queryKey: ["closer-calendar-detail", detailFilters],
    queryFn: async ({ signal }) =>
      groupCloserCalendar(await getCompleteAppointments(detailFilters, signal)),
    staleTime: 60_000,
    retry: false,
  });
  if (query.isPending)
    return (
      <p role="status" className="mt-3">
        Cargando detalle de citas...
      </p>
    );
  if (query.isError)
    return (
      <p role="status" className="mt-3">
        No se pudo cargar el detalle de citas.
      </p>
    );
  if (!query.data.rows.length)
    return <p className="mt-3">No hay citas para los filtros seleccionados.</p>;
  const rowCells = (row: typeof query.data.totals) => (
    <>
      <td className="px-4 py-2 text-left">{row.closer}</td>
      {[
        row.confirmado,
        row.asistio,
        row.cancelado,
        row.noAsistio,
        row.totalCitas,
      ].map((value, index) => (
        <td key={index} className="px-4 py-2 text-right tabular-nums">
          {value}
        </td>
      ))}
    </>
  );
  return (
    <div className="mt-3 w-full overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
      <table className="w-full min-w-[800px] text-sm">
        <thead>
          <tr className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
            {[
              "Closer",
              "Confirmado",
              "Asistió",
              "Cancelado",
              "No asistió",
              "Total citas",
            ].map((label, index) => (
              <th
                key={label}
                scope="col"
                className={`px-4 py-2 font-medium ${index ? "text-right" : "text-left"}`}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {query.data.rows.map((row) => (
            <tr key={row.closer} className="border-t border-border">
              {rowCells(row)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border bg-brand-soft font-semibold text-foreground">
            {rowCells(query.data.totals)}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
