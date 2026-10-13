import type { SalesReport } from "@/types/reports";
import { financialSummary, financialAmount } from "@/lib/executive-metrics";
import { ExecutiveTable } from "./ExecutiveTable";

export function SalesFinancialTable({ sales }: { sales: SalesReport }) {
  const summary = financialSummary(sales);
  return (
    <section aria-labelledby="financial-heading" className="space-y-3">
      <h3 id="financial-heading" className="text-lg font-semibold">
        Ventas y recaudación por embudo y producto
      </h3>
      <p className="text-sm text-muted-foreground">
        El monto total abonado suma las cuotas 1 registradas. Los importes se presentan por moneda.
      </p>
      {!summary.complete ? (
        <p role="status" className="rounded-lg bg-muted p-4 text-sm">
          Datos insuficientes: la colección de ventas está incompleta o no concilia con el total
          reportado. No se calculan importes sobre una página parcial.
        </p>
      ) : (
        <>
          <ExecutiveTable
            minWidth="min-w-[600px]"
            rows={summary.groups}
            rowKey={(row) => JSON.stringify([row.pipeline, row.product, row.currencySource])}
            empty="No existen ventas para los filtros seleccionados."
            columns={[
              { key: "pipeline", label: "Embudo", value: (r) => r.pipeline.toUpperCase() },
              { key: "product", label: "Producto", value: (r) => r.product },
              { key: "sales", label: "Ventas", value: (r) => r.sales },
              {
                key: "paid",
                label: "Monto total Abonado",
                value: (r) => r.paid,
                formula: "Suma de las cuotas 1 registradas del grupo. Si faltan importes, la suma es parcial.",
                render: (r) => (
                  <>
                    {financialAmount(r.paid, r.currency || r.currencySource)}
                    {r.missingPaid > 0 && (
                      <small className="block text-amber-700">
                        Suma parcial · {r.missingPaid} sin importe
                      </small>
                    )}
                  </>
                ),
              },
            ]}
          />
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
