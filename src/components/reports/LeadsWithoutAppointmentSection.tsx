import type { VslClosersReport } from "@/types/reports";
import { hasSelectedSetter } from "@/lib/executive-presentation";
import { formatNumber } from "@/lib/executive-metrics";
import { formatSaleQuotaDate } from "@/lib/sales-detail";
import { KpiCard } from "./KpiCard";
import { ExecutiveTable } from "./ExecutiveTable";
export function LeadsWithoutAppointmentSection({
  report,
  setterSelected = hasSelectedSetter(report.filters),
}: {
  report: VslClosersReport;
  setterSelected?: boolean;
}) {
  if (setterSelected || report.filters.pipeline === "lig") return null;
  const pipeline = report.filters.pipeline === "oei" ? "oei" : "vsl";
  const data =
    pipeline === "vsl"
      ? (report.leadsSinCitaPorEmbudo?.vsl ?? report.leadsVslSinCita)
      : report.leadsSinCitaPorEmbudo?.oei;
  const error = report.leadsSinCitaErrors?.[pipeline];
  const percent = (value: number | null | undefined) =>
    value == null ? "No disponible" : `${formatNumber(value)} %`;
  return (
    <section
      className="space-y-3 rounded-xl border border-border bg-surface p-5 shadow-card"
      aria-labelledby="unbooked-heading"
    >
      <h2 id="unbooked-heading" className="text-lg font-semibold">
        {pipeline === "vsl"
          ? "4. Conversión de Landing VSL Ads (Automático)"
          : "4. Leads OEI sin cita creada"}
      </h2>
      <p className="text-sm text-muted-foreground">
        Oportunidades únicas creadas en el período seleccionado, vinculadas con sus citas históricas
        de cualquier fecha.
      </p>
      {error || !data ? (
        <p role="status" className="text-sm text-muted-foreground">
          {error || "La API no entrega este indicador para el embudo seleccionado."}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pipeline === "vsl" ? (
              <>
                <KpiCard label="Total de leads" value={data.totalLeads} />
                <KpiCard
                  label="Leads agendados (Automático)"
                  value={data.leadsConCita}
                  hint={
                    data.porcentajeConCita == null
                      ? "No disponible"
                      : `${percent(data.porcentajeConCita)} de los leads`
                  }
                />
                <KpiCard
                  label="Leads pendientes de agenda"
                  value={data.leadsSinCita}
                  hint={
                    data.porcentajeSinCita == null
                      ? "No disponible"
                      : `${percent(data.porcentajeSinCita)} de los leads`
                  }
                />
              </>
            ) : (
              <>
                <KpiCard label="Total de leads únicos" value={data.totalLeads} />
                <KpiCard label="Leads con cita" value={data.leadsConCita} />
                <KpiCard label="Leads sin cita" value={data.leadsSinCita} />
                <KpiCard label="% Sin agendamiento" value={percent(data.porcentajeSinCita)} />
                <KpiCard label="% Con agendamiento" value={percent(data.porcentajeConCita)} />
              </>
            )}
          </div>
          {data.detalleSinCita && (
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                {pipeline === "vsl"
                  ? "Detalle de leads pendientes de agenda"
                  : "Detalle de leads sin cita"}{" "}
                ({data.detalleSinCita.length} de {data.leadsSinCita})
              </summary>
              <div className="mt-3">
                <ExecutiveTable
                  rows={data.detalleSinCita}
                  rowKey={(r) => r.opportunityId}
                  empty="No hay oportunidades sin cita para estos filtros."
                  columns={[
                    { key: "name", label: "Contacto", value: (r) => r.nombreContacto },
                    { key: "id", label: "Opportunity ID", value: (r) => r.opportunityId },
                    {
                      key: "created",
                      label: "Fecha de creación",
                      value: (r) => r.fechaCreacion,
                      render: (r) => formatSaleQuotaDate(r.fechaCreacion),
                    },
                    {
                      key: "setter",
                      label: "Setter",
                      value: (r) => r.setter,
                      render: (r) => r.setter || "Sin identificar",
                    },
                    { key: "pipeline", label: "Embudo", value: (r) => r.pipeline.toUpperCase() },
                  ]}
                />
              </div>
            </details>
          )}
        </>
      )}
    </section>
  );
}
