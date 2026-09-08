import { useMemo, useState } from "react";
import { ArrowUpDown } from "lucide-react";
import type { SetterRow, ReportKpis } from "@/types/reports";

type SortKey = keyof SetterRow;

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "agendadoCRM", label: "Agendado CRM" },
  { key: "asistio", label: "Asistió" },
  { key: "cancelado", label: "Cancelado" },
  { key: "noShow", label: "No show" },
  { key: "pendienteAgenda", label: "Pendiente de agenda" },
  { key: "reagendado", label: "Reagendado" },
  { key: "total", label: "Total general" },
];

const n = (value: number | undefined | null) => (typeof value === "number" ? value : 0);

export function SetterStatusTable({ rows, totals }: { rows: SetterRow[]; totals: ReportKpis }) {
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [asc, setAsc] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sortKey === "setter")
        return asc ? a.setter.localeCompare(b.setter) : b.setter.localeCompare(a.setter);
      return asc
        ? n(a[sortKey] as number) - n(b[sortKey] as number)
        : n(b[sortKey] as number) - n(a[sortKey] as number);
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
        <h3 className="text-sm font-semibold text-foreground">Desempeño por Setter</h3>
        <p className="text-xs text-muted-foreground">
          Conteo de oportunidades por estado de agenda
        </p>
      </div>
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <th className="sticky left-0 bg-muted/60 px-4 py-2 text-left font-medium">
                <button className="inline-flex items-center gap-1" onClick={() => toggle("setter")}>
                  Setter asignado <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              {COLUMNS.map((col) => (
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
                {COLUMNS.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-2 text-right tabular-nums ${
                      col.key === "total"
                        ? "font-semibold text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {n(row[col.key] as number)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-brand-soft font-semibold text-foreground">
              <td className="sticky left-0 bg-brand-soft px-4 py-2">Total general</td>
              {COLUMNS.map((col) => (
                <td key={col.key} className="px-4 py-2 text-right tabular-nums">
                  {n(
                    col.key === "total"
                      ? totals.conEstadoAgenda
                      : totals[col.key as keyof typeof totals],
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
