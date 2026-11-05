import { presentMonthlyLeadRows } from "@/lib/monthly-lead-quality";
import type { QualityReport } from "@/lib/vsl-quality";
import { displayReportCell } from "@/lib/vsl-quality";
export function FunnelLeadQualityTable({
  title,
  table,
  authoritative = false,
  filtered = false,
  periodLabel,
}: {
  title: string;
  authoritative?: boolean;
  filtered?: boolean;
  periodLabel?: string | undefined;
  table: QualityReport["qualityOrganico"];
}) {
  const monthly = table
    ? authoritative || filtered
      ? { rows: table.rows, error: undefined }
      : presentMonthlyLeadRows(table.rows, "funnel")
    : undefined;
  if (filtered && !table) return null;
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-background shadow-card">
      <h2 className="bg-zinc-700 p-4 text-center text-base font-bold text-white">{title}</h2>
      {!table ? (
        <p role="status" className="p-4 text-sm text-muted-foreground">
          La API no entrega este reporte para el período solicitado.
        </p>
      ) : (
        <>
          {monthly?.error && (
            <p role="alert" className="p-4 text-sm text-destructive">
              {monthly.error}
            </p>
          )}
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full table-fixed border-collapse text-sm" style={{ minWidth: 832 }}>
              <colgroup>
                {table.columns.map((_, i) => (
                  <col key={i} style={{ width: i === 0 ? 160 : 112 }} />
                ))}
              </colgroup>
              <thead className="sticky top-0 z-20 bg-white text-black">
                <tr>
                  {table.columns.map((column, i) => (
                    <th
                      key={i}
                      className={
                        "border border-zinc-300 px-1.5 py-2 text-center align-middle font-bold " +
                        (i === 0 ? "sticky left-0 z-30 bg-white" : "")
                      }
                    >
                      {i === 0 ? "PERIODO" : column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthly?.rows.map((row, index) => (
                  <tr key={index} className="border-t-2 border-zinc-400">
                    {row.map((value, i) => (
                      <td
                        key={i}
                        className={
                          "border border-border px-1.5 py-2 text-center align-middle tabular-nums " +
                          (i === 0 ? "sticky left-0 z-10 bg-background font-semibold " : "") +
                          (i === 4 || i === 6 ? "bg-brand-soft font-semibold text-brand" : "")
                        }
                      >
                        {i === 0
                          ? filtered
                            ? (periodLabel ?? value ?? "—")
                            : displayReportCell(value, 0, false)
                          : typeof value === "number" && (i === 4 || i === 6)
                            ? new Intl.NumberFormat("es-PE", {
                                style: "percent",
                                maximumFractionDigits: 0,
                              }).format(value)
                            : (value ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!table.rows.length && (
            <p className="p-4 text-sm text-muted-foreground">
              Sin registros para el período solicitado.
            </p>
          )}
          {table.truncated && (
            <p role="status" className="p-3 text-sm text-amber-700">
              La API indica que este reporte está truncado.
            </p>
          )}
        </>
      )}
    </section>
  );
}
