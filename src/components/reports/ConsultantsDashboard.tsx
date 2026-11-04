import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  consultantMonths,
  nextConsultantSort,
  sortConsultantRows,
  type ConsultantSort,
  type ConsultantsReport,
} from "@/lib/consultants-report";
import { consultantsQueryKey, fetchConsultants } from "@/lib/consultants-query";
const areaColumns = ["MES", "RRHH", "MKTG", "FINANZAS", "COMERCIAL/EMPRESARIAL"] as const;
const entrepreneurColumns = ["NOMBRE", ...consultantMonths, "TOTAL"] as const;
export function ConsultantsTables({ data }: { data: ConsultantsReport }) {
  const tables = [
    {
      title: "REPORTE DE CALENDARIOS POR CONSULTOR",
      columns: areaColumns,
      rows: data.porArea.map((row) => areaColumns.map((key) => row[key])),
    },
    {
      title: "N° de sesiones que cada empresario recibe",
      columns: entrepreneurColumns,
      rows: data.porEmpresario.map((row) => entrepreneurColumns.map((key) => row[key])),
    },
  ];
  return (
    <>
      {tables.map((table, index) => (
        <ConsultantsTable key={table.title} {...table} monthColumn={index === 0} />
      ))}
    </>
  );
}
function ConsultantsTable({
  title,
  columns,
  rows,
  monthColumn,
}: {
  title: string;
  columns: readonly string[];
  rows: (string | number)[][];
  monthColumn: boolean;
}) {
  const [sort, setSort] = useState<ConsultantSort | null>(null);
  const orderedRows = sortConsultantRows(rows, sort, monthColumn);
  return (
    <section
      className={
        "mx-auto w-full min-w-0 overflow-hidden rounded-xl border border-border bg-white shadow-card " +
        (monthColumn ? "max-w-[960px]" : "max-w-[1480px]")
      }
    >
      <h2 className="bg-zinc-700 p-4 text-center text-base font-bold text-white">{title}</h2>
      <div className="max-h-[70vh] overflow-auto">
        <table
          className="w-full table-fixed border-collapse text-sm"
          style={{ minWidth: monthColumn ? 680 : 1376 }}
        >
          <colgroup>
            {columns.map((column, index) => (
              <col
                key={column}
                style={{ width: monthColumn ? (index === 4 ? 220 : 115) : index === 0 ? 224 : 96 }}
              />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-20 bg-white">
            <tr>
              {columns.map((column, index) => {
                const selected = sort?.column === index;
                const Icon = selected
                  ? sort.direction === "desc"
                    ? ArrowDown
                    : ArrowUp
                  : ArrowUpDown;
                return (
                  <th
                    key={column}
                    scope="col"
                    aria-sort={
                      selected ? (sort.direction === "desc" ? "descending" : "ascending") : "none"
                    }
                    className="border border-border p-0 text-center align-middle font-semibold"
                  >
                    <button
                      type="button"
                      onClick={() => setSort((current) => nextConsultantSort(current, index))}
                      aria-label={
                        "Ordenar " +
                        column +
                        " de " +
                        (selected && sort.direction === "desc" ? "menor a mayor" : "mayor a menor")
                      }
                      className="flex w-full items-center justify-center gap-1 px-1.5 py-2 text-center hover:bg-brand-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                    >
                      <span className="min-w-0 break-words">{column}</span>
                      <Icon aria-hidden="true" className="h-3 w-3 shrink-0" />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {orderedRows.map((row, index) => (
              <tr key={index}>
                {row.map((value, column) => (
                  <td
                    key={column}
                    className="border border-border px-1.5 py-2 text-center align-middle break-words tabular-nums"
                  >
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <p className="p-4 text-sm text-muted-foreground">Sin registros disponibles.</p>
      )}
    </section>
  );
}

export function ConsultantsDashboard() {
  const query = useQuery({
    queryKey: consultantsQueryKey,
    queryFn: fetchConsultants,
    retry: false,
    staleTime: Infinity,
    gcTime: 1800000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  return (
    <main className="min-h-screen space-y-6 bg-background p-4 sm:p-8">
      <Link to="/reports" className="text-sm text-brand hover:underline">
        ← Reportes comerciales
      </Link>
      <h1 className="text-xl font-semibold">CONSULTOR | CITAS Y CALENDARIOS</h1>
      {query.isFetching && (
        <div role="status" className="rounded-xl border border-border bg-white p-6 shadow-card">
          Cargando horas de consultoría…
        </div>
      )}
      {query.isError ? (
        <section
          role="alert"
          className="space-y-3 rounded-xl border border-destructive bg-white p-6 shadow-card"
        >
          <h2 className="font-semibold">No se pudo cargar el reporte</h2>
          <p className="text-sm text-destructive">{query.error.message}</p>
          <button
            disabled={query.isFetching}
            onClick={() => void query.refetch({ cancelRefetch: false })}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            Reintentar
          </button>
        </section>
      ) : query.data ? (
        <ConsultantsTables data={query.data} />
      ) : null}
    </main>
  );
}
