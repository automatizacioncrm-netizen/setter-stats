import { z } from "zod";

export const NO_APLICA_FASE = "No Aplica(No califica/No desea)";
export const normalizeOpportunityPhase = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*([()/])\s*/g, "$1")
    .toLowerCase();
const stageSchema = z.object({
  fase: z.string(),
  total: z.number().int().nonnegative(),
  porcentaje: z.number().finite().min(0).max(100).optional(),
});
const cohortSchema = z.object({
  totalLeadsVsl: z.number().int().nonnegative(),
  porEtapa: z.array(stageSchema),
});
const phaseKey = normalizeOpportunityPhase(NO_APLICA_FASE);

// Reuse aggregated Opportunity phases. Never classify Calendar/appointment rows.
export function noAplicaFields(data: Record<string, unknown>) {
  const stages = data["etapasPorEmbudo"] as
    { porEmbudo?: { vsl?: { totalLeads?: unknown; porEtapa?: unknown } } } | undefined;
  const vsl = stages?.porEmbudo?.vsl;
  const seteo = cohortSchema.safeParse(data["vslSeteo"]);
  const rows = z.array(stageSchema).safeParse(vsl?.porEtapa);
  if (vsl != null && !rows.success) throw new Error("El desglose de etapas VSL es inválido.");
  const direct = stageSchema.safeParse(data["vslNoAplica"]);
  let porEtapa: z.infer<typeof stageSchema>[];
  let totalLeads: number;
  if (rows.success) {
    porEtapa = rows.data;
    totalLeads = porEtapa.reduce((sum, row) => sum + row.total, 0);
    if (typeof vsl?.totalLeads === "number" && vsl.totalLeads !== totalLeads)
      throw new Error("Las etapas VSL no concilian con totalLeads.");
  } else if (seteo.success) {
    totalLeads = seteo.data.totalLeadsVsl;
    if (seteo.data.porEtapa.reduce((sum, row) => sum + row.total, 0) !== totalLeads)
      throw new Error("Las etapas VSL no concilian con totalLeadsVsl.");
    porEtapa = seteo.data.porEtapa.map((row) => ({
      ...row,
      porcentaje: totalLeads ? Number(((row.total * 100) / totalLeads).toFixed(2)) : 0,
    }));
  } else {
    if (direct.success && normalizeOpportunityPhase(direct.data.fase) !== phaseKey)
      throw new Error("vslNoAplica identifica otra fase.");
    return direct.success ? { vslNoAplica: direct.data } : {};
  }
  const matching = porEtapa.filter((row) => normalizeOpportunityPhase(row.fase) === phaseKey);
  const total = matching.reduce((sum, row) => sum + row.total, 0);
  const porcentaje =
    matching.length === 1 && matching[0]?.porcentaje != null
      ? matching[0].porcentaje
      : totalLeads
        ? Number(((total * 100) / totalLeads).toFixed(2))
        : 0;
  if (
    data["vslNoAplica"] != null &&
    (!direct.success ||
      normalizeOpportunityPhase(direct.data.fase) !== phaseKey ||
      direct.data.total !== total ||
      (direct.data.porcentaje != null && direct.data.porcentaje !== porcentaje))
  )
    throw new Error("vslNoAplica no coincide con las etapas VSL.");
  return {
    etapasPorEmbudo: vsl
      ? stages
      : {
          ...stages,
          porEmbudo: { ...stages?.porEmbudo, vsl: { totalLeads, porEtapa } },
        },
    vslNoAplica: { fase: NO_APLICA_FASE, total, porcentaje },
  };
}
