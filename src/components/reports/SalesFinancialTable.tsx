import type { SalesReport } from "@/types/reports";
import { financialSummary, financialAmount } from "@/lib/executive-metrics";
import { useState } from "react";
import { ArrowUpDown } from "lucide-react";
import type { ExecutiveColumn } from "./ExecutiveTable";

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
        5. Resumen total de Ventas por Embudo y Producto
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
          <FinancialTable
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

function FinancialTable<T>({
  rows,
  columns,
  rowKey,
  empty,
  minWidth = "min-w-[600px]",
}: {
  rows: readonly T[];
  columns: ExecutiveColumn<T>[];
  rowKey: (row: T) => string;
  empty: string;
  minWidth?: string;
}) {
  const [sort, setSort] = useState<{ key: string; asc: boolean } | null>(null);
  const column = columns.find((item) => item.key === sort?.key);
  const sorted = column
    ? [...rows].sort((a, b) => {
        const av = column.value(a),
          bv = column.value(b);
        // Missing metrics remain at the bottom in either direction.
        if (av == null) return bv == null ? 0 : 1;
        if (bv == null) return -1;
        return (
          (typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv), "es", { numeric: true })) * (sort?.asc ? 1 : -1)
        );
      })
    : rows;
  // Keep each pipeline together, in the order of its first sorted product.
  const groups = new Map<string | number | null, T[]>();
  const pipelineColumn = columns.find((item) => item.key === "pipeline")!;
  for (const row of sorted) {
    const key = pipelineColumn.value(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className={`w-full text-sm ${minWidth}`}>
        <thead>
          <tr className="bg-muted/60 text-left text-xs text-muted-foreground">
            {columns.map((item) => (
              <th
                key={item.key}
                scope="col"
                className="px-4 py-3 font-medium"
                aria-sort={
                  sort?.key === item.key ? (sort.asc ? "ascending" : "descending") : "none"
                }
              >
                <button
                  type="button"
                  title={item.formula}
                  className="inline-flex items-center gap-1 text-left"
                  onClick={() =>
                    setSort((previous) => ({
                      key: item.key,
                      asc: previous?.key === item.key ? !previous.asc : true,
                    }))
                  }
                >
                  {item.label}
                  <ArrowUpDown className="h-3 w-3 shrink-0" aria-hidden="true" />
                </button>
                {item.formula && (
                  <span
                    tabIndex={0}
                    title={item.formula}
                    aria-label={item.formula}
                    className="ml-1 cursor-help"
                  >
                    ⓘ
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...groups.values()].flatMap((group) =>
            group.map((row, index) => (
              <tr key={rowKey(row)} className="hover:bg-accent/50">
                {columns.map((item) => {
                  if (item.key === "pipeline" && index > 0) return null;
                  return (
                    <td
                      key={item.key}
                      rowSpan={item.key === "pipeline" ? group.length : undefined}
                      className={`border-t border-border px-4 py-3 tabular-nums${item.key === "pipeline" ? " align-middle" : ""}`}
                    >
                      {item.render ? item.render(row) : (item.value(row) ?? "—")}
                    </td>
                  );
                })}
              </tr>
            )),
          )}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="p-6 text-center text-muted-foreground">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
