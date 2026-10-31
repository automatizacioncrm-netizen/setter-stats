import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatSurveyMonth } from "@/lib/survey-month";
import {
  detailVisibleIndices,
  filterSurveyDetail,
  searchSurveyDetail,
  surveyDetailSchema,
  type SurveySelection,
} from "@/lib/survey-detail";
export function SurveyDetailModal({
  selection,
  onClose,
  trigger,
}: {
  selection: SurveySelection;
  onClose: () => void;
  trigger: HTMLElement | null;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ["vsl-survey-detail", selection.month, selection.status],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ month: selection.month, status: selection.status });
      const response = await fetch(`/api/reports/vsl-calidad-detail?${params}`, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(45000)]),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo cargar el detalle.");
      const data = surveyDetailSchema.parse(body);
      if (data.month !== selection.month || data.status !== selection.status)
        throw new Error("El detalle no corresponde a la selección.");
      return data;
    },
    retry: false,
    staleTime: 300000,
    gcTime: 300000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const filtered = useMemo(() => {
    if (!query.data) return { rows: [], error: "" };
    try {
      return { rows: filterSurveyDetail(query.data.rows, selection.column), error: "" };
    } catch (error) {
      return {
        rows: [],
        error: error instanceof Error ? error.message : "Clasificación no disponible.",
      };
    }
  }, [query.data, selection.column]);
  const searched = useMemo(
    () => searchSurveyDetail(filtered.rows, search),
    [filtered.rows, search],
  );
  const mismatch =
    !!query.data &&
    !filtered.error &&
    (filtered.rows.length !== selection.expected || query.data.total !== query.data.rows.length);
  useEffect(() => {
    if (mismatch)
      console.warn("VSL: discrepancia de detalle", {
        month: selection.month,
        status: selection.status,
        column: selection.column,
        expected: selection.expected,
        filtered: filtered.rows.length,
        received: query.data?.rows.length,
        total: query.data?.total,
      });
  }, [mismatch, selection, filtered.rows.length, query.data]);
  const pageSize = 25,
    pages = Math.max(1, Math.ceil(searched.length / pageSize));
  const error = query.isError ? query.error.message : filtered.error;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[90dvh] w-[96vw] max-w-[96vw] flex-col overflow-hidden p-4 sm:p-6"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          trigger?.focus();
        }}
      >
        <DialogTitle className="pr-8">
          DETALLE DE ENCUESTAS — {formatSurveyMonth(selection.month)} {selection.month.slice(0, 4)}
        </DialogTitle>
        <DialogDescription>
          {selection.status} · {selection.label}
        </DialogDescription>
        {query.isPending && <p role="status">Cargando personas del mes y estado seleccionados…</p>}
        {error && (
          <div role="alert" className="space-y-2 text-destructive">
            <p>{error}</p>
            <button
              className="rounded-lg border px-3 py-2"
              disabled={query.isFetching}
              onClick={() => void query.refetch({ cancelRefetch: false })}
            >
              Reintentar
            </button>
          </div>
        )}
        {query.data && !error && (
          <>
            <p role="status">{filtered.rows.length} registros encontrados</p>
            {mismatch && (
              <p role="alert" className="rounded-lg border border-amber-500 p-3 text-sm">
                La cantidad del detalle no coincide con el resumen. Verificar sincronización o
                clasificación. Resumen: {selection.expected}; detalle filtrado:{" "}
                {filtered.rows.length}; total informado por la API: {query.data.total}.
              </p>
            )}
            <input
              autoFocus
              aria-label="Buscar por nombre, WhatsApp o correo"
              placeholder="Buscar por nombre, WhatsApp o correo"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <p className="text-sm text-muted-foreground">
              {searched.length} registros visibles con la búsqueda
            </p>
            <div className="min-h-0 overflow-auto rounded-lg border">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-background">
                  <tr>
                    {detailVisibleIndices.map((i) => (
                      <th key={i} className="min-w-40 border border-border p-2 text-left">
                        {query.data.columns[i]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {searched.slice(page * pageSize, (page + 1) * pageSize).map((row, index) => (
                    <tr key={index}>
                      {detailVisibleIndices.map((i) => (
                        <td key={i} className="border border-border p-2">
                          {row[i] === null || row[i] === "" ? "—" : String(row[i])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {searched.length === 0 && <p className="p-4">No se encontraron registros.</p>}
            </div>
            <div className="flex items-center justify-end gap-3 text-sm">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className="rounded border px-3 py-1 disabled:opacity-50"
              >
                Anterior
              </button>
              <span>
                Página {page + 1} de {pages}
              </span>
              <button
                disabled={page + 1 >= pages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border px-3 py-1 disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
