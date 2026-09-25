import type { SalesValueByCurrency } from "@/types/reports";
import { formatCurrency } from "@/lib/currency";

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function SalesFinancialCards({ values }: { values: SalesValueByCurrency[] }) {
  if (!values.length)
    return (
      <p
        role="status"
        className="rounded-xl border border-border bg-surface p-5 text-sm text-muted-foreground"
      >
        No hay datos financieros para los filtros seleccionados.
      </p>
    );

  return (
    <div className="space-y-4">
      {values.map((item, index) => (
        <div
          key={index}
          role="group"
          aria-label="Resumen financiero USD"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {[
            {
              label: "VALOR TOTAL DE TICKET DE VENTA",
              value: formatCurrency(item.salesValue, "USD"),
              currency: "USD",
              accent: "var(--status-agendado)",
            },
            {
              label: "CASH RECAUDADO",
              value: formatCurrency(item.cashCollected, "USD"),
              currency: "USD",
              accent: "var(--status-asistio)",
            },
            {
              label: "% RECAUDADO",
              value: percentFormatter.format(
                (Number.isFinite(item.collectedRate) ? item.collectedRate : 0) / 100,
              ),
              currency: "",
              accent: "var(--status-agendado)",
            },
          ].map((card) => (
            <div
              key={card.label}
              className="min-w-0 rounded-xl border border-border bg-surface px-5 py-4 shadow-card"
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: card.accent }}
                />
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {card.label}
                </p>
              </div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <span className="min-w-0 break-words text-2xl font-semibold tabular-nums text-foreground xl:text-3xl">
                  {card.value}
                </span>
                {card.currency && (
                  <span className="shrink-0 text-sm text-muted-foreground">{card.currency}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
