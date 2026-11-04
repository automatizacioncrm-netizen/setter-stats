const fs = require("node:fs"),
  ts = require("typescript");
require.extensions[".ts"] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    file,
  );
(async () => {
  const { loadEnv } = await import("vite");
  process.env.APPS_SCRIPT_URL_VSL ||= loadEnv(
    "development",
    process.cwd(),
    "APPS_SCRIPT_URL_VSL",
  ).APPS_SCRIPT_URL_VSL;
  const { fetchVslJson } = require("../src/server/adapters/vsl-quality.adapter.server.ts");
  const { commercialTrendsSchema, reconcileTrends } = require("../src/lib/commercial-trends.ts");
  const { commercialSchema } = require("../src/lib/vsl-commercial.ts");
  const from = process.argv[2] ?? "2026-07",
    to = process.argv[3] ?? "2026-11";
  const data = commercialTrendsSchema.parse(
    await fetchVslJson({ action: "commercial_trends", from, to }),
  );
  const reports = [];
  for (const month of data.months) {
    const report = commercialSchema.parse(await fetchVslJson({ action: "commercial", month }));
    if (report.month !== month) throw Error("Mes comercial incorrecto");
    reports.push(report);
  }
  reconcileTrends(data, reports);
  console.log(
    JSON.stringify(
      {
        passed: true,
        months: data.months,
        records: data.series.length,
        comparisons:
          "asistencias y ventas por mes/closer/producto; conversión validada con sus conteos",
        generatedAt: data.generatedAt,
      },
      null,
      2,
    ),
  );
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
