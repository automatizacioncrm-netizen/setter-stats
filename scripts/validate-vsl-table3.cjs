// Read-only audit of the deployed API. Never refreshes GHL or writes to Sheets.
const fs = require("node:fs"),
  path = require("node:path"),
  ts = require("typescript");
require.extensions[".ts"] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    file,
  );
async function main() {
  const month = process.argv[2] ?? "2026-10";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Usa YYYY-MM como argumento.");
  const { loadEnv } = await import("vite");
  if (!process.env.APPS_SCRIPT_URL_VSL)
    process.env.APPS_SCRIPT_URL_VSL = loadEnv(
      "development",
      path.resolve(__dirname, ".."),
      "APPS_SCRIPT_URL_VSL",
    ).APPS_SCRIPT_URL_VSL;
  const { fetchVslJson } = require("../src/server/adapters/vsl-quality.adapter.server.ts");
  const { qualityReportSchema } = require("../src/lib/vsl-quality.ts");
  const {
    validateAppointmentsByFunnel,
    funnelMonthKey,
    funnelGroups,
  } = require("../src/lib/appointments-by-funnel.ts");
  const { monthOfYear } = require("../src/lib/vsl-date-range.ts");
  const full = monthOfYear(Number(month.slice(0, 4)), Number(month.slice(5, 7)));
  const cases = [
    { name: "historical", range: undefined },
    { name: "fullMonth", range: full },
    { name: "partialMonth", range: { startDate: month + "-10", endDate: month + "-20" } },
  ];
  const results = [],
    reports = [];
  for (const item of cases) {
    const raw = await fetchVslJson({ action: "report", ...item.range });
    const parsed = qualityReportSchema.safeParse(raw);
    if (!parsed.success)
      throw new Error(
        "Contrato principal inválido para " +
          item.name +
          ": " +
          parsed.error.issues
            .map((issue) => issue.path.join(".") + ": " + issue.message)
            .join("; "),
      );
    const validated = validateAppointmentsByFunnel(raw.appointmentsByFunnel, item.range);
    const filterMatches = !item.range
      ? !raw.filter
      : raw.filter?.startDate === item.range.startDate &&
        raw.filter?.endDate === item.range.endDate &&
        raw.filter?.inclusive === true;
    const data = validated.data;
    reports.push(data);
    results.push({
      case: item.name,
      filter: item.range ?? null,
      filterMatches,
      table1: { columns: raw.quality.columns.length, rows: raw.quality.rows.length },
      table2: {
        summaryColumns: raw.surveys.columns.length,
        statusColumns: raw.surveyStatus.columns.length,
      },
      table3: {
        columns: data?.columns.length,
        rows: data?.rows.length,
        error: validated.error,
        duplicateAppointmentRows: raw.appointmentsByFunnel?.duplicateAppointmentRows,
        deletedAppointmentsExcluded: raw.appointmentsByFunnel?.deletedAppointmentsExcluded,
      },
    });
  }
  const comparison = funnelGroups.map((group) => {
    const historical =
      reports[0]?.rows.filter((row) => row[0] === group && funnelMonthKey(row[1]) === month) ?? [];
    const filtered =
      reports[1]?.rows.filter((row) => row[0] === group && funnelMonthKey(row[1]) === month) ?? [];
    const matches =
      historical.length === 1 &&
      filtered.length === 1 &&
      historical[0]
        .slice(2)
        .every((value, index) => Math.abs(value - filtered[0][index + 2]) <= 1e-8);
    return {
      group,
      matches,
      historicalCount: historical[0]?.[2],
      filteredCount: filtered[0]?.[2],
      historicalMetrics: historical[0]?.slice(2),
      filteredMetrics: filtered[0]?.slice(2),
    };
  });
  const passed =
    results.every(
      (result) => result.filterMatches && !result.table3.error && result.table3.rows !== undefined,
    ) && comparison.every((result) => result.matches);
  console.log(
    JSON.stringify(
      {
        month,
        passed,
        results,
        comparison,
        limitations: [
          "No hay acceso directo a Google Sheets ni al API.gs desplegado desde este repositorio.",
          "La deduplicación por Appointment ID, la presencia de _Appointment Updated At y la elección de la versión vigente requieren revisar el código actual y/o filas de origen.",
          "No se han sumado intervalos ni alterado cifras para hacer coincidir las respuestas.",
        ],
      },
      null,
      2,
    ),
  );
  process.exitCode = passed ? 0 : 1;
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "No se pudo ejecutar la validación.");
  process.exitCode = 2;
});
