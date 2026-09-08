import { z } from "zod";
import type { VslClosersReport } from "../../types/reports";
import { ApiError } from "../config/env.server";

const str = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => (v == null ? "" : String(v).replace(/\s+/g, " ").trim()));
const num = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => (v == null || v === "" ? 0 : Number(v)))
  .pipe(z.number().finite().nonnegative());
const counts = {
  agendadoCRM: num,
  asistio: num,
  cancelado: num,
  noShow: num,
  pendienteAgenda: num,
  reagendado: num,
  total: num,
};
const list = z
  .array(str)
  .nullish()
  .transform((v) => v ?? []);
const lead = z.object({
  nombreContacto: str,
  telefono: str,
  correo: str,
  setterAsignado: str,
  closerAsignado: str,
  vslOrigen: str,
  estadoAgenda: str,
  fechaReunion: str,
  fase: str,
  fuente: str,
});
export const vslResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    report: z.literal("VSL | CLOSERS"),
    updatedAt: str,
    filters: z
      .object({
        available: z
          .object({ setters: list, statuses: list, vslOrigins: list, closers: list })
          .default({}),
      })
      .default({}),
    kpis: z.object({ ...counts, tasaAsistencia: num, tasaNoShow: num }).default({}),
    setters: z.array(z.object({ setter: str, ...counts })).default([]),
    detail: z
      .object({
        rows: z.array(lead).default([]),
        pagination: z
          .object({ page: num, pageSize: num, totalRecords: num, totalPages: num })
          .default({}),
      })
      .default({}),
    unknownStatusCount: num,
  }),
});
export type AppsScriptReportResponse = z.infer<typeof vslResponseSchema>;

export function mapVslReportResponse(
  raw: unknown,
  query: {
    dateFrom: string;
    dateTo: string;
    setter: string;
    status: string;
    closer: string;
    vslOrigin: string;
    includeDetail: boolean;
    pageSize: number;
    sort: keyof z.infer<typeof lead>;
    direction: "asc" | "desc";
  },
): VslClosersReport {
  const parsed = vslResponseSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError("Apps Script devolvió un reporte con formato inválido.");
  const d = parsed.data.data;
  // Only the received page is sorted: Apps Script has not specified global sort support.
  const rows = d.detail.rows
    .slice(0, query.pageSize)
    .sort(
      (a, b) =>
        a[query.sort].localeCompare(b[query.sort], "es", { numeric: true }) *
        (query.direction === "asc" ? 1 : -1),
    );
  return {
    report: d.report,
    updatedAt: d.updatedAt,
    source: "sheet",
    filters: {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      setter: query.setter,
      estadoAgenda: query.status,
      closer: query.closer,
      vslOrigen: query.vslOrigin,
    },
    kpis: {
      ...d.kpis,
      tasaAsistencia: d.kpis.total ? +((d.kpis.asistio / d.kpis.total) * 100).toFixed(2) : 0,
      tasaNoShow: d.kpis.total ? +((d.kpis.noShow / d.kpis.total) * 100).toFixed(2) : 0,
    },
    setters: d.setters,
    availableSetters: d.filters.available.setters,
    availableClosers: d.filters.available.closers,
    availableOrigins: d.filters.available.vslOrigins,
    unknownStatusCount: d.unknownStatusCount,
    detail: query.includeDetail ? rows : [],
    detailTotal: d.detail.pagination.totalRecords,
    detailPage: d.detail.pagination.page || 1,
  };
}
