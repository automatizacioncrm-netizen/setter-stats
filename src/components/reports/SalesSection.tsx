import { useMemo, useState } from "react";
import { ArrowUpDown } from "lucide-react";
import type { SaleRow, SalesReport } from "@/types/reports";
import { KpiCard } from "./KpiCard";
import { formatCurrency } from "@/lib/currency";
import { getSalesStageStyle } from "@/lib/sales-stage-style";
import { SalesFinancialCards } from "./SalesFinancialCards";

const columns: { key: keyof SaleRow; label: string }[] = [
  { key: "setterAsignado", label: "Setter asignado" },
  { key: "closerAsignado", label: "Closer" },
  { key: "nombreContacto", label: "Nombre del contacto" },
  { key: "fase", label: "Fase" },
  { key: "fuente", label: "Fuente" },
  { key: "productoEvento", label: "Producto" },
  { key: "montoUltimoPago", label: "Precio / Cobrado" },
];

export function SalesSection({ sales, available }: { sales: SalesReport; available: boolean }) {
  const [sort, setSort] = useState<{ key: keyof SaleRow; asc: boolean } | null>(null);
  const rows = useMemo(
    () =>
      sort
        ? [...sales.rows].sort(
            (a, b) =>
              (sort.key === "montoUltimoPago"
                ? a.moneda.localeCompare(b.moneda) || a.montoUltimoPago - b.montoUltimoPago
                : String(a[sort.key]).localeCompare(String(b[sort.key]), "es", { numeric: true })) *
              (sort.asc ? 1 : -1),
          )
        : sales.rows,
    [sales.rows, sort],
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
          <SalesFinancialCards values={sales.salesValueByCurrency} />
          <div className="overflow-hidden rounded-lg border border-border">
            <h3 className="border-b border-border px-4 py-3 text-sm font-semibold">
              Detalle de ventas
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
                          {col.key === "montoUltimoPago" ? (
                            formatCurrency(row.montoUltimoPago, row.moneda)
                          ) : col.key === "fase" ? (
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getSalesStageStyle(row.fase).badge}`}
                            >
                              {row.fase || "—"}
                            </span>
                          ) : (
                            row[col.key] || "—"
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
