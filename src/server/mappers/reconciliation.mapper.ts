import { z } from "zod";
import type { ReconciliationResult } from "../../types/reconciliation.types";
import { ApiError } from "../config/env.server";

const count = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => (v == null || v === "" ? 0 : Number(v)))
  .pipe(z.number().finite().nonnegative());
const schema = z.object({
  ok: z.boolean(),
  timestamp: z
    .string()
    .nullish()
    .transform((v) => v ?? ""),
  resultado: z.object({
    revisadas: count,
    nuevas: count,
    modificadas: count,
    sinCambios: count,
    insertadas: count,
    actualizadas: count,
    errores: count,
    segundos: count,
  }),
});

export function mapReconciliationResponse(raw: unknown): ReconciliationResult {
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    throw new ApiError("Apps Script devolvió una reconciliación con formato inválido.");
  const { ok, resultado: r, timestamp } = parsed.data;
  return {
    ok,
    reviewed: r.revisadas,
    newRecords: r.nuevas,
    modified: r.modificadas,
    unchanged: r.sinCambios,
    inserted: r.insertadas,
    updated: r.actualizadas,
    errors: r.errores,
    durationSeconds: r.segundos,
    timestamp,
  };
}
