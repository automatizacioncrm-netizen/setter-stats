import { z } from "zod";
export const surveyDetailColumns = [
  "PERIODO / MES",
  "ESTADO DE AGENDA",
  "NOMBRE",
  "WHATSAPP",
  "CORREO",
  "FECHA DE REUNIÓN",
  "FECHA DE RESPUESTA",
  "_Appointment ID",
  "_Contact ID",
  "_Opportunity ID",
  "_Submission ID",
  "¿Es empresario?",
  "Ingreso promedio 3 meses",
  "Cuello de botella",
  "Disposición a invertir USD 3,000",
  "Confirmación de contacto",
];
export const surveyDetailSchema = z.object({
  success: z.literal(true),
  columns: z.array(z.string()).length(16),
  rows: z.array(z.array(z.union([z.string(), z.number().finite(), z.null()])).length(16)),
  total: z.number().int().nonnegative(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  status: z.enum(["CONFIRMADO", "ASISTIÓ", "CANCELADO", "NO ASISTIÓ", "OTRO"]),
});
export type SurveyDetail = z.infer<typeof surveyDetailSchema>;
export type SurveySelection = {
  month: string;
  status: string;
  column: number;
  label: string;
  expected: number;
};
export const detailCountColumns = [2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 18];
export function isDetailCount(value: unknown, column: number): value is number {
  return (
    detailCountColumns.includes(column) &&
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}
function normalized(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
export function filterSurveyDetail(
  rows: SurveyDetail["rows"],
  column: number,
): SurveyDetail["rows"] {
  if (column === 14) return rows;
  if (column === 2) return rows.filter((row) => /^si\b/.test(normalized(row[11])));
  if (column === 3) return rows.filter((row) => /^no\b/.test(normalized(row[11])));
  // The deployed Apps Script classifier source is required: never invent ranges or thresholds.
  throw new Error(
    "No se puede auditar esta condición todavía: faltan las funciones originales VSL20_income_(), VSL20_invest_(), VSL20_yes_() y VSL20_no_() del Apps Script para reproducir su clasificación exacta.",
  );
}
export function searchSurveyDetail(rows: SurveyDetail["rows"], search: string) {
  const query = normalized(search);
  return query
    ? rows.filter((row) => [2, 3, 4].some((i) => normalized(row[i]).includes(query)))
    : rows;
}
export const detailVisibleIndices = [2, 3, 4, 5, 6, 1, 11, 12, 13, 14, 15];
