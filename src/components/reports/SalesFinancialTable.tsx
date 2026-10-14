import type { SalesReport } from "@/types/reports";
import { financialSummary, financialAmount } from "@/lib/executive-metrics";
import { ExecutiveTable } from "./ExecutiveTable";

export function SalesFinancialTable({ sales }: { sales: SalesReport }) {
  const summary = financialSummary(sales);
  const usdGroups = new Map<string, {
    pipeline: string;
    product: string;
    sales: number;
    paid: number;
    missingPaid: number;
  }>();
  for (const group of summary.groups) {
    const key = JSON.stringify([group.pipeline, group.product]);
    const row = usdGroups.get(key) ?? {
      pipeline: group.pipeline,
      product: group.product,
      sales: 0,
      paid: 0,
      missingPaid: 0,
    };
    row.sales += group.sales;
    if (group.currency === "USD" || group.currency === "PEN") {
      row.paid += group.currency === "PEN" ? group.paid / 3.40 : group.paid;
      row.missingPaid += group.missingPaid;
    } else {
      row.missingPaid += group.sales;
    }
    usdGroups.set(key, row);
  }
  const displayRows = [...usdGroups.values()];
  return (
    <section aria-labelledby="financial-heading" className="space-y-3">
      <h3 id="financial-heading" className="text-lg font-semibold">
        5. Ventas y recaudación por embudo y producto
      </h3>
      <p className="text-sm text-muted-foreground">
        El monto total abonado suma las cuotas 1 registradas en USD. Tipo de cambio fijo: 1 USD = S/ 3.40.
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
            rows={displayRows}
            rowKey={(row) => JSON.stringify([row.pipeline, row.product])}
            empty="No existen ventas para los filtros seleccionados."
            columns={[
              { key: "pipeline", label: "Embudo", value: (r) => r.pipeline.toUpperCase() },
              { key: "product", label: "Producto", value: (r) => r.product },
              { key: "sales", label: "Ventas", value: (r) => r.sales },
              {
                key: "paid",
                label: "Monto total Abonado",
                value: (r) => r.paid,
                formula: "Suma de cuotas 1 en USD más cuotas 1 en PEN / 3.40. Si faltan importes o la moneda es desconocida, la suma es parcial.",
                render: (r) => (
                  <>
                    {financialAmount(r.paid, "USD")}
                    {r.missingPaid > 0 && (
                      <small className="block text-amber-700">
                        Suma parcial · {r.missingPaid} sin importe o moneda válida
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
