import { consultantsSchema } from "./consultants-report";
export const consultantsQueryKey = ["consultants-report"] as const;
export async function fetchConsultants({ signal }: { signal: AbortSignal }) {
  const response = await fetch("/api/reports/consultores", { signal, cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "No se pudo cargar el reporte de consultores.");
  return consultantsSchema.parse(body);
}
