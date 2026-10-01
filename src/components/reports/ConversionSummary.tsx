import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { ReportKpis } from "@/types/reports";

interface Props {
  kpis: ReportKpis;
}

export function ConversionSummary({ kpis }: Props) {
  const pct = (value: number) => (kpis.total ? Math.round((value / kpis.total) * 100) : 0);

  // Same status colors as Composición general de citas.
  const states = [
    { name: "Confirmado", value: kpis.confirmado ?? 0, color: "var(--brand)" },
    { name: "Asistió", value: kpis.asistio, color: "var(--status-asistio)" },
    { name: "No asistió", value: kpis.noShow, color: "var(--status-noshow)" },
    { name: "Cancelado", value: kpis.cancelado, color: "var(--status-cancelado)" },
  ];

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <h3 className="text-sm font-semibold text-foreground">Efectividad de la agenda</h3>
      <p className="text-xs text-muted-foreground">Sobre {kpis.total} agendamientos reales</p>

      <div className="relative mx-auto mt-3 h-44 w-full max-w-64 sm:h-48">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <PieChart>
            <Pie
              data={states.filter((state) => state.value > 0)}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="65%"
              outerRadius="90%"
              startAngle={90}
              endAngle={-270}
              stroke="var(--surface)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {states
                .filter((state) => state.value > 0)
                .map((state) => (
                  <Cell key={state.name} fill={state.color} />
                ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [`${value} agendamientos · ${pct(Number(value))}%`, name]}
              contentStyle={{
                borderRadius: 10,
                border: "1px solid var(--border)",
                fontSize: 12,
                background: "var(--surface)",
                color: "var(--foreground)",
              }}
              wrapperStyle={{ zIndex: 10 }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums text-foreground">{kpis.total}</span>
          <span className="text-xs text-muted-foreground">Agendamientos</span>
        </div>
      </div>
      <ul className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 text-xs min-[380px]:grid-cols-2">
        {states.map((state) => (
          <li key={state.name} className="flex min-w-0 items-start gap-2">
            <span
              aria-hidden="true"
              className="mt-1 h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: state.color }}
            />
            <div className="min-w-0">
              <span className="text-muted-foreground">{state.name}</span>
              <p className="font-medium tabular-nums text-foreground">
                {state.value} · {pct(state.value)}%
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
