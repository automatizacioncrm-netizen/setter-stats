import type { VslClosersReport } from "@/types/reports";
import type { ReactNode } from "react";
import { ratio, formatNumber } from "@/lib/executive-metrics";
import { LeadsWithoutAppointmentSection } from "./LeadsWithoutAppointmentSection";
import { ExecutiveTable } from "./ExecutiveTable";
import { joinCloserPerformance } from "@/lib/closer-performance";

import {
  REPORT_SETTERS,
  REPORT_CLOSER_TEAM,
  teamPerformanceRows,
  normalizePersonKey,
} from "@/lib/report-team";

const panel = "space-y-3 rounded-xl border border-border bg-surface p-5 shadow-card";
const percent = (value: number | null) =>
  value == null ? "No aplicable" : formatNumber(value) + " %";

export function ExecutivePerformance({
  report,
  setterDetails,
  onCalendarToggle,
  setterSelected,
}: {
  report: VslClosersReport;
  setterDetails?: ReactNode;
  onCalendarToggle?: (open: boolean) => void;
  setterSelected?: boolean;
  selectedSetter?: string;
}) {
  const p = report.performance;
  const conversion = teamPerformanceRows(
    p?.conversionPorCloser ?? [],
    REPORT_CLOSER_TEAM,
    (r) => r.closer,
    (r) => r.ventas,
  ).map((r) => ({ ...r, closer: r.name, ventas: r.count }));
  const allSetters = teamPerformanceRows(
    p?.asistenciaPorSetter ?? [],
    REPORT_SETTERS,
    (r) => r.setter,
    (r) => Number(r.agendamientos),
  ).map((r) => ({ ...r, setter: r.name, agendamientos: r.count }));
  const setters = allSetters.filter((r) => Number(r.agendamientos) > 0);
  const closers = teamPerformanceRows(
    p?.asistenciaPorCloserTodosEmbudos ?? [],
    REPORT_CLOSER_TEAM,
    (r) => r.closer,
    (r) => r.agendamientos,
  ).map((r) => ({ ...r, closer: r.name, agendamientos: r.count }));
  const attendanceNames = new Set(
    p?.asistenciaPorCloserTodosEmbudos.map((r) => normalizePersonKey(r.closer)),
  );
  const conversionNames = new Set(p?.conversionPorCloser.map((r) => normalizePersonKey(r.closer)));
  const closerPerformance = joinCloserPerformance(
    closers.filter((r) => attendanceNames.has(normalizePersonKey(r.closer))),
    conversion.filter((r) => conversionNames.has(normalizePersonKey(r.closer))),
  );
  const excludedSales =
    (p?.conversionPorCloser.reduce((sum, r) => sum + r.ventas, 0) ?? 0) -
    conversion.reduce((sum, r) => sum + r.ventas, 0);
  const excludedActivity =
    (p?.asistenciaPorSetter.reduce((sum, r) => sum + r.agendamientos, 0) ?? 0) -
    allSetters.reduce((sum, r) => sum + r.agendamientos, 0);
  const all = report.filters.pipeline === "all";
  const conversionScope = all ? "vsl+oei+lig" : report.filters.pipeline;
  const attendanceScope = all ? "vsl+oei+lig" : report.filters.pipeline;
  const scopeValid =
    p?.alcanceConversionCloser === conversionScope && p?.alcanceAsistencia === attendanceScope;
  const error =
    report.performanceError ||
    (!p
      ? "Indicadores de desempeño no disponibles."
      : !scopeValid
        ? "El alcance recibido no corresponde a los filtros seleccionados."
        : null);
  const diagnostics = p?.diagnostics;
  const pending =
    typeof diagnostics?.ventasSinCitaAsistida === "number"
      ? diagnostics.ventasSinCitaAsistida
      : null;
  const ambiguous =
    typeof diagnostics?.ventasAtribucionAmbigua === "number"
      ? diagnostics.ventasAtribucionAmbigua
      : null;
  const activityLabel = all
    ? "Vista general: incluye citas de VSL, OEI y LIG"
    : "Actividad del embudo seleccionado";
  return (
    <>
      <section className={panel} aria-labelledby="setter-attendance-heading">
        <h2 id="setter-attendance-heading" className="text-lg font-semibold">
          Conversion de Asistencia por Setter
        </h2>
        <p className="text-sm text-muted-foreground">{activityLabel}</p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : (
          <ExecutiveTable
            rows={setters}
            rowKey={(r) => r.setter}
            empty="No hay agendamientos para estos filtros."
            columns={[
              {
                key: "setter",
                label: "Setter",
                value: (r) => r.setter,
                render: (r) => r.setter,
              },
              { key: "total", label: "Agendamientos", value: (r) => r.agendamientos },
              { key: "attended", label: "Citas asistidas", value: (r) => r.citasAsistidas },
              {
                key: "rate",
                label: "% Asistencia",
                value: (r) => ratio(r.citasAsistidas, r.agendamientos),
                render: (r) => percent(ratio(r.citasAsistidas, r.agendamientos)),
                formula:
                  "Citas asistidas / agendamientos únicos × 100. VSL: setter asignado, con creador de cita como respaldo. OEI/LIG: creador de cita, con setter asignado como respaldo. Sin agendamientos: no aplicable.",
              },
            ]}
          />
        )}
        {setterDetails && (
          <details
            className="border-t border-border pt-3"
            onToggle={(event) => onCalendarToggle?.(event.currentTarget.open)}
          >
            <summary className="cursor-pointer text-sm font-medium">
              Estados de Calendar y detalle de citas
            </summary>
            <div className="mt-3 space-y-4">{setterDetails}</div>
          </details>
        )}
      </section>
      <section className={panel} aria-labelledby="closer-performance-heading">
        <h2 id="closer-performance-heading" className="text-lg font-semibold">
          Conversion de Asistencia y Venta por Closer
        </h2>
        <p className="text-sm text-muted-foreground">
          Agendamientos, asistencia y conversión de ventas del embudo seleccionado
        </p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : (
          <ExecutiveTable
            rows={closerPerformance}
            rowKey={(r) => r.key}
            empty="No hay actividad comercial para estos filtros."
            columns={[
              {
                key: "closer",
                label: "Closer",
                value: (r) => r.closer,
                render: (r) => r.closer,
              },
              { key: "total", label: "Citas asignadas", value: (r) => r.agendamientos },
              { key: "attended", label: "Citas asistidas", value: (r) => r.citasAsistidas },
              {
                key: "attendanceRate",
                label: "% Asistencia",
                value: (r) => r.asistenciaPct,
                render: (r) => percent(r.asistenciaPct),
                formula:
                  "Citas asistidas / citas asignadas × 100. Atribución por closer de la cita; esta tasa mide asistencia, no conversión de ventas.",
              },
              { key: "sales", label: "Ventas verificadas", value: (r) => r.ventas },
              {
                key: "rate",
                label: "% Conversión",
                value: (r) => r.conversionPct,
                render: (r) => percent(r.conversionPct),
                formula:
                  "Ventas atribuibles / citas asistidas × 100. Oportunidades y citas únicas, sin LIG. Relación de eventos del período, no conversión de cohorte.",
              },
            ]}
          />
        )}
        {!error && pending != null && ambiguous != null && (
          <p className="text-sm text-muted-foreground">
            {pending + ambiguous} ventas sin atribución verificable, conservadas en el total
            comercial.
          </p>
        )}
        {diagnostics && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Diagnóstico de atribución y alcance</summary>
            <p className="mt-2">
              Ventas de otros responsables: {excludedSales}. Citas fuera del equipo de setters:{" "}
              {excludedActivity}. Sin cita asistida: {pending ?? "No disponible"}. Atribución
              ambigua: {ambiguous ?? "No disponible"}.
            </p>
            <p>
              {typeof diagnostics.criterio === "string"
                ? diagnostics.criterio
                : "Criterio no informado."}
            </p>
            <p>
              Conversión: {p?.alcanceConversionCloser}. Actividad: {p?.alcanceAsistencia}.
            </p>
            {report.dateSemantics && (
              <p>
                Citas: {report.dateSemantics.appointments}. Ventas: {report.dateSemantics.sales}.
              </p>
            )}
          </details>
        )}
      </section>
      <LeadsWithoutAppointmentSection
        report={report}
        {...(setterSelected !== undefined ? { setterSelected } : {})}
      />
    </>
  );
}
