import type { ReportFilters, VslClosersReport } from "@/types/reports";
import { executiveCards, hasSelectedSetter } from "@/lib/executive-presentation";
import { KpiCard } from "./KpiCard";
import { useEffect, type ComponentProps } from "react";
export function ExecutiveSummary({
  report,
  filters,
}: {
  report: VslClosersReport;
  filters: ReportFilters;
}) {
  const selected = hasSelectedSetter(filters);
  const isVsl = filters.pipeline === "vsl";
  const vslSeteo = report.vslSeteo;
  useEffect(() => {
    if (isVsl && !vslSeteo) {
      console.warn("[vsl_report] Falta data.vslSeteo para el resumen VSL.", {
        pipeline: filters.pipeline,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
      });
    }
  }, [isVsl, vslSeteo, filters.pipeline, filters.dateFrom, filters.dateTo]);
  const count = (value: number | null | undefined) =>
    typeof value === "number" && Number.isFinite(value) ? value : "—";
  const hint = (value: number | null | undefined) =>
    typeof value === "number" && Number.isFinite(value) ? `${value}% de los leads VSL` : "";
  const cards = executiveCards(report, selected).flatMap<ComponentProps<typeof KpiCard>>((card) =>
    isVsl && card.label === "Total de agendamientos"
      ? [
          {
            label: "Leads seteados",
            value: count(vslSeteo?.seteados),
            hint: hint(vslSeteo?.seteadosPct),
          },
          {
            label: "Leads pendientes de seteo",
            value: count(vslSeteo?.faltanSetear),
            hint: hint(vslSeteo?.faltanSetearPct),
          },
        ]
      : [card],
  );
  return (
    <div
      role="region"
      aria-label="Indicadores del resumen ejecutivo"
      className={
        isVsl
          ? `grid grid-cols-1 gap-4 sm:grid-cols-2 ${selected ? "lg:grid-cols-4" : "lg:grid-cols-5"}`
          : selected
            ? "grid grid-cols-1 gap-4 sm:grid-cols-3"
            : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      }
    >
      {cards.map((card) => (
        <KpiCard key={card.label} {...card} />
      ))}
    </div>
  );
}
