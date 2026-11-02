import {
  displayFunnelCell,
  displayFunnelPeriod,
  presentFunnelGroups,
  funnelGroups,
  type AppointmentsByFunnel,
} from "@/lib/appointments-by-funnel";
export function AppointmentsByFunnelTable({
  table,
  error,
}: {
  table: AppointmentsByFunnel | undefined;
  error: string | undefined;
}) {
  const groups = table ? presentFunnelGroups(table.rows) : [];
  const unknown = table?.rows.some((row) => !funnelGroups.some((name) => name === row[0]));
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
                    style={{ minWidth: (table.columns.length - 1) * 160 + 32 }}
                  >
                    <colgroup>
                      {table.columns.slice(1).map((_, index) => (
                        <col key={index} style={{ width: index === 0 ? 192 : 160 }} />
                      ))}
                    </colgroup>
                    <thead className="sticky top-0 z-20 bg-white text-black">
                      <tr>
                        {table.columns.slice(1).map((column, index) => (
                          <th
                            key={index}
                            className={`border border-zinc-300 p-3 font-bold ${index === 0 ? "sticky left-0 z-30 bg-white text-left" : "text-center"}`}
                          >
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row, index) => (
                        <tr key={index} className="border-b border-border">
                          {row.slice(1).map((value, column) => (
                            <td
                              key={column}
                              className={`border border-border p-2 tabular-nums ${column === 0 ? "sticky left-0 z-10 bg-background text-left font-semibold" : "text-right"} ${column === 3 || column === 5 ? "bg-brand-soft font-semibold text-brand" : ""}`}
                            >
                              {column === 0
                                ? displayFunnelPeriod(String(value))
                                : displayFunnelCell(value, column + 1)}
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
