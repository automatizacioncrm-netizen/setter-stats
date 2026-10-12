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
  const staged = z
    .object({
      ok: z.literal(true),
      success: z.boolean().optional(),
      completed: z.boolean(),
      stage: z.string(),
      nextAction: z.string().nullable(),
      timestamp: z.string(),
      resultado: z
        .object({ success: z.literal(true), completed: z.boolean(), result: z.record(z.unknown()) })
        .passthrough(),
    })
    .safeParse(raw);
  if (staged.success) {
    const body = staged.data;
    const totals = {
      reviewed: 0,
      newRecords: 0,
      modified: 0,
      unchanged: 0,
      inserted: 0,
      updated: 0,
      errors: 0,
      durationSeconds: 0,
    };
    const fields = {
      revisadas: "reviewed",
      nuevas: "newRecords",
      modificadas: "modified",
      sinCambios: "unchanged",
      insertadas: "inserted",
      actualizadas: "updated",
      errores: "errors",
      segundos: "durationSeconds",
    } as const;
    const collect = (value: unknown) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      for (const [key, item] of Object.entries(value)) {
        if (key in fields && (typeof item === "number" || typeof item === "string")) {
          const number = Number(item);
          if (Number.isFinite(number) && number >= 0)
            totals[fields[key as keyof typeof fields]] += number;
        } else if (item && typeof item === "object") collect(item);
      }
    };
    collect(body.resultado.result);
    return {
      ...totals,
      ok: true,
      success: true,
      completed: body.completed,
      stage: body.stage,
      nextAction: body.nextAction,
      resultado: body.resultado,
      timestamp: body.timestamp,
    };
  }
  // RECONCILIAR_TODO returns separate opportunity and Calendar counters.
  const global = z
    .object({
      ok: z.literal(true),
      timestamp: z.string().optional(),
      resultado: z.object({
        success: z.boolean(),
        opportunities: z.object({ vsl: schema.shape.resultado, oei: schema.shape.resultado }),
        calendar: schema.shape.resultado,
        errors: z.array(z.unknown()),
        seconds: count,
      }),
    })
    .safeParse(raw);
  if (global.success) {
    const { resultado: r } = global.data;
    const parts = [r.opportunities.vsl, r.opportunities.oei, r.calendar];
    const sum = (key: keyof typeof r.calendar) =>
      parts.reduce((total, part) => total + part[key], 0);
    return {
      ok: r.success,
      reviewed: sum("revisadas"),
      newRecords: sum("nuevas"),
      modified: sum("modificadas"),
      unchanged: sum("sinCambios"),
      inserted: sum("insertadas"),
      updated: sum("actualizadas"),
      errors: Math.max(sum("errores"), r.errors.length),
      durationSeconds: r.seconds,
      timestamp: global.data.timestamp ?? "",
    };
  }
  if (
    raw &&
    typeof raw === "object" &&
    "resultado" in raw &&
    raw.resultado &&
    typeof raw.resultado === "object" &&
    "opportunities" in raw.resultado
  )
    throw new ApiError("Apps Script devolvió una reconciliación global con formato inválido.");
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
