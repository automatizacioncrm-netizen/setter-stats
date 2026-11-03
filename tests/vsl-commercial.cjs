const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  ts = require("typescript");
require.extensions[".ts"] = (m, p) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(p, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    p,
  );
const {
  commercialSchema,
  ALLOWED_CLOSERS,
  canonicalCloser,
  pivotCommercial,
  visibleCommercialRows,
  commercialCash,
  commercialConversion,
} = require("../src/lib/vsl-commercial.ts");
const { commercialApi } = require("../src/server/api/vsl-commercial.api.server.ts");
const metric = (extra = {}) => ({
  closer: "Amaranta Alfonso Krasnova",
  product: "EQUIPO MILLONARIO",
  agendas: 10,
  asistencias: 7,
  ventas: 1,
  conversion: 1 / 7,
  cashPEN: 0,
  cashUSD: 1520.59,
  ...extra,
});
const report = (rows = [metric()]) => ({
  success: true,
  month: "2026-10",
  timeZone: "America/Lima",
  rows,
});
test("pivot preserves products and values with six fixed closers and immutable source rows", () => {
  const raw = report([
    metric(),
    metric({ product: "CIRCULO MILLONARIO", cashUSD: 3620 }),
    metric({ closer: "NUEVO" }),
  ]);
  const before = JSON.stringify(raw),
    parsed = commercialSchema.parse(raw),
    rows = pivotCommercial(parsed);
  assert.equal(rows.length, 6);
  assert.equal(rows[0].equipo.cashUSD, 1520.59);
  assert.equal(rows[0].circulo.cashUSD, 3620);
  assert.equal(commercialCash([rows[0].equipo, rows[0].circulo]), "$ 5,140.59");
  assert.equal(JSON.stringify(raw), before);
});
test("ratios handle zero, sales without attendance and exact division; currencies remain separated", () => {
  assert.equal(commercialConversion(metric()), "14.29%");
  assert.equal(commercialConversion(metric({ ventas: 0, asistencias: 0 })), "0.00%");
  assert.equal(commercialConversion(metric({ asistencias: 0 })), "N/D");
  assert.equal(commercialConversion(undefined), "—");
  assert.match(
    commercialCash([metric({ cashPEN: 100 })]),
    /\$ 1,520.59 · S\/ 100.00.*sin total consolidado/,
  );
  assert.equal(commercialCash([metric({ cashPEN: 100, cashUSD: 0 })]), "S/ 100.00");
});
test("contract rejects duplicated allowed closer/product; excluded products are filtered and unconfirmed names remain separate", () => {
  assert.equal(commercialSchema.safeParse(report([metric(), metric()])).success, false);
  assert.deepEqual(commercialSchema.parse(report([metric({ product: "OTRO" })])).rows, []);
  assert.deepEqual(
    commercialSchema.parse(report([metric({ closer: "Fiorela" }), metric({ closer: "Fiorella" })]))
      .rows,
    [],
  );
  assert.equal(
    commercialSchema.safeParse(
      report([
        metric({ closer: "Sebastian", closerId: "one" }),
        metric({ closer: " SEBASTIÁN ", closerId: "two" }),
      ]),
    ).success,
    false,
  );
});
test("backend validates month before network, isolates months and shares identical active requests", async () => {
  const oldFetch = global.fetch,
    oldUrl = process.env.APPS_SCRIPT_URL_VSL;
  process.env.APPS_SCRIPT_URL_VSL = "https://script.google.com/macros/s/test/exec?keep=value";
  let calls = 0;
  global.fetch = async (url) => {
    calls++;
    assert.equal(url.searchParams.get("action"), "commercial");
    assert.equal(url.searchParams.get("keep"), "value");
    await new Promise((resolve) => setTimeout(resolve, 5));
    return Response.json({
      ...report([metric(), metric({ product: "GIRA / OTROS", closer: "EXCLUDED" })]),
      month: url.searchParams.get("month"),
    });
  };
  try {
    assert.equal(
      (await commercialApi(new Request("http://localhost/api?month=2026-13"))).status,
      400,
    );
    assert.equal(calls, 0);
    const responses = await Promise.all(
      ["2026-10", "2026-10", "2026-09"].map((month) =>
        commercialApi(new Request("http://localhost/api?month=" + month)),
      ),
    );
    assert.equal(calls, 2);
    for (const response of responses)
      assert.deepEqual(
        (await response.clone().json()).rows.map((row) => row.product),
        ["EQUIPO MILLONARIO"],
      );
    assert.deepEqual(await Promise.all(responses.map(async (r) => (await r.json()).month)), [
      "2026-10",
      "2026-10",
      "2026-09",
    ]);
    global.fetch = async () => Response.json({ ...report(), month: "2026-08" });
    assert.equal(
      (await commercialApi(new Request("http://localhost/api?month=2026-10"))).status,
      502,
    );
    global.fetch = async () =>
      new Response("<html>Error</html>", { headers: { "Content-Type": "text/html" } });
    assert.equal(
      (await commercialApi(new Request("http://localhost/api?month=2026-10"))).status,
      502,
    );
  } finally {
    global.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.APPS_SCRIPT_URL_VSL;
    else process.env.APPS_SCRIPT_URL_VSL = oldUrl;
  }
});

