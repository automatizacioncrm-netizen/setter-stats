import { useMemo, useState } from "react";
import { ArrowUpDown } from "lucide-react";
import type { SetterRow, ReportKpis } from "@/types/reports";

type SortKey = keyof SetterRow | "attendanceRate";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "confirmado", label: "Confirmado" },
  { key: "asistio", label: "Asistió" },
  { key: "attendanceRate", label: "% Asistió" },
  { key: "cancelado", label: "Cancelado" },
  { key: "noShow", label: "No asistió" },
  { key: "total", label: "Total agendamientos" },
];

const n = (value: number | undefined | null) => (typeof value === "number" ? value : 0);
const attendanceRate = (attended: number, total: number) => {
  const rate = total > 0 ? (attended / total) * 100 : 0;
  return Number.isFinite(rate) ? Math.round(rate) : 0;
};
const sortValue = (row: SetterRow, key: Exclude<SortKey, "setter">) =>
  key === "attendanceRate" ? attendanceRate(row.asistio, row.total) : n(row[key]);

export function SetterStatusTable({
  rows,
  totals,
  mode,
}: {
  rows: SetterRow[];
  totals: ReportKpis;
  mode: "setter" | "booker" | "general";
}) {
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [asc, setAsc] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sortKey === "setter")
        return asc ? a.setter.localeCompare(b.setter) : b.setter.localeCompare(a.setter);
      return asc
        ? sortValue(a, sortKey) - sortValue(b, sortKey)
        : sortValue(b, sortKey) - sortValue(a, sortKey);
    });
    return copy;
  }, [rows, sortKey, asc]);

  const toggle = (key: SortKey) => {
    if (key === sortKey) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">
          {mode === "booker"
            ? "Agendamientos por Agendador"
            : mode === "setter"
              ? "Desempeño por Setter"
              : "Desempeño general de citas"}
        </h3>
        <p className="text-xs text-muted-foreground">
          Conteo de agendamientos reales por estado de Calendar
        </p>
      </div>
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[800px] text-sm">
          <thead>
            <tr className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <th className="sticky left-0 bg-muted/60 px-4 py-2 text-left font-medium">
                <button className="inline-flex items-center gap-1" onClick={() => toggle("setter")}>
                  {mode === "booker" ? "Agendador" : mode === "setter" ? "Setter asignado" : "Responsable"} <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              {(mode === "booker" ? COLUMNS.filter((col) => col.key === "total") : COLUMNS).map((col) => (
                <th key={col.key} className="px-4 py-2 text-right font-medium">
                  <button
                    className="inline-flex items-center gap-1"
                    onClick={() => toggle(col.key)}
                  >
                    {col.label} <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr
                key={row.setter || "Sin setter asignado"}
                className="border-t border-border hover:bg-accent/50"
              >
                <td className="sticky left-0 bg-surface px-4 py-2 font-medium text-foreground">
                  {row.setter || "Sin setter asignado"}
                </td>
                {(mode === "booker" ? COLUMNS.filter((col) => col.key === "total") : COLUMNS).map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-2 text-right tabular-nums ${
                      col.key === "total"
                        ? "font-semibold text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {col.key === "attendanceRate"
                      ? `${attendanceRate(row.asistio, row.total)}%`
                      : n(row[col.key] as number)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-brand-soft font-semibold text-foreground">
              <td className="sticky left-0 bg-brand-soft px-4 py-2">Total general</td>
              {(mode === "booker" ? COLUMNS.filter((col) => col.key === "total") : COLUMNS).map((col) => (
                <td key={col.key} className="px-4 py-2 text-right tabular-nums">
                  {col.key === "attendanceRate"
                    ? `${attendanceRate(totals.asistio, totals.total)}%`
                    : n(
                        col.key === "total" ? totals.total : totals[col.key as keyof typeof totals],
                      )}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
