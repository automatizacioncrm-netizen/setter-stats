import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  type PieLabelRenderProps,
} from "recharts";
import type { ReportKpis } from "@/types/reports";

interface Props {
  kpis: ReportKpis;
}

function SliceCount({
  cx,
  cy,
  midAngle,
  outerRadius,
  value,
  percentage,
  startAngle,
  endAngle,
}: PieLabelRenderProps & { percentage: number }) {
  const angle = (-Number(midAngle) * Math.PI) / 180;
  const sliceAngle = Math.abs(Number(endAngle) - Number(startAngle));
  const radius = Number(outerRadius) * (sliceAngle < 50 ? 0.74 : 0.62);
  const x = Number(cx) + radius * Math.cos(angle);
  const y = Number(cy) + radius * Math.sin(angle);
  return (
    <g
      transform={`translate(${x}, ${y})`}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      className="tabular-nums"
    >
      <text y={-9} fontSize={18} fontWeight={700}>
        {value}
      </text>
      <text y={13} fontSize={13} fontWeight={500}>
        {percentage}%
      </text>
    </g>
  );
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

      <div className="relative mx-auto mt-4 h-60 w-full max-w-72 sm:h-64">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <PieChart>
            <Pie
              data={states.filter((state) => state.value > 0)}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={0}
              outerRadius="90%"
              startAngle={90}
              endAngle={-270}
              stroke="var(--surface)"
              strokeWidth={2}
              isAnimationActive={false}
              label={(props: PieLabelRenderProps) => (
                <SliceCount {...props} percentage={pct(Number(props["value"]))} />
              )}
              labelLine={false}
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
      </div>
      <ul className="mx-auto mt-4 grid max-w-72 grid-cols-1 gap-x-6 gap-y-3 text-sm min-[380px]:grid-cols-2">
        {states.map((state) => (
          <li key={state.name} className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: state.color }}
            />
            <div className="min-w-0">
              <span className="text-muted-foreground">{state.name}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
