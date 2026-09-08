import type { LeadType } from "../../types/reports";

export function getLeadType(value: unknown): LeadType | "other" {
  const normalized = String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  if (normalized.includes("VSL FUNNEL")) return "paid";
  if (normalized.includes("ORGANICO")) return "organic";
  return "other";
}
