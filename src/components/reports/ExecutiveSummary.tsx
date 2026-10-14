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
  const isLig = filters.pipeline === "lig";
  const ligNoCalificados = report.businessMetrics?.ligNoCalificados;
  const vslSeteo = report.vslSeteo;
  const vslNoAplica = report.vslNoAplica;
  useEffect(() => {
    if (isVsl && !vslNoAplica)
      console.warn("[vsl_report] Falta data.vslNoAplica para el resumen VSL.", {
        pipeline: filters.pipeline,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
      });
  }, [isVsl, vslNoAplica, filters.pipeline, filters.dateFrom, filters.dateTo]);
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
  const cards = executiveCards(report, selected, filters.pipeline).flatMap<
    ComponentProps<typeof KpiCard>
  >((card) =>
    isVsl && card.label === "Leads seteados"
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
          {
            label: "No aplica",
            value: count(vslNoAplica?.total),
            hint:
              typeof vslNoAplica?.porcentaje === "number"
                ? `${vslNoAplica.porcentaje.toFixed(2)}% de los leads VSL`
                : "",
          },
        ]
      : [card],
  );
  const vslOrder = [
    "Total de leads",
    "Leads seteados",
    "Leads asistidos",
    "Total de ventas",
    "No aplica",
    "Leads pendientes de seteo",
  ];
  if (isLig) {
    cards.push({
      label: "No calificados",
      value: ligNoCalificados?.noCalificados ?? 0,
      hint: `${ligNoCalificados?.noCalificadosPct ?? 0}% de los leads LIG`,
    });
  }
  const orderedCards = isVsl
    ? cards
        .sort((a, b) => vslOrder.indexOf(a.label) - vslOrder.indexOf(b.label))
        .map((card) => (card.label === "No aplica" ? { ...card, label: "No calificados" } : card))
    : cards;
  return (
    <div
      role="region"
      aria-label="Indicadores del resumen ejecutivo"
      className={
        isVsl
          ? `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${selected ? "2xl:grid-cols-5" : "2xl:grid-cols-6"}`
          : isLig
            ? `grid grid-cols-1 gap-4 sm:grid-cols-2 ${selected ? "lg:grid-cols-4" : "lg:grid-cols-5"}`
            : selected
              ? "grid grid-cols-1 gap-4 sm:grid-cols-3"
              : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      }
    >
      {orderedCards.map((card) => (
        <KpiCard key={card.label} {...card} />
      ))}
    </div>
  );
}
