import { useState, type ReactNode } from "react";
import { ArrowUpDown } from "lucide-react";

export interface ExecutiveColumn<T> {
  key: string;
  label: string;
  formula?: string;
  value: (row: T) => string | number | null;
  render?: (row: T) => ReactNode;
}

export function ExecutiveTable<T>({
  rows,
  columns,
  rowKey,
  empty,
  minWidth = "min-w-[600px]",
  footer,
}: {
  rows: readonly T[];
  columns: ExecutiveColumn<T>[];
  rowKey: (row: T) => string;
  empty: string;
  minWidth?: string;
  footer?: ReactNode;
}) {
  const [sort, setSort] = useState<{ key: string; asc: boolean } | null>(null);
  const column = columns.find((item) => item.key === sort?.key);
  const sorted = column
    ? [...rows].sort((a, b) => {
        const av = column.value(a),
          bv = column.value(b);
        // Missing metrics remain at the bottom in either direction.
        if (av == null) return bv == null ? 0 : 1;
        if (bv == null) return -1;
        return (
          (typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv), "es", { numeric: true })) * (sort?.asc ? 1 : -1)
        );
      })
    : rows;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className={`w-full text-sm ${minWidth}`}>
        <thead>
          <tr className="bg-muted/60 text-left text-xs text-muted-foreground">
            {columns.map((item) => (
              <th
                key={item.key}
                scope="col"
                className="px-4 py-3 font-medium"
                aria-sort={
                  sort?.key === item.key ? (sort.asc ? "ascending" : "descending") : "none"
                }
              >
                <button
                  type="button"
                  title={item.formula}
                  className="inline-flex items-center gap-1 text-left"
                  onClick={() =>
                    setSort((previous) => ({
                      key: item.key,
                      asc: previous?.key === item.key ? !previous.asc : true,
                    }))
                  }
                >
                  {item.label}
                  <ArrowUpDown className="h-3 w-3 shrink-0" aria-hidden="true" />
                </button>
                {item.formula && (
                  <span
                    tabIndex={0}
                    title={item.formula}
                    aria-label={item.formula}
                    className="ml-1 cursor-help"
                  >
                    ⓘ
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={rowKey(row)} className="border-t border-border hover:bg-accent/50">
              {columns.map((item) => (
                <td key={item.key} className="px-4 py-3 tabular-nums">
                  {item.render ? item.render(row) : (item.value(row) ?? "—")}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="p-6 text-center text-muted-foreground">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
        {footer && <tfoot>{footer}</tfoot>}
      </table>
    </div>
  );
}