test("Table 4 renders eleven columns, parallel products and one merged month per closer group", () => {
  const Module = require("node:module"),
    path = require("node:path"),
    resolve = Module._resolveFilename;
  require.extensions[".tsx"] = (m, p) =>
    m._compile(
      ts.transpileModule(fs.readFileSync(p, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
        },
      }).outputText,
      p,
    );
  Module._resolveFilename = function (name, ...args) {
    return resolve.call(
      this,
      name.startsWith("@/") ? path.resolve("src", name.slice(2)) : name,
      ...args,
    );
  };
  let VslCommercialTable;
  try {
    ({ VslCommercialTable } = require("../src/components/reports/VslCommercialTable.tsx"));
  } finally {
    Module._resolveFilename = resolve;
  }
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server"),
    { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
  const client = new QueryClient();
  for (const month of ["2026-07", "2026-08", "2026-09", "2026-10"])
    client.setQueryData(
      ["vsl-commercial", month, "sales-only-v2", "", 0],
      commercialSchema.parse({
        ...report([
          metric({ ventas: month === "2026-07" ? 0 : 1 }),
          metric({
            product: "CIRCULO MILLONARIO",
            cashUSD: 3620,
            ventas: month === "2026-07" ? 0 : 1,
          }),
          metric({ closer: "NUEVO" }),
          ...(month === "2026-09" ? [metric({ closer: "Ezequiel Dario" })] : []),
          metric({
            closer: "SOLO EXCLUIDO",
            product: "GIRA / OTROS",
            ventas: 900,
            cashUSD: 999999,
          }),
        ]),
        month,
      }),
    );
  const html = renderToStaticMarkup(
    React.createElement(QueryClientProvider, { client }, React.createElement(VslCommercialTable)),
  );
  assert.equal((html.match(/<td /g) || []).length, 43);
  assert.equal((html.match(/rowSpan="2"/g) || []).length, 4);
  assert.ok(html.includes("colSpan=" + '"4"'));
  assert.ok(html.includes("$ 5,140.59"));
  assert.ok(html.includes("TABLA 4:"));
  assert.ok(html.includes("overflow-auto"));
  assert.equal((html.match(/rowSpan="1"/g) || []).length, 2);
  const body = html.match(/<tbody>[\s\S]*?<\/tbody>/)[0];
  assert.ok(!body.includes("JULIO 2026"));
  assert.ok(body.indexOf("OCTUBRE 2026") < body.indexOf("SEPTIEMBRE 2026"));
  assert.ok(body.indexOf("SEPTIEMBRE 2026") < body.indexOf("AGOSTO 2026"));
  const selector = html.match(/<select[^>]*>[\s\S]*?<\/select>/g)[2];
  assert.deepEqual(
    [...selector.matchAll(/<option[^>]*>(.*?)<\/option>/g)].map((match) => match[1]),
    ["Todos", ...ALLOWED_CLOSERS],
  );
  assert.ok(!html.includes("GIRA / OTROS"));
  assert.ok(!html.includes("SOLO EXCLUIDO"));
  assert.ok(!html.includes("999,999"));
  client.clear();
});

