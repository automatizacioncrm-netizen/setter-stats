import { useRef, useState } from "react";
import type { VslClosersReport } from "@/types/reports";
import { formatSaleQuotaDate } from "@/lib/sales-detail";
import { ExecutiveTable } from "./ExecutiveTable";
import { LandingVslDayModal } from "./LandingVslDayModal";
import { attendancePercentage } from "@/lib/attendance-percentage";

const dateLabel = (date: string) => (date ? formatSaleQuotaDate(date) : "Sin fecha");
function Pagination({
  page,
  pages,
  onChange,
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <nav
      aria-label="Paginación del detalle Landing VSL"
      className="flex items-center justify-end gap-3 text-xs"
    >
      <button
        type="button"
        className="rounded border border-border px-3 py-2 disabled:opacity-40"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
      >
        Anterior
      </button>
      <span>
        Página {page} de {pages}
      </span>
      <button
        type="button"
        className="rounded border border-border px-3 py-2 disabled:opacity-40"
        disabled={page === pages}
        onClick={() => onChange(page + 1)}
      >
        Siguiente
      </button>
    </nav>
  );
}

export function LandingVslCohortDetail({ report }: { report: VslClosersReport }) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-sm font-medium">Detalle de leads Landing VSL</summary>
      {open && (
        <div className="mt-3">
          <CohortDays report={report} />
        </div>
      )}
    </details>
  );
}

function CohortDays({ report }: { report: VslClosersReport }) {
  const [page, setPage] = useState(1);
  const [ascending, setAscending] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const detailTrigger = useRef<HTMLButtonElement | null>(null);
  const data = report.cohorteDiariaVsl;
  if (report.cohorteDiariaVslError || !data)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {report.cohorteDiariaVslError || "La API no entrega la cohorte diaria de Landing VSL."}
      </p>
    );
  const days = [...data.porDia].sort(
    (a, b) => a.fecha.localeCompare(b.fecha) * (ascending ? 1 : -1),
  );
  const pages = Math.max(1, Math.ceil(days.length / 31));
  const day = data.porDia.find((item) => item.fecha === selected);
  const total = data.total;
  const totalFields = [
    "oportunidades",
    "oportunidadesConCita",
    "confirmados",
    "cancelados",
    "asistidos",
    "noAsistidos",
  ] as const;
  const missingTotals = totalFields.filter((field) => total?.[field] === undefined);
  const totalError = !total
    ? "La API no entrega cohorteDiariaVsl.total para este período."
    : missingTotals.length
      ? `Faltan acumulados en cohorteDiariaVsl.total: ${missingTotals.join(", ")}.`
      : null;
  const missingFields = (["oportunidadesConCita", "confirmados", "cancelados"] as const).filter(
    (field) => days.some((row) => row[field] === undefined),
  );
  return (
    <div className="space-y-3">
      {missingFields.length > 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          La API no entrega {missingFields.join(", ")} para todos los días. Esas celdas se muestran
          como «No disponible».
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          {data.totalLeads} leads · {days.length} días con oportunidades creadas
        </span>
        <button
          type="button"
          className="rounded border border-border px-3 py-2 text-xs"
          onClick={() => {
            setAscending(!ascending);
            setPage(1);
          }}
        >
          Fecha: {ascending ? "más antigua primero" : "más reciente primero"}
        </button>
      </div>
      <ExecutiveTable
        rows={days.slice((page - 1) * 31, page * 31)}
        rowKey={(r) => r.fecha}
        empty="No hay leads Landing VSL creados en el período seleccionado."
        minWidth="min-w-[1250px]"
        footer={
          <tr className="border-t-2 border-border bg-brand-soft font-semibold">
            {totalError ? (
              <td colSpan={9} className="px-4 py-3 text-destructive" role="alert">
                {totalError}
              </td>
            ) : (
              <>
                <th scope="row" className="px-4 py-3 text-left">
                  TOTAL GENERAL
                </th>
                {totalFields.map((field) => (
                  <td key={field} className="px-4 py-3 tabular-nums">
                    {total?.[field]}
                  </td>
                ))}
                <td className="px-4 py-3 tabular-nums">
                  {total
                    ? attendancePercentage(
                        total.porcentajeAsistencia,
                        total.asistidos,
                        total.oportunidadesConCita,
                      )?.toFixed(2)
                    : "No disponible"}{" "}
                  %
                </td>
                <td />
              </>
            )}
          </tr>
        }
        columns={[
          {
            key: "date",
            label: "Fecha de creación",
            value: (r) => r.fecha,
            render: (r) => dateLabel(r.fecha),
          },
          { key: "total", label: "Total de leads creados", value: (r) => r.totalLeads },
          {
            key: "booked",
            label: "Total agendados",
            value: (r) => r.oportunidadesConCita ?? null,
            render: (r) => r.oportunidadesConCita ?? "No disponible",
          },
          {
            key: "confirmed",
            label: "Leads confirmados",
            value: (r) => r.confirmados ?? null,
            render: (r) => r.confirmados ?? "No disponible",
          },
          {
            key: "cancelled",
            label: "Leads cancelados",
            value: (r) => r.cancelados ?? null,
            render: (r) => r.cancelados ?? "No disponible",
          },
          { key: "attended", label: "Leads asistidos", value: (r) => r.leadsAsistidos },
          { key: "missed", label: "Leads no asistidos", value: (r) => r.leadsNoAsistidos },
          {
            key: "rate",
            label: "Porcentaje de asistencia",
            value: (r) => r.porcentajeAsistencia,
            render: (r) =>
              r.porcentajeAsistencia == null
                ? "No disponible"
                : `${r.porcentajeAsistencia.toFixed(2)} %`,
          },
          {
            key: "detail",
            label: "Acción",
            value: (r) => r.fecha,
            render: (r) => (
              <button
                type="button"
                className="font-medium text-brand hover:underline"
                aria-haspopup="dialog"
                aria-label={`Ver detalle del ${dateLabel(r.fecha)}`}
                onClick={(event) => {
                  detailTrigger.current = event?.currentTarget ?? null;
                  setSelected(r.fecha);
                }}
              >
                Ver detalle
              </button>
            ),
          },
        ]}
      />
      <Pagination
        page={page}
        pages={pages}
        onChange={(next) => {
          setPage(next);
          setSelected(null);
        }}
      />
      {day && (
        <LandingVslDayModal
          key={day.fecha}
          day={day}
          onClose={() => setSelected(null)}
          onRestoreFocus={() => detailTrigger.current?.focus()}
        />
      )}
    </div>
  );
}
