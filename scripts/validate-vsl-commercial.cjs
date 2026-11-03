const fs = require("fs"),
  ts = require("typescript");
require.extensions[".ts"] = (m, p) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(p, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    p,
  );
(async () => {
  const { loadEnv } = await import("vite");
  process.env.APPS_SCRIPT_URL_VSL ||= loadEnv(
    "development",
    process.cwd(),
    "APPS_SCRIPT_URL_VSL",
  ).APPS_SCRIPT_URL_VSL;
  const { fetchVslJson } = require("../src/server/adapters/vsl-quality.adapter.server.ts");
  const {
    commercialSchema,
    pivotCommercial,
    visibleCommercialRows,
  } = require("../src/lib/vsl-commercial.ts");
  const { historicalCommercialMonths } = require("../src/lib/vsl-commercial-period.ts");
  const results = [];
  for (const month of historicalCommercialMonths()) {
    const raw = await fetchVslJson({ action: "commercial", month });
    const data = commercialSchema.parse(raw);
    if (data.month !== month) throw Error("Mes incorrecto");
    const pivot = pivotCommercial(data);
    for (const field of ["ventas", "cashPEN", "cashUSD", "asistencias"]) {
      const original = data.rows.reduce((sum, r) => sum + r[field], 0);
      const transformed = pivot.reduce(
        (sum, r) => sum + (r.equipo?.[field] ?? 0) + (r.circulo?.[field] ?? 0),
        0,
      );
      if (Math.abs(original - transformed) > 1e-8) throw Error("Valores alterados en " + field);
    }
    results.push({
      month,
      receivedRows: raw.rows.length,
      excludedRows: raw.rows.length - data.rows.length,
      rows: data.rows.length,
      closers: pivot.length,
      visibleClosers: visibleCommercialRows(data).map((row) => row.closer),
      responseFields: Object.keys(raw),
      rowFields: raw.rows[0] ? Object.keys(raw.rows[0]) : [],
      rules: raw.rules,
      diagnostics: data.diagnostics,
    });
  }
  console.log(JSON.stringify({ variable: "APPS_SCRIPT_URL_VSL", passed: true, results }, null, 2));
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