test("excluded products never enter sales, cash, conversion or closer options across all four months", () => {
  for (const month of ["2026-07", "2026-08", "2026-09", "2026-10"]) {
    const original = {
      ...report([
        metric(),
        metric({ product: "CIRCULO MILLONARIO", cashPEN: 100, cashUSD: 0 }),
        metric({ product: "GIRA / OTROS", ventas: 900, cashPEN: 800000, cashUSD: 999999 }),
        metric({ closer: "EXCLUDED ONLY", product: "OTRO", ventas: 700 }),
      ]),
      month,
    };
    const before = JSON.stringify(original);
    const data = commercialSchema.parse(original),
      pivot = pivotCommercial(data);
    assert.equal(data.rows.length, 2);
    assert.equal(
      data.rows.reduce((sum, row) => sum + row.ventas, 0),
      2,
    );
    assert.equal(pivot.length, 6);
    assert.equal(commercialConversion(pivot[0].equipo), "14.29%");
    assert.equal(
      commercialCash([pivot[0].equipo, pivot[0].circulo]),
      "$ 1,520.59 · S/ 100.00 (sin total consolidado)",
    );
    assert.equal(JSON.stringify(original), before);
    assert.ok(
      data.rows.every((row) => ["EQUIPO MILLONARIO", "CIRCULO MILLONARIO"].includes(row.product)),
    );
  }
});
test("common fields are validated before exclusion, so malformed unsupported products still fail", () => {
  for (const invalid of [
    { ventas: "1" },
    { cashUSD: -1 },
    { asistencias: NaN },
    { closer: "" },
    { product: null },
    { conversion: Infinity },
  ]) {
    assert.equal(
      commercialSchema.safeParse(
        report([metric(), metric({ product: "GIRA / OTROS", ...invalid })]),
      ).success,
      false,
    );
  }
});

test("closer whitelist matches only full normalized names, rejects technical IDs and keeps fixed empty rows", () => {
  const excluded = [
    "Evelyn Lopez Horna",
    "Cinthia Maquito",
    "Estefani Tello",
    "Javier Quintana",
    "Jose Luis Botto Garcia",
    "Julio",
    "Christian",
    "Antonio",
    "Thomas",
    "Miguel Angel",
    "SIN CLOSER IDENTIFICADO",
    "Jh1LDdbfRP024sF6O65a",
    "Amaranta",
    "Sebastian Otro",
    "Daniela Extra",
  ];
  assert.equal(canonicalCloser("  áMARANTA   ALFONSO krasnova "), ALLOWED_CLOSERS[0]);
  assert.equal(canonicalCloser(" SEBASTIÁN "), "Sebastian");
  for (const name of excluded) assert.equal(canonicalCloser(name), undefined);
  for (const month of ["2026-07", "2026-08", "2026-09", "2026-10"]) {
    const raw = {
      ...report([
        metric(),
        ...excluded.map((closer) => metric({ closer, ventas: 800, cashUSD: 999999 })),
        metric({ closer: " Daniela ", product: "GIRA / OTROS", ventas: 900 }),
      ]),
      month,
    };
    const before = JSON.stringify(raw),
      parsed = commercialSchema.parse(raw),
      rows = pivotCommercial(parsed);
    assert.deepEqual(
      rows.map((row) => row.closer),
      [...ALLOWED_CLOSERS],
    );
    assert.equal(parsed.rows.length, 1);
    assert.equal(
      parsed.rows.reduce((sum, row) => sum + row.ventas, 0),
      1,
    );
    assert.equal(commercialCash(rows.flatMap((row) => [row.equipo, row.circulo])), "$ 1,520.59");
    assert.ok(rows.slice(1).every((row) => row.equipo === undefined && row.circulo === undefined));
    assert.equal(commercialCash([rows[1].equipo, rows[1].circulo]), "—");
    assert.equal(JSON.stringify(raw), before);
    assert.deepEqual(
      pivotCommercial(commercialSchema.parse({ ...report([]), month })).map((row) => row.closer),
      [...ALLOWED_CLOSERS],
    );
  }
});

