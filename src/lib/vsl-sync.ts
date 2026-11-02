import { z } from "zod";
export const syncStages = ["leads", "appointments", "surveys", "reports"] as const;
export const syncStateSchema = z.object({
  id: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
  finishedAt: z.string().nullable().optional(),
  status: z.enum(["IDLE", "QUEUED", "RUNNING", "COMPLETED", "ERROR"]),
  stage: z.enum(syncStages).nullable().optional(),
  completedStages: z.array(z.enum(syncStages)).default([]),
  warning: z
    .union([z.string(), z.array(z.string())])
    .nullable()
    .optional(),
  error: z.string().nullable().optional(),
});
export type VslSyncState = z.infer<typeof syncStateSchema>;
export function activeSync(state?: VslSyncState | null): boolean {
  return state?.status === "QUEUED" || state?.status === "RUNNING";
}
export function syncLabel(state?: VslSyncState | null): string {
  if (!state) return "Preparando actualización";
  if (state.status === "COMPLETED") return "Actualización completada";
  if (state.status === "ERROR") return "Error en la actualización";
  if (state.status === "IDLE") return "No hay una actualización activa";
  if (state.status === "QUEUED") return "Preparando actualización";
  if (!state.stage) return "Actualización en curso";
  return {
    leads: "Sincronizando leads VSL",
    appointments: "Sincronizando agendamientos",
    surveys: "Sincronizando encuestas",
    reports: "Regenerando reportes",
  }[state.stage];
}
