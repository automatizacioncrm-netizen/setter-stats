import type { SalesReport } from "@/types/reports";
import { formatCurrency } from "@/lib/currency";
const percent = (value: number) =>
  Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", {
        style: "percent",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value / 100)
    : "—";

export function SalesCollectionTable({ sales }: { sales: SalesReport }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <h3 className="border-b border-border px-4 py-3 text-sm font-semibold">
        Resumen de recaudación
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[850px] text-sm">
          <thead>
            <tr className="bg-muted/60 text-xs text-muted-foreground">
              {[
                "Producto",
                "Cantidad de tickets",
                "Ticket",
                "Valor de ticket de venta",
                "Cash recaudado",
                "% recaudado",
              ].map((label, index) => (
                <th
                  scope="col"
                  key={label}
                  className={`px-4 py-3 font-medium ${index ? "text-right" : "text-left"}`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sales.productSummary.map((item, index) => (
              <tr key={index} className="border-t border-border">
                <td className="px-4 py-3">
                  {item.producto || "—"}
                  <span className="ml-2 text-xs text-muted-foreground">{item.moneda}</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{item.cantidad}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatCurrency(item.ticket, item.moneda)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatCurrency(item.valorVenta, item.moneda)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatCurrency(item.cashRecaudado, item.moneda)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {percent(item.porcentajeRecaudado)}
                </td>
              </tr>
            ))}
            {!sales.productSummary.length && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  No hay resumen por producto en este reporte.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            {sales.salesValueByCurrency.map((item, index) => (
              <tr key={index} className="border-t-2 border-border bg-muted/60 font-semibold">
                <th scope="row" colSpan={3} className="px-4 py-3 text-left">
                  TOTAL {item.currency || "Sin moneda"}
                </th>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatCurrency(item.salesValue, item.currency)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatCurrency(item.cashCollected, item.currency)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{percent(item.collectedRate)}</td>
              </tr>
            ))}
          </tfoot>
        </table>
      </div>
    </div>
  );
}
