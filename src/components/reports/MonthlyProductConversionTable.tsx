import { Fragment } from "react";
import type { Pipeline } from "@/types/reports";
import {
  readMonthlyConversion,
  buildMonthlyConversionMatrix,
  COMPARISON_PRODUCTS,
  formatConversionMonth,
  formatMatrixConversion,
} from "@/lib/monthly-product-conversion";

export function MonthlyProductConversionTable({
  rows: input,
  pipeline,
}: {
  rows: unknown;
  pipeline: Pipeline;
}) {
  const rows = readMonthlyConversion(input);
  const months = buildMonthlyConversionMatrix(rows ?? [], pipeline);
  return (
    <div className="mt-4 space-y-3 text-foreground">
      <h4 className="text-sm font-semibold">Conversión mensual por closer y producto</h4>
      {rows === undefined || months === undefined ? (
        <p role="status" className="rounded-lg bg-muted p-4 text-sm">
          {rows === undefined
            ? "El reporte mensual aún no está disponible en la API."
            : "La API devuelve agregados mensuales contradictorios para los mismos filtros."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table
            aria-label="Comparativa mensual por closer y producto"
            className="w-full min-w-[980px] text-sm"
          >
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th rowSpan={2} scope="col" className="px-4 py-3 text-left font-medium">
                  MES
                </th>
                <th
                  rowSpan={2}
                  scope="col"
                  className="border-r border-border px-4 py-3 text-left font-medium"
                >
                  CLOSER
                </th>
                {COMPARISON_PRODUCTS.map((producto) => (
                  <th
                    key={producto}
                    colSpan={3}
                    scope="colgroup"
                    className="border-r border-border px-4 py-3 text-center font-semibold last:border-r-0"
                  >
                    {producto.toLocaleUpperCase("es")}
                  </th>
                ))}
              </tr>
              <tr className="border-t border-border">
                {COMPARISON_PRODUCTS.map((producto) => (
                  <Fragment key={producto}>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      Asistencias
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      Ventas
                    </th>
                    <th
                      scope="col"
                      className="border-r border-border px-4 py-3 text-right font-medium last:border-r-0"
                    >
                      % Conversión
                    </th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            {months.map((month) => (
              <tbody key={month.mes} className="border-t-2 border-border">
                {month.closers.map((closer, index) => (
                  <tr key={closer.name} className="border-t border-border hover:bg-accent/50">
                    {index === 0 && (
                      <th
                        rowSpan={3}
                        scope="rowgroup"
                        className="bg-muted/30 px-4 py-3 text-left align-middle font-semibold"
                      >
                        {formatConversionMonth(month.mes, true)}
                      </th>
                    )}
                    <th
                      scope="row"
                      title={closer.name}
                      className="whitespace-nowrap border-r border-border px-4 py-3 text-left text-xs font-medium"
                    >
                      {closer.label}
                    </th>
                    {closer.products.map((producto) => (
                      <Fragment key={producto.producto}>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {producto.citasAsistidas}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{producto.ventas}</td>
                        <td className="border-r border-border bg-primary/5 px-4 py-3 text-right font-semibold tabular-nums last:border-r-0">
                          {formatMatrixConversion(producto)}
                        </td>
                      </Fragment>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
            {months.length === 0 && (
              <tbody>
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    No hay datos para los filtros seleccionados
                  </td>
                </tr>
              </tbody>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
