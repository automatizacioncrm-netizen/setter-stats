// Read-only baseline: does not sync, alter Sheets, classify calendars or reassign sales.
const fs = require("node:fs"),
  ts = require("typescript");
require.extensions[".ts"] = (m, p) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(p, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    p,
  );
const { z } = require("zod");
const count = z.number().finite().int().nonnegative();
const schema = z.object({
  success: z.literal(true),
  month: z.string(),
  rows: z.array(
    z.object({
      closer: z.string().min(1),
      product: z.string().min(1),
      agendas: count,
      asistencias: count,
      ventas: count,
      cashPEN: z.number().finite().nonnegative(),
      cashUSD: z.number().finite().nonnegative(),
      conversion: z.number().finite().nonnegative().nullable(),
    }),
  ),
  diagnostics: z.record(z.unknown()).optional(),
});
(async () => {
  const { loadEnv } = await import("vite");
  process.env.APPS_SCRIPT_URL_GERENCIA ||= loadEnv(
    "development",
    process.cwd(),
    "APPS_SCRIPT_URL_GERENCIA",
  ).APPS_SCRIPT_URL_GERENCIA;
  const { fetchVslJson } = require("../src/server/adapters/vsl-quality.adapter.server.ts");
  const reports = [];
  for (const month of ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]) {
    const data = schema.parse(await fetchVslJson({ action: "commercial", month }));
    if (data.month !== month) throw Error("Mes incorrecto: " + month);
    const rows = data.rows.filter(
      (row) => row.product === "EQUIPO MILLONARIO" || row.product === "CIRCULO MILLONARIO",
    );
    const totals = rows.reduce(
      (sum, row) => ({
        asistencias: sum.asistencias + row.asistencias,
        ventas: sum.ventas + row.ventas,
        cashPEN: sum.cashPEN + row.cashPEN,
        cashUSD: sum.cashUSD + row.cashUSD,
      }),
      { asistencias: 0, ventas: 0, cashPEN: 0, cashUSD: 0 },
    );
    reports.push({
      month,
      receivedRows: data.rows.length,
      rows,
      totals,
      attendanceAudit: data.diagnostics?.attendanceAudit ?? null,
      diagnostics: data.diagnostics,
    });
  }
  const { qualityReportSchema } = require("../src/lib/vsl-quality.ts");
  const { validateAppointmentsByFunnel } = require("../src/lib/appointments-by-funnel.ts");
  const raw = await fetchVslJson({ action: "report" });
  const parsed = qualityReportSchema.safeParse(raw);
  const funnels = validateAppointmentsByFunnel(raw.appointmentsByFunnel);
  const result = {
    variable: "APPS_SCRIPT_URL_GERENCIA",
    reports,
    reportContract: {
      valid: parsed.success,
      qualityColumns: raw.quality?.columns?.length,
      surveyColumns: raw.surveys?.columns?.length,
      surveyStatusColumns: raw.surveyStatus?.columns?.length,
      funnelsValid: !!funnels.data,
      funnelError: funnels.error ?? null,
    },
    limitations: [
      "El JSON agregado no permite comprobar Calendar ID, Fecha cita, Appointment ID ni selección de última versión.",
      "La integridad del contrato no demuestra que las Tablas 1 y 2 usen exclusivamente los calendarios VSL Pagado.",
      "Sin el API.gs desplegado y los registros originales no se puede corregir ni certificar la ampliación de calendarios.",
    ],
  };
  console.log(JSON.stringify(result, null, 2));
  if (!parsed.success || !funnels.data) process.exitCode = 1;
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
