import { saleDetailValue, formatSaleQuotaDate, formatSaleDetailAmount } from "@/lib/sales-detail";
import { useMemo, useState } from "react";
import { ArrowUpDown } from "lucide-react";
import type { SaleRow, SalesReport } from "@/types/reports";
import { KpiCard } from "./KpiCard";
import { getSalesStageStyle } from "@/lib/sales-stage-style";
import { SalesFinancialTable } from "./SalesFinancialTable";

export function SalesSummaryCards({ sales }: { sales: SalesReport }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <KpiCard label="Total de ventas" value={sales.total} accent="var(--status-asistio)" />
      {sales.byStage.map((item) => (
        <div
          key={item.stage}
          className="rounded-xl border-t-4"
          style={{ borderColor: getSalesStageStyle(item.stage).accent }}
        >
          <KpiCard
            label={item.stage}
            value={item.count}
            accent={getSalesStageStyle(item.stage).accent}
            hint={item.count === 1 ? "venta" : "ventas"}
          />
        </div>
      ))}
    </div>
  );
}

const baseColumns: { key: keyof SaleRow; label: string }[] = [
  { key: "secuencia", label: "Embudo" },
  { key: "calendarioCita", label: "Calendario" },
  { key: "nombreContacto", label: "Nombre del contacto (lead)" },
  { key: "setterAsignado", label: "Setter" },
  { key: "closerCita", label: "Closer" },
  { key: "fase", label: "Fase" },
  { key: "productoEvento", label: "Producto" },
  { key: "fechaVenta", label: "Fecha de cuota 1" },
  { key: "moneda", label: "Tipo de Moneda" },
  { key: "montoTotalAcordado", label: "Precio Acordado del Producto" },
  { key: "montoUltimoPago", label: "Monto de cuota 1" },
  { key: "planPagos", label: "Modalidad de Pagos" },
];

export function SalesSection({
  sales,
  available,
  pipeline,
  hideSummary = false,
}: {
  sales: SalesReport;
  available: boolean;
  hideSummary?: boolean;
  pipeline: "all" | "vsl" | "oei" | "lig" | "organico" | "gira";
}) {
  const [sort, setSort] = useState<{ key: keyof SaleRow; asc: boolean } | null>(null);
  const columns = baseColumns;
  const detailRows = sales.detailRows ?? sales.rows;
  const rows = useMemo(
    () =>
      sort
        ? [...detailRows].sort(
            (a, b) =>
              (sort.key === "montoUltimoPago" || sort.key === "montoTotalAcordado"
                ? (a.moneda || "").localeCompare(b.moneda || "") ||
                  (a[sort.key] ?? -Infinity) - (b[sort.key] ?? -Infinity)
                : String(saleDetailValue(a, sort.key)).localeCompare(
                    String(saleDetailValue(b, sort.key)),
                    "es",
                    { numeric: true },
                  )) * (sort.asc ? 1 : -1),
          )
        : detailRows,
    [detailRows, sort],
  );

  return (
    <section
      aria-labelledby="sales-heading"
      className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow-card"
    >
      <div>
        <h2 id="sales-heading" className="text-lg font-semibold text-foreground">
          Ventas
        </h2>
        <p className="text-sm text-muted-foreground">
          Oportunidades en fases comerciales consideradas como venta
        </p>
      </div>
      {!available ? (
        <p role="status" className="text-sm text-muted-foreground">
          El backend aún no envía la sección de ventas para este reporte.
        </p>
      ) : (
        <>
          {!hideSummary && <SalesSummaryCards sales={sales} />}
          <SalesFinancialTable sales={sales} pipeline={pipeline} />
          <div className="overflow-hidden rounded-lg border border-border">
            <h3 className="border-b border-border px-4 py-3 text-sm font-semibold">
              6. Detalle de ventas de todos los embudos
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-sm">
                <thead>
                  <tr className="bg-muted/60 text-left text-xs text-muted-foreground">
                    {columns.map((col) => (
                      <th
                        key={col.key}
                        scope="col"
                        className="px-4 py-3 font-medium"
                        aria-sort={
                          sort?.key === col.key ? (sort.asc ? "ascending" : "descending") : "none"
                        }
                      >
                        <button
                          className="inline-flex items-center gap-1"
                          onClick={() =>
                            setSort((prev) => ({
                              key: col.key,
                              asc: prev?.key === col.key ? !prev.asc : true,
                            }))
                          }
                        >
                          {col.label}
                          <ArrowUpDown aria-hidden="true" className="h-3 w-3" />
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={index} className="border-t border-border hover:bg-accent/50">
                      {columns.map((col) => (
                        <td key={col.key} className="px-4 py-3">
                          {col.key === "montoUltimoPago" || col.key === "montoTotalAcordado" ? (
                            formatSaleDetailAmount(row, col.key)
                          ) : col.key === "fechaVenta" ? (
                            formatSaleQuotaDate(row.fechaVenta)
                          ) : col.key === "fase" ? (
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getSalesStageStyle(row.fase).badge}`}
                            >
                              {row.fase || "—"}
                            </span>
                          ) : (
                            saleDetailValue(row, col.key) || "—"
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={columns.length}
                        className="p-8 text-center text-muted-foreground"
                      >
                        0 registros. No existen ventas para los filtros seleccionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
