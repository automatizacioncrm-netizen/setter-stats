import { formatSurveyMonth, normalizeSurveyMonth } from "./survey-month";
import { z } from "zod";
export const qualityColumns = [
  "EMBUDO VSL/CLOSER",
  "LEADS CAPTADOS",
  "AGENDADOS AUTOMÁTICO",
  "% AGENDADOS AUTOMÁTICO",
  "SIN AGENDAMIENTO AUTOMÁTICO",
  "% SIN AGENDAMIENTO AUTOMÁTICO",
  "TOTAL DE AGENDAMIENTOS",
  "ASISTENCIA A CITAS",
  "% ASISTENCIA A CITAS",
  "LEADS NO CALIFICADOS",
  "% LEADS NO CALIFICADOS",
  "TOTAL DE SETEOS",
  "NO ASISTIERON",
  "CITAS CON MATCH",
  "CITAS SIN MATCH",
];
export const surveyColumns = [
  "PERIODO / MES",
  "Leads que completaron la encuesta",
  "% de leads que facturan USD 5,000 o más",
  "% de leads con disposición de inversión de al menos USD 3,000",
  "% leads calificados por encuesta (dispuestos y facturan 5k+ / facturan 5k+)",
];
export const agendaStates = ["CONFIRMADO", "ASISTIÓ", "CANCELADO", "NO ASISTIÓ", "OTRO"];
export const qualityPercentIndices = [3, 5, 8, 10];
export const surveyPercentIndices = [2, 3, 4];
const cell = z.union([z.string(), z.number().finite(), z.null()]);
function table(width: number, textIndices: number[], safeMissing = false) {
  return z.object({
    columns: z
      .array(z.string())
      .length(
        width,
        safeMissing
          ? "La Tabla 2 requiere cinco columnas mensuales. El despliegue de la API sigue usando un contrato diferente (por ejemplo, las 19 columnas antiguas por estado)."
          : undefined,
      ),
    rows: z
      .array(
        z.array(
          safeMissing
            ? z.preprocess(
                (value) =>
                  value === undefined || (typeof value === "number" && !Number.isFinite(value))
                    ? null
                    : value,
                cell,
              )
            : cell,
        ),
      )
      .superRefine((rows, ctx) => {
        rows.forEach((row, i) => {
          if (row.length !== width)
            ctx.addIssue({
              code: "custom",
              path: [i],
              message: `Fila ${i + 1}: se esperaban ${width} columnas y se recibieron ${row.length}.`,
            });
        });
      })
      .transform((rows) =>
        rows.map((row) =>
          row.map((value, index) => {
            if (textIndices.includes(index) || typeof value !== "string" || value.trim() === "")
              return value;
            // Convert only unambiguous numbers; retain text, blanks and unsafe integers.
            if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) {
              const number = Number(value);
              if (
                Number.isFinite(number) &&
                (!Number.isInteger(number) || Number.isSafeInteger(number))
              )
                return number;
            }
            return value;
          }),
        ),
      ),
    sourceSheet: z.string().optional(),
    truncated: z.boolean().optional(),
  });
}
function normalizedHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}
export const monthlySurveySchema = table(5, [0], true).superRefine((data, ctx) => {
  if (
    data.columns.some(
      (header, index) => normalizedHeader(header) !== normalizedHeader(surveyColumns[index] ?? ""),
    )
  )
    ctx.addIssue({
      code: "custom",
      path: ["columns"],
      message:
        "La Tabla 2 requiere los cinco indicadores mensuales nuevos, en su orden definido. Actualiza el despliegue si aún devuelve las 19 columnas por estado.",
    });
  data.rows.forEach((row, index) => {
    for (const column of surveyPercentIndices) {
      const value = row[column];
      if (typeof value === "number" && (value < 0 || value > 1))
        ctx.addIssue({
          code: "custom",
          path: ["rows", index, column],
          message:
            "El porcentaje debe ser una proporción entre 0 y 1; no se recalcula ni convierte desde puntos porcentuales.",
        });
    }
  });
  const months = new Set<string>();
  data.rows.forEach((row, index) => {
    if (typeof row[0] !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(normalizeSurveyMonth(row[0])))
      ctx.addIssue({
        code: "custom",
        path: ["rows", index, 0],
        message: "El periodo mensual debe ser YYYY-MM.",
      });
    const key = normalizeSurveyMonth(row[0]);
    if (key && months.has(key))
      ctx.addIssue({
        code: "custom",
        path: ["rows", index],
        message:
          "Mes duplicado en la Tabla 2: se requiere una sola fila por mes; no se agregan filas antiguas.",
      });
    if (key) months.add(key);
  });
});
export const surveyAgendaStates = ["CONFIRMADO", "ASISTIÓ", "CANCELADO", "NO ASISTIÓ"] as const;
export const surveyStatusSchema = table(14, [0, 1, 9]).superRefine((data, ctx) => {
  const seen = new Set<string>();
  data.rows.forEach((row, index) => {
    if (typeof row[0] !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(normalizeSurveyMonth(row[0])))
      ctx.addIssue({
        code: "custom",
        path: ["rows", index, 0],
        message: "El periodo debe ser YYYY-MM.",
      });
    if (!surveyAgendaStates.some((state) => state === row[1]))
      ctx.addIssue({
        code: "custom",
        path: ["rows", index, 1],
        message: "Estado incompatible: se requieren los cuatro estados de agenda definidos.",
      });
    const key = normalizeSurveyMonth(row[0]) + "/" + String(row[1]);
    if (seen.has(key))
      ctx.addIssue({
        code: "custom",
        path: ["rows", index],
        message: "Mes y estado duplicados; no se suman ni descartan filas.",
      });
    seen.add(key);
  });
});
export const qualityReportSchema = z.object({
  success: z.literal(true),
  generatedAt: z.string().datetime({ offset: true }),
  timeZone: z.literal("America/Lima"),
  quality: table(15, [0]),
  surveys: monthlySurveySchema,
  surveyStatus: surveyStatusSchema,
  diagnostics: z
    .object({
      available: z.boolean().optional(),
      details: z.record(z.unknown()).optional(),
      warnings: z.array(z.string()).optional(),
    })
    .optional(),
  queriedAt: z.string().datetime({ offset: true }).optional(),
});
export type QualityReport = z.infer<typeof qualityReportSchema>;
export function displayMonth(value: string): string {
  return formatSurveyMonth(value);
}
export function displayReportCell(
  value: string | number | null,
  index: number,
  survey: boolean,
): string {
  if (value === null || value === "") return "—";
  if (index === 0 && survey) return displayMonth(String(value));
  const indices = survey ? surveyPercentIndices : qualityPercentIndices;
  if (indices.includes(index) && typeof value === "number")
    return value.toLocaleString("es-PE", {
      style: "percent",
      maximumFractionDigits: survey ? 1 : 0,
    });
  return String(value);
}
