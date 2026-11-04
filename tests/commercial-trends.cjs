const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  ts = require("typescript");
require.extensions[".ts"] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    file,
  );
const {
  commercialTrendsSchema,
  trendMonths,
  reconcileTrends,
  trendChartData,
} = require("../src/lib/commercial-trends.ts");
const { commercialSchema } = require("../src/lib/vsl-commercial.ts");
const salesHeaders = [
  "Opportunity ID",
  "Contact ID",
  "Secuencia",
  "Fase",
  "Fecha de primer pago",
  "Producto/Evento",
  "GHL Updated At",
  "Opportunity assigned",
  "Tipo de moneda del precio acordado",
  "Monto de cuota 1",
];
const apHeaders = [
  "_Appointment ID",
  "_Opportunity ID",
  "_Contact ID",
  "Estado cita",
  "Fecha cita",
  "_Deleted",
  "_Calendar ID",
  "Producto",
  "Calendario cita",
  "Closer cita",
  "_Appointment Updated At",
  "_Appointment Created At",
];
function sources() {
  return {
    "VSL DATA": [
      salesHeaders,
      [
        "s1",
        "c1",
        "VSL | Closers",
        "Venta Confirmada / Reserva",
        "2026-10-10",
        "EQUIPO MILLONARIO",
        "2026-10-11",
        "Amaranta",
        "USD",
        100,
      ],
      [
        "s1",
        "c1",
        "VSL | Closers",
        "Venta Confirmada / Reserva",
        "2026-10-10",
        "EQUIPO MILLONARIO",
        "2026-10-01",
        "Amaranta",
        "USD",
        999,
      ],
      [
        "s2",
        "c1",
        "Captación orgánica de leads | Setters",
        "Venta Confirmada/Reserva",
        "2026-10-12",
        "EQUIPO MILLONARIO",
        "2026-10-12",
        "Ezequiel",
        "USD",
        200,
      ],
      [
        "s3",
        "c2",
        "VSL | Closers",
        "Venta Confirmada / Reserva",
        "2026-10-10",
        "CIRCULO MILLONARIO",
        "2026-10-11",
        "Ezequiel",
        "PEN",
        300,
      ],
      [
        "s4",
        "no-appointment",
        "VSL | Closers",
        "Venta Confirmada / Reserva",
        "2026-10-10",
        "EQUIPO MILLONARIO",
        "2026-10-11",
        "Amaranta",
        "USD",
        900,
      ],
      [
        "s5",
        "c4",
        "VSL | Closers",
        "Venta Confirmada / Reserva",
        "2026-09-14",
        "EQUIPO MILLONARIO",
        "2026-09-15",
        "Fiorela",
        "USD",
        50,
      ],
    ],
    APPOINTMENTS_MASTER: [
      apHeaders,
      [
        "a1",
        "s1",
        "c1",
        "no-show",
        "2026-10-04T15:00:00-05:00",
        "false",
        "pMZfD4DFxhQCJHC9zoK0",
        "EQUIPO MILLONARIO",
        "",
        "Amaranta",
        "2026-10-04T10:00:00Z",
        "2026-10-01",
      ],
      [
        "a1",
        "s1",
        "c1",
        "showed",
        "2026-10-04T15:00:00-05:00",
        "false",
        "pMZfD4DFxhQCJHC9zoK0",
        "EQUIPO MILLONARIO",
        "",
        "Amaranta",
        "2026-10-05T10:00:00Z",
        "2026-10-01",
      ],
      [
        "a2",
        "s3",
        "c2",
        "confirmed",
        "2026-10-08T15:00:00-05:00",
        "false",
        "2stEL9p5aBxmHO5N7D8m",
        "CIRCULO MILLONARIO",
        "",
        "Ezequiel",
        "2026-10-09T10:00:00Z",
        "2026-10-01",
      ],
      [
        "a3",
        "s5",
        "c4",
        "showed",
        "2026-09-12T15:00:00-05:00",
        "false",
        "pMZfD4DFxhQCJHC9zoK0",
        "EQUIPO MILLONARIO",
        "",
        "Fiorela",
        "2026-09-13T10:00:00Z",
        "2026-09-01",
      ],
      [
        "a4",
        "",
        "no-sale",
        "showed",
        "2026-10-08T15:00:00-05:00",
        "false",
        "2stEL9p5aBxmHO5N7D8m",
        "CIRCULO MILLONARIO",
        "",
        "Gabriel",
        "2026-10-09T10:00:00Z",
        "2026-10-01",
      ],
      [
        "deleted",
        "",
        "",
        "showed",
        "2026-10-08T15:00:00-05:00",
        "true",
        "pMZfD4DFxhQCJHC9zoK0",
        "EQUIPO MILLONARIO",
        "",
        "Amaranta",
        "2026-10-09T10:00:00Z",
        "2026-10-01",
      ],
    ],
  };
}
function runtime(file) {
  let reads = 0;
  const data = sources();
  const context = vm.createContext({
    console: { log() {}, error() {} },
    Logger: { log() {} },
    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: (name) =>
          data[name]
            ? {
                getDataRange: () => ({
                  getValues: () => {
                    reads++;
                    return data[name].map((row) => [...row]);
                  },
                }),
              }
            : null,
      }),
    },
    Utilities: {
      formatDate: (date, tz, format) => {
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone: tz,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).formatToParts(new Date(date.getTime()));
        return ["year", "month", "day"]
          .map((key) => parts.find((p) => p.type === key).value)
          .join("-");
      },
    },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput: (text) => ({
        text,
        setMimeType() {
          return this;
        },
      }),
    },
  });
  vm.runInContext(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""), context);
  return {
    context,
    reads: () => reads,
    run: (code) => JSON.parse(JSON.stringify(vm.runInContext(code, context))),
  };
}
test("new commercial endpoint is unchanged against the complete original API for every month", () => {
  const before = runtime("tests/fixtures/vsl-api-before-trends.gs"),
    after = runtime("apps-script/vsl-commercial/API.gs");
  for (const month of ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]) {
    const a = before.run('COM_BUILD_("' + month + '")'),
      b = after.run('COM_BUILD_("' + month + '")');
    delete a.generatedAt;
    delete b.generatedAt;
    assert.deepEqual(b, a);
  }
  const october = after.run('COM_BUILD_("2026-10")');
  assert.equal(october.totals.ventas, 2);
  assert.equal(october.diagnostics.duplicateCustomerProduct, 1);
  assert.equal(october.diagnostics.duplicateOpportunityRows, 1);
  assert.equal(october.totals.cashUSD, 100);
  assert.equal(october.totals.cashPEN, 300);
});
test("trends read each source once, preserve exact COM_BUILD monthly metrics and distinguish null from zero", () => {
  const backend = runtime("apps-script/vsl-commercial/API.gs");
  const raw = backend.run('COM_TRENDS_RESPONSE_("2026-07","2026-11")');
  assert.equal(backend.reads(), 2);
  assert.deepEqual(raw.months, ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
  const parsed = commercialTrendsSchema.parse(raw);
  const baseline = runtime("tests/fixtures/vsl-api-before-trends.gs");
  const reports = raw.months.map((month) =>
    commercialSchema.parse(baseline.run('COM_BUILD_("' + month + '")')),
  );
  reconcileTrends(parsed, reports);
  const nd = parsed.series.find(
    (row) => row.closer === "Ezequiel Dario" && row.month === "2026-10",
  );
  assert.equal(nd.asistencias, 0);
  assert.equal(nd.ventas, 1);
  assert.equal(nd.conversion, null);
  const zero = parsed.series.find((row) => row.closer === "Gabriel Eduardo Mora De Hoyos");
  assert.equal(zero.asistencias, 1);
  assert.equal(zero.ventas, 0);
  assert.equal(zero.conversion, 0);
  assert.ok(!parsed.series.some((row) => row.month === "2026-11"));
  const points = trendChartData(parsed, "CIRCULO MILLONARIO");
  assert.equal(points[3]["Ezequiel Dario"], null);
  assert.equal(points[3]["Gabriel Eduardo Mora De Hoyos"], 0);
  assert.deepEqual(points[4].metrics, {});
  const changed = structuredClone(reports);
  changed[3].rows[0].ventas += 1;
  assert.throws(() => reconcileTrends(parsed, changed), /no coinciden/);
  const result = backend.run(
    'doGet({parameter:{action:"commercial_trends",from:"2026-07",to:"2026-11"}})',
  );
  assert.equal(JSON.parse(result.text).success, true);
});
test("range and schema reject excessive requests, duplicate metrics, wrong ratios and incorrect ND", () => {
  assert.throws(() => trendMonths("2026-13", "2026-14"));
  assert.throws(() => trendMonths("2026-11", "2026-07"));
  assert.throws(() => trendMonths("2026-01", "2027-01"));
  assert.deepEqual(trendMonths("2026-12", "2027-01"), ["2026-12", "2027-01"]);
  const backend = runtime("apps-script/vsl-commercial/API.gs");
  assert.throws(() => backend.run('COM_TRENDS_RESPONSE_("2026-01","2027-01")'));
  assert.equal(backend.reads(), 0);
  const raw = backend.run('COM_TRENDS_RESPONSE_("2026-10","2026-10")');
  const bad = structuredClone(raw);
  bad.series[0].conversion = 99;
  assert.equal(commercialTrendsSchema.safeParse(bad).success, false);
  const duplicate = structuredClone(raw);
  duplicate.series.push(duplicate.series[0]);
  assert.equal(commercialTrendsSchema.safeParse(duplicate).success, false);
  const nd = structuredClone(raw);
  nd.series.find((row) => row.asistencias === 0).conversion = 0;
  assert.equal(commercialTrendsSchema.safeParse(nd).success, false);
});

test("trend proxy validates ranges, shares requests, forwards only trends parameters and exposes deployment errors safely", async () => {
  const { commercialTrendsApi } = require("../src/server/api/commercial-trends.api.server.ts");
  const backend = runtime("apps-script/vsl-commercial/API.gs");
  const payload = backend.run('COM_TRENDS_RESPONSE_("2026-10","2026-10")');
  const oldFetch = global.fetch,
    oldUrl = process.env.APPS_SCRIPT_URL_VSL;
  process.env.APPS_SCRIPT_URL_VSL = "https://script.google.com/macros/s/test/exec";
  let calls = 0;
  global.fetch = async (url) => {
    calls++;
    assert.equal(url.searchParams.get("action"), "commercial_trends");
    assert.equal(url.searchParams.get("from"), "2026-10");
    assert.equal(url.searchParams.get("to"), "2026-10");
    await new Promise((resolve) => setTimeout(resolve, 5));
    return Response.json(payload);
  };
  try {
    const invalid = await commercialTrendsApi(
      new Request("http://localhost/api?from=2026-01&to=2027-01"),
    );
    assert.equal(invalid.status, 400);
    assert.equal(calls, 0);
    const request = () => new Request("http://localhost/api?from=2026-10&to=2026-10");
    const responses = await Promise.all([
      commercialTrendsApi(request()),
      commercialTrendsApi(request()),
    ]);
    assert.equal(calls, 1);
    for (const response of responses) {
      assert.equal(response.status, 200);
      assert.equal((await response.json()).series.length, payload.series.length);
    }
    global.fetch = async () => Response.json({ success: false, error: "Acción no soportada" });
    const missing = await commercialTrendsApi(request());
    assert.equal(missing.status, 502);
    assert.match((await missing.json()).error, /todavía no tiene habilitadas/);
    global.fetch = async () => Response.json(payload);
    const wrong = await commercialTrendsApi(
      new Request("http://localhost/api?from=2026-09&to=2026-10"),
    );
    assert.equal(wrong.status, 502);
    assert.match((await wrong.json()).error, /otro período/);
  } finally {
    global.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.APPS_SCRIPT_URL_VSL;
    else process.env.APPS_SCRIPT_URL_VSL = oldUrl;
  }
});

test("monthly cache fallback preserves source counts, null versus zero, empty months and primary precedence", () => {
  const {
    trendsFromReports,
    selectTrendSource,
    trendClosers,
    trendCloserColor,
  } = require("../src/lib/commercial-trends.ts");
  const backend = runtime("apps-script/vsl-commercial/API.gs");
  const months = ["2026-11", "2026-10", "2026-09"];
  const reports = months.map((month) =>
    commercialSchema.parse(backend.run('COM_BUILD_("' + month + '")')),
  );
  const before = JSON.stringify(reports),
    fallback = trendsFromReports(reports, months);
  assert.deepEqual(fallback.months, ["2026-09", "2026-10", "2026-11"]);
  assert.equal(JSON.stringify(reports), before);
  assert.equal(fallback.series.find((row) => row.closer === "Ezequiel Dario").conversion, null);
  assert.equal(
    fallback.series.find((row) => row.closer === "Gabriel Eduardo Mora De Hoyos").conversion,
    0,
  );
  assert.equal(selectTrendSource(undefined, reports, months).source, "monthly");
  const primary = commercialTrendsSchema.parse(
    backend.run('COM_TRENDS_RESPONSE_("2026-09","2026-11")'),
  );
  assert.equal(selectTrendSource(primary, reports, months).source, "trends");
  const empty = { ...primary, series: [] };
  const selected = selectTrendSource(empty, reports, months);
  assert.equal(selected.source, "monthly");
  assert.ok(selected.data.series.length > 0);
  const altered = structuredClone(primary);
  altered.series[0].ventas += 1;
  assert.equal(selectTrendSource(altered, reports, months).source, "monthly");
  const added = commercialTrendsSchema.parse({
    ...primary,
    series: [
      ...primary.series,
      {
        month: "2026-10",
        product: " CÍRCULO MILLONARIO ",
        closer: " NUEVO CLOSER ",
        asistencias: 2,
        ventas: 1,
        conversion: 0.5,
      },
    ],
  });
  assert.ok(trendClosers(added, "CIRCULO MILLONARIO").includes("NUEVO CLOSER"));
  assert.equal(trendCloserColor("NUEVO CLOSER"), trendCloserColor(" NUEVO   CLOSER "));
  assert.ok(trendChartData(fallback, "CIRCULO MILLONARIO")[2].month === "2026-11");
  assert.equal(selectTrendSource(undefined, [], months).data, undefined);
});
test("primary failure diagnostics distinguish unsupported actions from transport and format failures", () => {
  const { trendFailureKind } = require("../src/lib/commercial-trends.ts");
  for (const [message, kind] of [
    ["El servicio todavía no tiene habilitadas las tendencias comerciales.", "UNSUPPORTED_ACTION"],
    ["La consulta excedió el tiempo de espera", "TIMEOUT"],
    ["El endpoint respondió HTTP 503", "HTTP"],
    ["JSON vacío o inválido", "INVALID_JSON"],
    ["Error CORS explícito", "CORS"],
    ["Error de red", "NETWORK"],
    ["Contrato inválido", "CONTRACT"],
  ])
    assert.equal(trendFailureKind(new Error(message)), kind);
});
