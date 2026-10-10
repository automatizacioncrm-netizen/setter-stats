import type { ReportFilters, VslClosersReport } from "@/types/reports";
import { executiveCards, hasSelectedSetter } from "@/lib/executive-presentation";
import { KpiCard } from "./KpiCard";
export function ExecutiveSummary({
  report,
  filters,
}: {
  report: VslClosersReport;
  filters: ReportFilters;
}) {
  const selected = hasSelectedSetter(filters);
  return (
    <div
      role="region"
      aria-label="Indicadores del resumen ejecutivo"
      className={
        selected
          ? "grid grid-cols-1 gap-4 sm:grid-cols-3"
          : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      }
    >
      {executiveCards(report, selected).map((card) => (
        <KpiCard key={card.label} {...card} />
      ))}
    </div>
  );
}