test("sales visibility is independent per month and ignores attendance, excluded people and products", () => {
  const october = commercialSchema.parse(
    report([
      metric({ ventas: 0, asistencias: 90 }),
      metric({ closer: "Ezequiel Dario", ventas: 1 }),
      metric({ closer: "Fiorela Bernales", product: "CIRCULO MILLONARIO", ventas: 1 }),
      metric({ closer: "Sebastian", ventas: 0 }),
      metric({ closer: "Daniela", product: "GIRA / OTROS", ventas: 90 }),
      metric({ closer: "EXCLUDED", ventas: 100 }),
    ]),
  );
  const september = commercialSchema.parse({
    ...report([metric({ ventas: 2 }), metric({ closer: "Ezequiel Dario", ventas: 0 })]),
    month: "2026-09",
  });
  assert.deepEqual(
    visibleCommercialRows(october).map((row) => row.closer),
    ["Ezequiel Dario", "Fiorela Bernales"],
  );
  assert.deepEqual(
    visibleCommercialRows(september).map((row) => row.closer),
    ["Amaranta Alfonso Krasnova"],
  );
  assert.equal(visibleCommercialRows(october, "Ezequiel Dario").length, 1);
  assert.equal(visibleCommercialRows(october, "Sebastian").length, 0);
  assert.equal(
    visibleCommercialRows(commercialSchema.parse(report([metric({ ventas: 0 })]))).length,
    0,
  );
  assert.equal(
    visibleCommercialRows(october).reduce(
      (sum, row) => sum + (row.equipo?.ventas ?? 0) + (row.circulo?.ventas ?? 0),
      0,
    ),
    2,
  );
});
test("commercial history uses Lima dates, spans years, includes current month and rejects manual future periods", () => {
  const { limaDay } = require("../src/lib/vsl-date-range.ts");
  const {
    initialCommercialPeriod,
    historicalCommercialMonths,
    selectedCommercialMonths,
  } = require("../src/lib/vsl-commercial-period.ts");
  const today = limaDay(new Date("2026-11-01T02:00:00Z"));
  assert.equal(today, "2026-10-31");
  assert.deepEqual(historicalCommercialMonths(today), ["2026-10", "2026-09", "2026-08", "2026-07"]);
  assert.deepEqual(initialCommercialPeriod("2026-11-03"), { year: "2026", start: "7", end: "11" });
  assert.deepEqual(historicalCommercialMonths("2026-11-03"), [
    "2026-11",
    "2026-10",
    "2026-09",
    "2026-08",
    "2026-07",
  ]);
  assert.deepEqual(historicalCommercialMonths("2027-01-01"), [
    "2027-01",
    "2026-12",
    "2026-11",
    "2026-10",
    "2026-09",
    "2026-08",
    "2026-07",
  ]);
  const manual = { year: "2026", start: "8", end: "9" };
  assert.deepEqual(selectedCommercialMonths(manual, "2026-11-03"), ["2026-09", "2026-08"]);
  assert.deepEqual(selectedCommercialMonths(manual, "2026-12-01"), ["2026-09", "2026-08"]);
  for (const period of [
    { year: "2026", start: "11", end: "12" },
    { year: "2027", start: "1", end: "1" },
    { year: "2026", start: "10", end: "7" },
  ])
    assert.throws(() => selectedCommercialMonths(period, "2026-11-03"));
});
