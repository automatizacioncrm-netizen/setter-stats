import { useMemo, useState } from "react";
import { ArrowUpDown } from "lucide-react";
import type { SaleRow, SalesReport } from "@/types/reports";
import { KpiCard } from "./KpiCard";

const columns: { key: keyof SaleRow; label: string }[] = [
  { key: "setterAsignado", label: "Setter asignado" },
  { key: "closerAsignado", label: "Closer asignado" },
  { key: "nombreContacto", label: "Nombre del contacto" },
  { key: "fase", label: "Fase" },
  { key: "fuente", label: "Fuente" },
  { key: "fechaReunion", label: "Fecha de reunión" },
];

export function SalesSection({ sales, available }: { sales: SalesReport; available: boolean }) {
  const [sort, setSort] = useState<{ key: keyof SaleRow; asc: boolean } | null>(null);
  const rows = useMemo(
    () =>
      sort
        ? [...sales.rows].sort(
            (a, b) =>
              a[sort.key].localeCompare(b[sort.key], "es", { numeric: true }) * (sort.asc ? 1 : -1),
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
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard label="Total de ventas" value={sales.total} accent="var(--status-asistio)" />
            {sales.byStage.map((item) => (
              <KpiCard
                key={item.stage}
                label={item.stage}
                value={item.count}
                hint={item.count === 1 ? "venta" : "ventas"}
              />
            ))}
          </div>
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
                          {row[col.key] || "—"}
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
