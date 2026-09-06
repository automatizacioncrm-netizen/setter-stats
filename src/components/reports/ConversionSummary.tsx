import type { ReportKpis } from "@/types/reports";

interface Props {
  kpis: ReportKpis;
}

export function ConversionSummary({ kpis }: Props) {
  const pct = (value: number) => (kpis.total ? Math.round((value / kpis.total) * 100) : 0);

  const steps = [
    {
      label: "Agendados / Total",
      value: kpis.agendadoCRM + kpis.asistio + kpis.reagendado,
      color: "var(--status-agendado)",
    },
    { label: "Asistieron", value: kpis.asistio, color: "var(--status-asistio)" },
    {
      label: "No show / Cancelados",
      value: kpis.noShow + kpis.cancelado,
      color: "var(--status-cancelado)",
    },
  ];

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <h3 className="text-sm font-semibold text-foreground">Efectividad de la agenda</h3>
      <p className="text-xs text-muted-foreground">Sobre {kpis.total} oportunidades</p>

      <div className="mt-4 space-y-3">
        {steps.map((step) => (
          <div key={step.label}>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{step.label}</span>
              <span className="font-medium tabular-nums text-foreground">
                {step.value} · {pct(step.value)}%
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{ width: `${pct(step.value)}%`, backgroundColor: step.color }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
