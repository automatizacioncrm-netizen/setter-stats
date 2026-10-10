import { useMemo, useState } from "react";
import { ArrowUpDown } from "lucide-react";
import type { SetterRow, ReportKpis } from "@/types/reports";
import { getVisibleSetterRows } from "@/lib/setter-performance";

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
  key === "attendanceRate"
    ? attendanceRate(row.asistio, row.total)
    : n(typeof row[key] === "number" ? row[key] : 0);
const DETAIL_STATUS: Partial<Record<SortKey, string>> = {
  confirmado: "Confirmado",
  asistio: "Asistió",
  cancelado: "Cancelado",
  noShow: "No asistió",
};

export function SetterStatusTable({
  rows,
  mode,
  showStatuses = mode !== "booker",
  onDetail,
  busy = false,
  selectedSetter = "",
  error,
}: {
  rows: SetterRow[];
  totals: ReportKpis;
  mode: "setter" | "booker" | "general";
  showStatuses?: boolean;
  onDetail?: (
    person: string | undefined,
    status: string | undefined,
    count: number,
    sourceNames?: string[],
  ) => void;
  busy?: boolean;
  selectedSetter?: string;
  error?: string | undefined;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [asc, setAsc] = useState(false);

  const visiblePerformanceRows = useMemo(
    () => getVisibleSetterRows(rows, selectedSetter),
    [rows, selectedSetter],
  );
  const totals = useMemo(
    () =>
      visiblePerformanceRows.reduce(
        (acc, row) => ({
          confirmado: acc.confirmado + n(row.confirmado),
          asistio: acc.asistio + n(row.asistio),
          cancelado: acc.cancelado + n(row.cancelado),
          noShow: acc.noShow + n(row.noShow),
          total: acc.total + n(row.total),
        }),
        { confirmado: 0, asistio: 0, cancelado: 0, noShow: 0, total: 0 },
      ),
    [visiblePerformanceRows],
  );

  const sorted = useMemo(() => {
    const copy = [...visiblePerformanceRows];
    copy.sort((a, b) => {
      if (sortKey === "setter")
        return asc ? a.setter.localeCompare(b.setter) : b.setter.localeCompare(a.setter);
      return asc
        ? sortValue(a, sortKey) - sortValue(b, sortKey)
        : sortValue(b, sortKey) - sortValue(a, sortKey);
    });
    return copy;
  }, [visiblePerformanceRows, sortKey, asc]);

  const toggle = (key: SortKey) => {
    if (key === sortKey) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(false);
    }
  };
  const valueCell = (key: SortKey, value: number, person?: string, sourceNames?: string[]) =>
    key !== "attendanceRate" && value > 0 && onDetail && (key === "total" || DETAIL_STATUS[key]) ? (
      <button
        type="button"
        disabled={busy}
        className="cursor-pointer rounded px-1 underline decoration-dotted underline-offset-4 hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-default disabled:no-underline"
        aria-label={`Ver ${value} agendamientos de ${person === "Sin setter" ? "Sin setter identificado" : person || "Total general"}${DETAIL_STATUS[key] ? `: ${DETAIL_STATUS[key]}` : ""}`}
        onClick={() => onDetail(person, DETAIL_STATUS[key], value, sourceNames)}
      >
        {value}
      </button>
    ) : (
      value
    );

  if (error)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {error}
      </p>
    );
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
                  {mode === "booker"
                    ? "Agendador"
                    : mode === "setter"
                      ? "Setter asignado"
                      : "Responsable"}{" "}
                  <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              {(showStatuses ? COLUMNS : COLUMNS.filter((col) => col.key === "total")).map(
                (col) => (
                  <th key={col.key} className="px-4 py-2 text-right font-medium">
                    <button
                      className="inline-flex items-center gap-1"
                      onClick={() => toggle(col.key)}
                    >
                      {col.label} <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const person = row.setter || "Sin setter";
              const personLabel = person === "Sin setter" ? "Sin setter identificado" : person;
              if (error)
                return (
                  <p role="status" className="text-sm text-muted-foreground">
                    {error}
                  </p>
                );
              return (
                <tr key={person} className="border-t border-border hover:bg-accent/50">
                  <td className="sticky left-0 bg-surface px-4 py-2 font-medium text-foreground">
                    {onDetail ? (
                      <button
                        type="button"
                        disabled={busy}
                        className="cursor-pointer rounded px-1 text-left hover:bg-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-default disabled:no-underline"
                        aria-label={`Ver todos los agendamientos de ${personLabel}`}
                        onClick={() =>
                          onDetail(
                            person,
                            undefined,
                            n(row.total),
                            mode === "setter" ? undefined : row.sourceNames,
                          )
                        }
                      >
                        {personLabel}
                      </button>
                    ) : (
                      personLabel
                    )}
                  </td>
                  {(showStatuses ? COLUMNS : COLUMNS.filter((col) => col.key === "total")).map(
                    (col) => (
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
                          : valueCell(
                              col.key,
                              n(row[col.key] as number),
                              person,
                              mode === "setter" ? undefined : row.sourceNames,
                            )}
                      </td>
                    ),
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-brand-soft font-semibold text-foreground">
              <td className="sticky left-0 bg-brand-soft px-4 py-2">Total equipo visible</td>
              {(showStatuses ? COLUMNS : COLUMNS.filter((col) => col.key === "total")).map(
                (col) => (
                  <td key={col.key} className="px-4 py-2 text-right tabular-nums">
                    {col.key === "attendanceRate"
                      ? `${attendanceRate(totals.asistio, totals.total)}%`
                      : n(
                          col.key === "total"
                            ? totals.total
                            : totals[col.key as keyof typeof totals],
                        )}
                  </td>
                ),
              )}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
