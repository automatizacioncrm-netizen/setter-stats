import { formatSurveyMonth } from "./survey-month";
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
  "ESTADO DE AGENDA",
  "Sí, soy empresario",
  "No soy empresario",
  "Menos de USD 5,000",
  "USD 5,000–10,000",
  "USD 10,000–20,000",
  "USD 20,000–50,000",
  "Más de USD 50,000",
  "3 principales cuellos de botella",
  "Dispuesto a invertir (respuesta afirmativa)",
  "No cuenta con presupuesto",
  "Sí contestará llamada",
  "No contestará llamada",
  "Leads con encuesta y cita",
  "% factura más de 5k",
  "% dispuesto a invertir",
  "% calificados (factura >5k y dispuesto)",
  "Sin rango de facturación",
];
export const agendaStates = ["CONFIRMADO", "ASISTIÓ", "CANCELADO", "NO ASISTIÓ", "OTRO"];
export const qualityPercentIndices = [3, 5, 8, 10];
export const surveyPercentIndices = [15, 16, 17];
const cell = z.union([z.string(), z.number().finite(), z.null()]);
function table(width: number, textIndices: number[]) {
  return z.object({
    columns: z.array(z.string()).length(width),
    rows: z
      .array(z.array(cell))
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
export const qualityReportSchema = z.object({
  success: z.literal(true),
  generatedAt: z.string().datetime({ offset: true }),
  timeZone: z.literal("America/Lima"),
  quality: table(15, [0]),
  surveys: table(19, [0, 1, 9]),
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
    return value.toLocaleString("es-PE", { style: "percent", maximumFractionDigits: 0 });
  return String(value);
}
