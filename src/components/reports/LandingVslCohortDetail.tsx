import { useState } from "react";
import type { LandingVslDay, LandingVslLead, VslClosersReport } from "@/types/reports";
import { formatNumber } from "@/lib/executive-metrics";
import { formatSaleQuotaDate } from "@/lib/sales-detail";
import { ExecutiveTable } from "./ExecutiveTable";

const dateLabel = (date: string) => (date ? formatSaleQuotaDate(date) : "Sin fecha");
const values = (lead: LandingVslLead, field: "agendador" | "fechaReunion" | "estadoAgenda") =>
  [
    ...new Set(
      lead.citas
        .map((a) =>
          field === "fechaReunion"
            ? dateLabel(a[field])
            : field === "estadoAgenda"
              ? a[field] || "Sin resultado"
              : a[field],
        )
        .filter(Boolean),
    ),
  ].join(" · ") || "—";

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

function DayLeads({ day }: { day: LandingVslDay }) {
  const [page, setPage] = useState(1);
  if (!day.leads)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        La API entrega el resumen de este día, pero no sus registros individuales.
      </p>
    );
  const pages = Math.max(1, Math.ceil(day.leads.length / 25));
  return (
    <div
      className="space-y-3"
      role="region"
      aria-label={`Leads creados el ${dateLabel(day.fecha)}`}
    >
      <h3 className="text-sm font-medium">
        Leads creados el {dateLabel(day.fecha)} · {day.totalLeads}
      </h3>
      <ExecutiveTable
        rows={day.leads.slice((page - 1) * 25, page * 25)}
        rowKey={(r) => r.opportunityId}
        minWidth="min-w-[1400px]"
        empty="No hay leads creados este día."
        columns={[
          { key: "name", label: "Nombre del contacto", value: (r) => r.nombreContacto },
          { key: "id", label: "Opportunity ID", value: (r) => r.opportunityId },
          {
            key: "created",
            label: "Fecha de creación de la oportunidad",
            value: (r) => r.fechaCreacion,
            render: (r) => dateLabel(r.fechaCreacion),
          },
          { key: "setter", label: "Setter asignado", value: (r) => r.setter || "Sin identificar" },
          { key: "booker", label: "Agendador de la cita", value: (r) => values(r, "agendador") },
          {
            key: "closer",
            label: "Closer asignado",
            value: (r) => r.closerAsignado || "Sin identificar",
          },
          { key: "meeting", label: "Fecha de reunión", value: (r) => values(r, "fechaReunion") },
          {
            key: "calendar",
            label: "Estado de Calendar",
            value: (r) => values(r, "estadoAgenda"),
            render: (r) =>
              r.citas.length ? (
                <details>
                  <summary className="cursor-pointer">
                    {values(r, "estadoAgenda")} · Ver {r.citas.length} cita(s)
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {r.citas.map((a) => (
                      <li
                        key={a.appointmentId}
                        className="rounded border border-border p-2 text-xs"
                      >
                        <p>Appointment ID: {a.appointmentId}</p>
                        <p>
                          {dateLabel(a.fechaReunion)} · {a.estadoAgenda || "Sin resultado"} (
                          {a.estadoCalendar || "Sin estado de Calendar"})
                        </p>
                        <p>Agendador: {a.agendador || "Sin identificar"}</p>
                        <p>Closer: {a.closer || "Sin identificar"}</p>
                        <p>Calendario: {a.calendario}</p>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : (
                "Pendiente de agenda"
              ),
          },
          { key: "outcome", label: "Resultado de asistencia", value: (r) => r.resultadoAsistencia },
          { key: "pipeline", label: "Embudo", value: () => "VSL | Closers" },
        ]}
      />
      <Pagination page={page} pages={pages} onChange={setPage} />
    </div>
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
  return (
    <div className="space-y-3">
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
        minWidth="min-w-[950px]"
        columns={[
          {
            key: "date",
            label: "Fecha de creación",
            value: (r) => r.fecha,
            render: (r) => dateLabel(r.fecha),
          },
          { key: "total", label: "Total de leads creados", value: (r) => r.totalLeads },
          { key: "attended", label: "Leads asistidos", value: (r) => r.leadsAsistidos },
          { key: "missed", label: "Leads no asistidos", value: (r) => r.leadsNoAsistidos },
          {
            key: "pending",
            label: "Leads pendientes de resultado",
            value: (r) => r.leadsPendientesResultado,
          },
          {
            key: "rate",
            label: "Porcentaje de asistencia",
            value: (r) => r.porcentajeAsistencia,
            render: (r) => `${formatNumber(r.porcentajeAsistencia)} %`,
          },
          {
            key: "detail",
            label: "Acción",
            value: (r) => r.fecha,
            render: (r) => (
              <button
                type="button"
                className="font-medium text-brand hover:underline"
                aria-expanded={selected === r.fecha}
                aria-label={`Ver detalle del ${dateLabel(r.fecha)}`}
                onClick={() => setSelected(selected === r.fecha ? null : r.fecha)}
              >
                {selected === r.fecha ? "Ocultar detalle" : "Ver detalle"}
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
      {day && <DayLeads key={day.fecha} day={day} />}
    </div>
  );
}
