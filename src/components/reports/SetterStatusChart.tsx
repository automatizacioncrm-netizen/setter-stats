import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SetterRow } from "@/types/reports";

const SERIES = [
  { key: "asistio", label: "Asistió", color: "var(--status-asistio)" },
  { key: "agendadoCRM", label: "Agendado CRM", color: "var(--status-agendado)" },
  { key: "confirmado", label: "Confirmado", color: "var(--brand)" },
  { key: "noShow", label: "No asistió", color: "var(--status-noshow)" },
  { key: "cancelado", label: "Cancelado", color: "var(--status-cancelado)" },
  { key: "pendienteAgenda", label: "Pendiente de agenda", color: "var(--status-pendiente)" },
  { key: "reagendado", label: "Reagendado", color: "var(--status-reagendado)" },
] as const;

interface Props {
  rows: SetterRow[];
  tasaAsistencia: number;
}

export function SetterStatusChart({ rows, tasaAsistencia }: Props) {
  const height = Math.max(240, rows.length * 52 + 60);

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">Composición por Setter</h3>
          <p className="text-xs text-muted-foreground">Barras apiladas por estado de agenda</p>
        </div>
        <div className="shrink-0 rounded-lg bg-brand-soft px-3 py-1.5 text-right">
          <p className="text-[11px] font-medium uppercase tracking-wide text-brand">
            Tasa de asistencia
          </p>
          <p className="text-lg font-semibold tabular-nums text-brand">{tasaAsistencia}%</p>
        </div>
      </div>

      <div className="mt-4 w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
          >
            <CartesianGrid horizontal={false} stroke="var(--border)" />
            <XAxis
              type="number"
              tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="setter"
              width={90}
              tick={{ fontSize: 12, fill: "var(--foreground)" }}
            />
            <Tooltip
              cursor={{ fill: "var(--accent)" }}
              contentStyle={{
                borderRadius: 10,
                border: "1px solid var(--border)",
                fontSize: 12,
                background: "var(--surface)",
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            {SERIES.map((serie) => (
              <Bar
                key={serie.key}
                dataKey={serie.key}
                name={serie.label}
                stackId="estado"
                fill={serie.color}
                radius={serie.key === "reagendado" ? [0, 4, 4, 0] : 0}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
