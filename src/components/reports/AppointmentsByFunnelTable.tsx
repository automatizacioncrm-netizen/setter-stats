import {
  funnelValue,
  visibleFunnelColumns,
  formatCancellationPercent,
  displayFunnelPeriod,
  presentFunnelGroups,
  funnelGroups,
  type AppointmentsByFunnel,
} from "@/lib/appointments-by-funnel";
const visibleColumns = visibleFunnelColumns;
const percentNames = ["% SETEADOS", "% ASISTIDOS", "% NO ASISTIDOS"];
function displayValue(
  table: AppointmentsByFunnel,
  row: AppointmentsByFunnel["rows"][number],
  name: string,
) {
  const value = funnelValue(table.columns, row, name);
  if (name === "% CANCELADOS")
    return formatCancellationPercent(
      Number(funnelValue(table.columns, row, "CANCELADOS REALES")),
      Number(funnelValue(table.columns, row, "TOTAL AGENDAMIENTOS")),
    );
  if (value === undefined) return "—";
  if (name === "PERIODO / MES")
    return String(value).indexOf(" / ") >= 0 ? String(value) : displayFunnelPeriod(String(value));
  if (percentNames.indexOf(name) >= 0)
    return typeof value === "number"
      ? value.toLocaleString("es-PE", { style: "percent", maximumFractionDigits: 2 })
      : "—";
  return typeof value === "number" ? value.toLocaleString("es-PE") : value;
}
export function AppointmentsByFunnelTable({
  table,
  error,
}: {
  table: AppointmentsByFunnel | undefined;
  error: string | undefined;
}) {
  const groups = table ? presentFunnelGroups(table.rows, table.columns) : [];
  const unknown = table?.rows.some(
    (row) => !funnelGroups.some((name) => name === funnelValue(table.columns, row, "EMBUDO")),
  );
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-background shadow-card">
      <h2 className="bg-zinc-700 p-4 text-center text-base font-bold text-white">
        TABLA 3: CALIDAD DE AGENDAMIENTOS POR EMBUDO (ORGÁNICO, VSL Y LIG)
      </h2>
      {error ? (
        <p role="alert" className="p-4 text-sm text-destructive">
          {error}
        </p>
      ) : !table ? (
        <p role="status" className="p-4 text-sm text-muted-foreground">
          La API todavía no entrega appointmentsByFunnel para la Tabla 3.
        </p>
      ) : (
        <>
          {table.truncated && (
            <p role="alert" className="p-3 text-sm text-amber-700">
              Los resultados de la Tabla 3 están truncados y pueden estar incompletos.
            </p>
          )}
          {!!table.skippedWithoutDate && (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              Registros omitidos por falta de fecha: {table.skippedWithoutDate}.
            </p>
          )}
          {unknown && (
            <p role="alert" className="p-3 text-sm text-destructive">
              La API incluye embudos que no corresponden a los tres grupos definidos. Revisa el
              contrato antes de interpretar estos resultados.
            </p>
          )}
          <div className="space-y-6 p-4">
            {groups.map((group, groupIndex) => (
              <section
                key={group.name}
                aria-label={group.name}
                className="min-w-0 overflow-hidden rounded-xl border border-border bg-background shadow-card"
              >
                <h3 className="bg-zinc-700 p-4 text-center text-sm font-bold text-white">
                  TABLA 3.{groupIndex + 1} — {group.name}
                </h3>
                <div className="max-h-[65vh] overflow-auto">
                  <table
                    className="w-full table-fixed border-collapse text-sm"
                    style={{ minWidth: visibleColumns.length * 160 + 32 }}
                  >
                    <colgroup>
                      {visibleColumns.map((_, index) => (
                        <col key={index} style={{ width: index === 0 ? 192 : 160 }} />
                      ))}
                    </colgroup>
                    <thead className="sticky top-0 z-20 bg-white text-black">
                      <tr>
                        {visibleColumns.map((column, index) => (
                          <th
                            key={index}
                            style={
                              column === "CANCELADOS REALES" || column === "% CANCELADOS"
                                ? { backgroundColor: "#FEE4E2", color: "#912018" }
                                : undefined
                            }
                            className={`border border-zinc-300 p-3 font-bold ${index === 0 ? "sticky left-0 z-30 bg-white text-left" : "text-center"}`}
                          >
                            {column === "CANCELADOS REALES" ? "CANCELADOS" : column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row, index) => (
                        <tr key={index} className="border-b border-border">
                          {visibleColumns.map((source, column) => (
                            <td
                              key={column}
                              style={
                                source === "CANCELADOS REALES" || source === "% CANCELADOS"
                                  ? { backgroundColor: "#FDECEC", color: "#B42318" }
                                  : undefined
                              }
                              className={`border border-border p-2 tabular-nums ${column === 0 ? "sticky left-0 z-10 bg-background text-left font-semibold" : "text-right"} ${source === "% ASISTIDOS" ? "bg-brand-soft font-semibold text-brand" : ""}`}
                            >
                              {displayValue(table, row, source)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {group.rows.length === 0 && (
                    <p className="p-5 text-muted-foreground">
                      No hay agendamientos para el período seleccionado
                    </p>
                  )}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
