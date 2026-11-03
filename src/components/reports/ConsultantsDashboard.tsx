import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { consultantMonths, type ConsultantsReport } from "@/lib/consultants-report";
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
      {tables.map((table) => (
        <section
          key={table.title}
          className="min-w-0 overflow-hidden rounded-xl border border-border bg-white shadow-card"
        >
          <h2 className="bg-zinc-700 p-4 text-center text-base font-bold text-white">
            {table.title}
          </h2>
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-20 bg-white">
                <tr>
                  {table.columns.map((column, index) => (
                    <th
                      key={column}
                      className={`min-w-28 border border-border p-3 font-semibold ${index === 0 ? "min-w-48 text-left" : "text-right"}`}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, index) => (
                  <tr key={index}>
                    {row.map((value, column) => (
                      <td
                        key={column}
                        className={`border border-border p-3 tabular-nums ${column === 0 ? "text-left" : "text-right"}`}
                      >
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {table.rows.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">Sin registros disponibles.</p>
          )}
        </section>
      ))}
    </>
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
