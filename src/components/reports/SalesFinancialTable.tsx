import type { SalesReport } from "@/types/reports";
import { financialSummary, financialAmount, formatNumber } from "@/lib/executive-metrics";
import { ExecutiveTable } from "./ExecutiveTable";

export function SalesFinancialTable({ sales }: { sales: SalesReport }) {
  const summary = financialSummary(sales);
  return (
    <section aria-labelledby="financial-heading" className="space-y-3">
      <h3 id="financial-heading" className="text-lg font-semibold">
        Ventas y recaudación por embudo y producto
      </h3>
      <p className="text-sm text-muted-foreground">
        Precio acordado y primera cuota registrada. Cada moneda se presenta por separado.
      </p>
      {!summary.complete ? (
        <p role="status" className="rounded-lg bg-muted p-4 text-sm">
          Datos insuficientes: la colección de ventas está incompleta o no concilia con el total
          reportado. No se calculan importes sobre una página parcial.
        </p>
      ) : (
        <>
          <ExecutiveTable
            minWidth="min-w-[1100px]"
            rows={summary.groups}
            rowKey={(row) => JSON.stringify([row.pipeline, row.product, row.currencySource])}
            empty="No existen ventas para los filtros seleccionados."
            columns={[
              { key: "pipeline", label: "Embudo", value: (r) => r.pipeline.toUpperCase() },
              { key: "product", label: "Producto", value: (r) => r.product },
              {
                key: "currency",
                label: "Moneda",
                value: (r) => r.currencySource || "Sin moneda",
                render: (r) =>
                  r.currency ||
                  (r.currencySource ? `No reconocida (${r.currencySource})` : "Sin moneda"),
              },
              { key: "sales", label: "Ventas", value: (r) => r.sales },
              {
                key: "reference",
                label: "Precio de referencia unitario",
                value: (r) => r.reference,
                formula:
                  "CM: USD 10,558.70 · EM: USD 1,497.00. Referencia comercial en USD; no sustituye el precio acordado ni representa cobros o una conversión monetaria.",
                render: (r) => (r.reference == null ? "—" : financialAmount(r.reference, "USD")),
              },
              {
                key: "price",
                label: "Precio acordado total",
                value: (r) => r.price,
                formula:
                  "Suma de precioAcordadoProducto de las oportunidades del grupo. Si faltan importes, la suma es parcial.",
                render: (r) => (
                  <>
                    {financialAmount(r.price, r.currency)}
                    {r.missingPrice > 0 && (
                      <small className="block text-amber-700">
                        Suma parcial · {r.missingPrice} sin importe
                      </small>
                    )}
                  </>
                ),
              },
              {
                key: "quota",
                label: "Cuota 1 registrada",
                value: (r) => r.quota,
                formula:
                  "Suma de montoCuota1. No incluye pagos posteriores. Si faltan importes, la suma es parcial.",
                render: (r) => (
                  <>
                    {financialAmount(r.quota, r.currency)}
                    {r.missingQuota > 0 && (
                      <small className="block text-amber-700">
                        Suma parcial · {r.missingQuota} sin importe
                      </small>
                    )}
                  </>
                ),
              },
              {
                key: "rate",
                label: "% Cuota 1 / Precio acordado",
                value: (r) => r.rate,
                formula:
                  "Cuota 1 registrada / precio acordado total × 100. No aplicable con moneda desconocida, importes incompletos o precio total ≤ 0. No se limita al 100%.",
                render: (r) => (
                  <>
                    {r.rate == null ? "No aplicable" : `${formatNumber(r.rate)} %`}
                    {r.excess > 0 && (
                      <small className="block text-amber-700">
                        Revisar: {r.excess} ventas con cuota 1 mayor al precio
                      </small>
                    )}
                    {r.zeroPrice > 0 && (
                      <small className="block text-amber-700">
                        {r.zeroPrice} ventas con precio en cero
                      </small>
                    )}
                  </>
                ),
              },
            ]}
          />
          <p className="text-xs text-muted-foreground">
            Las referencias se muestran siempre en USD y no se suman. Las ventas con observaciones
            permanecen en el conteo comercial.
          </p>
          {!summary.idsVerified && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Identificación de ventas</summary>
              <p>
                Conteo según el reporte de oportunidades. La fuente no envía todos los Opportunity
                ID; no puede certificarse aquí la unicidad por identificador.
              </p>
            </details>
          )}
        </>
      )}
    </section>
  );
}
