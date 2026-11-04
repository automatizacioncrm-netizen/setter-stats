import { z } from "zod";
export const consultantMonths = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
] as const;
const hours = z.number().finite().nonnegative();
const entrepreneurSchema = z.object({
  NOMBRE: z.string(),
  Enero: hours,
  Febrero: hours,
  Marzo: hours,
  Abril: hours,
  Mayo: hours,
  Junio: hours,
  Julio: hours,
  Agosto: hours,
  Septiembre: hours,
  Octubre: hours,
  Noviembre: hours,
  TOTAL: hours,
});
export const consultantsSchema = z.object({
  success: z.literal(true),
  porArea: z.array(
    z.object({
      MES: z.string(),
      RRHH: hours,
      MKTG: hours,
      FINANZAS: hours,
      "COMERCIAL/EMPRESARIAL": hours,
    }),
  ),
  porEmpresario: z.array(entrepreneurSchema),
});
export type ConsultantsReport = z.infer<typeof consultantsSchema>;
export type ConsultantSort = { column: number; direction: "asc" | "desc" };
export function nextConsultantSort(current: ConsultantSort | null, column: number): ConsultantSort {
  return {
    column,
    direction: current?.column === column && current.direction === "desc" ? "asc" : "desc",
  };
}
export function sortConsultantRows(
  rows: readonly (readonly (string | number)[])[],
  sort: ConsultantSort | null,
  monthColumn = false,
) {
  if (!sort) return [...rows];
  const monthIndex = (value: string) =>
    consultantMonths.findIndex(
      (month) => month.toLocaleLowerCase("es") === value.trim().toLocaleLowerCase("es"),
    );
  return [...rows].sort((a, b) => {
    const left = a[sort.column] ?? "",
      right = b[sort.column] ?? "";
    const comparison =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : monthColumn &&
            sort.column === 0 &&
            monthIndex(String(left)) >= 0 &&
            monthIndex(String(right)) >= 0
          ? monthIndex(String(left)) - monthIndex(String(right))
          : String(left).localeCompare(String(right), "es", { numeric: true, sensitivity: "base" });
    return sort.direction === "desc" ? -comparison : comparison;
  });
}
