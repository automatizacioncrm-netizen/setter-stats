import type { Pipeline } from "@/types/reports";

type Summary = Record<string, unknown> | undefined;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function count(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function percentage(part: number | null, whole: number | null): number | null {
  if (part == null || whole == null) return null;
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

export function getPipelineCardMetrics(summary: Summary, pipeline: Pipeline) {
  const pipelines =
    pipeline === "all"
      ? (["vsl", "oei", ...(summary?.["lig"] ? ["lig" as const] : [])] as const)
      : [pipeline];
  const sections = pipelines.map((key) => record(summary?.[key]));
  const sum = (read: (section: Record<string, unknown>) => unknown): number | null => {
    let total = 0;
    for (const section of sections) {
      if (!section) return null;
      const value = count(read(section));
      if (value == null) return null;
      total += value;
    }
    return total;
  };

  const totalLeads = sum((section) => section["totalLeads"]);
  const totalAppointments = sum((section) => section["conCitaCalendar"]);
  const attended = sum((section) => record(section["estados"])?.["asistio"]);

  return {
    totalLeads,
    totalAppointments,
    attended,
    bookingRate: percentage(totalAppointments, totalLeads),
    attendanceRate: percentage(attended, totalAppointments),
  };
}
