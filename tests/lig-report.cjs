const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename,
    "commonjs",
  );
const { reportApi } = require("../src/server/api/report.api.server.ts");
const { getVslClosersReport, readResponse } = require("../src/services/reports.ts");
const { getPipelineCardMetrics } = require("../src/lib/pipeline-summary.ts");

const calendars = ["Lanzamiento Interno Gratuito - EM", "Lanzamiento Interno Gratuito - CM"];
const summary = (leads, appointments, attended) => ({
  totalLeads: leads,
  conCitaCalendar: appointments,
  estados: { asistio: attended },
});
const payload = () => ({
  ok: true,
  data: {
    report: "VSL | Closers + OEI + LIG",
    filters: {
      available: {
        calendars,
        setters: ["Setter Opportunity"],
        bookers: ["Creador OEI", "Creador LIG"],
        closers: ["Closer Calendar"],
        statuses: ["Asistió"],
      },
    },
    pipelineSummary: { vsl: summary(4, 3, 2), oei: summary(6, 5, 4), lig: summary(8, 7, 6) },
    appointmentPeople: {
      oeiBookers: [{ agendador: "Persona compartida", total: 2 }],
      ligBookers: [{ agendador: "Persona compartida", total: 3 }],
      bookers: [
        { agendador: "Persona compartida", total: 2 },
        { agendador: "Persona compartida", total: 3 },
      ],
      closers: [{ closer: "Closer Calendar", total: 5 }],
    },
    kpis: { total: 15, asistio: 12, tasaAsistencia: 80 },
    detail: {
      rows: [
        {
          pipeline: "lig",
          nombreContacto: "Contacto LIG",
          setterAsignado: "Setter Opportunity",
          agendadorCita: "Creador LIG",
          createdByUserName: "Creador LIG",
          closerCita: "Closer Calendar",
          closerAsignado: "Closer Calendar",
          calendarioCita: calendars[0],
          estadoAgenda: "Asistió",
        },
      ],
      pagination: { page: 2, pageSize: 1, totalRecords: 4, totalPages: 4 },
    },
  },
});
const request = (params = {}) =>
  new Request(`http://local.test/api/reports/vsl-closers?${new URLSearchParams(params)}`);
function setup(t) {
  const saved = { ...process.env };
  const fetch = global.fetch;
  process.env.APPS_SCRIPT_URL = "https://script.google.com/macros/s/test/exec";
  process.env.APPS_SCRIPT_SECRET = "private-test-secret";
  process.env.NODE_ENV = "development";
  delete process.env.REPORTS_DEBUG;
  t.after(() => {
    global.fetch = fetch;
    for (const key of ["APPS_SCRIPT_URL", "APPS_SCRIPT_SECRET", "NODE_ENV", "REPORTS_DEBUG"])
      saved[key] === undefined ? delete process.env[key] : (process.env[key] = saved[key]);
  });
}

test("all/vsl/oei/lig preserve the existing endpoint, parameters and envelope mapping", async (t) => {
  setup(t);
  for (const pipeline of ["all", "vsl", "oei", "lig"]) {
    const params = {
      pipeline,
      calendar: calendars[0],
      setter: "Setter Opportunity",
      booker: "José & Ana",
      closer: "Closer Calendar",
      status: "Asistió",
      dateFrom: "2026-09-01",
      dateTo: "2026-09-25",
      search: "a+b@example.com",
      page: "2",
      pageSize: "1",
      sort: "nombreContacto",
      direction: "desc",
      includeDetail: "true",
      vslOrigin: "",
      leadType: "all",
    };
    global.fetch = async (url, options) => {
      assert.equal(options.redirect, "follow");
      assert.equal(options.method, "GET");
      assert.equal(url.searchParams.get("action"), "vsl_report");
      assert.equal(url.searchParams.get("key"), "private-test-secret");
      for (const [key, value] of Object.entries(params))
        assert.equal(
          url.searchParams.get(key),
          key === "leadType" && pipeline !== "vsl" ? null : value,
        );
      return Response.json(payload());
    };
    const response = await reportApi(request(params));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.filters.pipeline, pipeline);
    assert.equal(body.detailPage, 2);
    assert.equal(body.detailTotal, 4);
    assert.equal(body.detail[0].setterAsignado, "Setter Opportunity");
    assert.equal(body.detail[0].agendadorCita, "Creador LIG");
    assert.equal(body.detail[0].closerCita, "Closer Calendar");
    assert.deepEqual(body.availableCalendars, calendars);
    assert.deepEqual(body.availableBookers, ["Creador OEI", "Creador LIG"]);
    assert.deepEqual(body.appointmentPeople.ligBookers, [{ name: "Persona compartida", total: 3 }]);
    assert.deepEqual(body.appointmentPeople.bookers, [{ name: "Persona compartida", total: 5 }]);
  }
});

test("Todos includes LIG metrics and supports older two-pipeline summaries", () => {
  const result = getPipelineCardMetrics(payload().data.pipelineSummary, "all");
  assert.equal(result.totalLeads, 18);
  assert.equal(result.totalAppointments, 15);
  assert.equal(result.attended, 12);
  assert.equal(result.attendanceRate, 80);
  assert.equal(getPipelineCardMetrics(payload().data.pipelineSummary, "lig").totalLeads, 8);
  assert.equal(
    getPipelineCardMetrics({ vsl: summary(1, 1, 1), oei: summary(2, 2, 2) }, "all").totalLeads,
    3,
  );
});

test("includeDetail=false performs one request and retains aggregates with no detail rows", async (t) => {
  setup(t);
  let calls = 0;
  global.fetch = async (url) => {
    calls++;
    assert.equal(url.searchParams.get("includeDetail"), "false");
    return Response.json(payload());
  };
  const body = await (await reportApi(request({ pipeline: "lig" }))).json();
  assert.equal(calls, 1);
  assert.deepEqual(body.detail, []);
  assert.equal(body.kpis.total, 15);
  assert.equal(body.detailTotal, 4);
});

test("Sheet execution errors remain 502 and retain the real HTTP 200 in development", async (t) => {
  setup(t);
  global.fetch = async () =>
    Response.json({ ok: false, error: "No se encontró la columna: Secuencia" });
  const response = await reportApi(request({ pipeline: "all" }));
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.upstreamStatus, 200);
  assert.match(body.contentType, /application\/json/);
  assert.match(body.details, /No se encontró la columna: Secuencia/);
  await assert.rejects(readResponse(Response.json(body, { status: 502 })), /Secuencia/);
});

test("HTTP errors, HTML, invalid JSON, network errors and invalid envelopes remain failures", async (t) => {
  setup(t);
  for (const response of [
    new Response("Unavailable", { status: 503 }),
    new Response("<html>Login</html>", { headers: { "content-type": "text/html" } }),
    new Response("{invalid"),
    Response.json(null),
    Response.json({ ok: true }),
  ]) {
    global.fetch = async () => response;
    const result = await reportApi(request());
    assert.equal(result.status, 502);
  }
  global.fetch = async () => {
    throw new Error("Network failed private-test-secret");
  };
  const result = await reportApi(request());
  assert.equal(result.status, 502);
  const body = await result.text();
  assert.match(body, /Network failed/);
  assert.doesNotMatch(body, /private-test-secret/);
});

test("diagnostics redact secrets and production does not expose upstream bodies", async (t) => {
  setup(t);
  global.fetch = async () =>
    Response.json({ ok: false, error: "private-test-secret", token: "other-secret" });
  let body = await (await reportApi(request())).text();
  assert.doesNotMatch(body, /private-test-secret|other-secret/);
  process.env.NODE_ENV = "production";
  body = await (await reportApi(request())).json();
  assert.deepEqual(body, { message: "Apps Script request failed" });
});

test("bad pipelines, dates and pagination fail before calling Apps Script", async (t) => {
  setup(t);
  global.fetch = () => assert.fail("must validate first");
  for (const params of [
    { pipeline: "unknown" },
    { dateFrom: "2026-02-30" },
    { dateFrom: "2026-09-25", dateTo: "2026-09-01" },
    { page: "0" },
    { pageSize: "101" },
  ])
    assert.equal((await reportApi(request(params))).status, 400);
});

test("timeouts remain 504 and optional debug logs never include the credential", async (t) => {
  setup(t);
  const savedTimer = global.setTimeout;
  const savedLog = console.info;
  const logs = [];
  t.after(() => {
    global.setTimeout = savedTimer;
    console.info = savedLog;
  });
  process.env.REPORTS_DEBUG = "true";
  console.info = (...args) => logs.push(args.join(" "));
  global.setTimeout = (fn, ms) => savedTimer(fn, ms === 15000 ? 0 : ms);
  global.fetch = (_url, options) =>
    new Promise((_resolve, reject) =>
      options.signal.addEventListener("abort", () =>
        reject(new Error("Aborted private-test-secret")),
      ),
    );
  const result = await reportApi(request({ pipeline: "lig" }));
  assert.equal(result.status, 504);
  assert.match(logs.join("\n"), /Apps Script URL/);
  assert.doesNotMatch(logs.join("\n"), /private-test-secret/);
  assert.doesNotMatch(await result.text(), /private-test-secret/);
});

test("pipeline selector exposes LIG and uses supplied calendars, creators and statuses", () => {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync("src/components/reports/DashboardFilters.tsx", "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    { exports, require },
  );
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const html = renderToStaticMarkup(
    React.createElement(exports.DashboardFilters, {
      filters: {
        pipeline: "lig",
        dateFrom: "",
        dateTo: "",
        setter: "",
        booker: "",
        closer: "",
        estadoAgenda: "",
        vslOrigen: "",
      },
      calendars,
      statuses: ["Asistió"],
      setters: ["Setter Opportunity"],
      bookers: ["Creador LIG"],
      closers: ["Closer Calendar"],
      origins: [],
      vslTipoFiltro: "all",
      onChange() {},
      onPreset() {},
      onClear() {},
      onVslTipoChange() {},
    }),
  );
  assert.match(html, /value="lig" selected=""/);
  for (const name of [
    ...calendars,
    "Setter Opportunity",
    "Creador LIG",
    "Closer Calendar",
    "Creado por cita",
  ])
    assert.ok(html.includes(name), name);
  assert.doesNotMatch(html, /VSL Origen|Llamada de Claridad|value="Confirmado"/);
});

test("browser client keeps booker separate and encodes accents, + and &", async (t) => {
  setup(t);
  global.fetch = async (input) => {
    const url = new URL(input, "http://local.test");
    assert.equal(url.pathname, "/api/reports/vsl-closers");
    assert.equal(url.searchParams.get("pipeline"), "lig");
    assert.equal(url.searchParams.get("setter"), "Setter Opportunity");
    assert.equal(url.searchParams.get("booker"), "José & Ana");
    assert.equal(url.searchParams.get("closer"), "Closer Calendar");
    assert.equal(url.searchParams.get("search"), "a+b@example.com");
    assert.equal(url.searchParams.has("leadType"), false);
    assert.equal(url.searchParams.has("preset"), false);
    return Response.json({});
  };
  await getVslClosersReport(
    {
      pipeline: "lig",
      setter: "Setter Opportunity",
      booker: "José & Ana",
      closer: "Closer Calendar",
      preset: "todos",
      leadType: "all",
      estadoAgenda: "Asistió",
      vslOrigen: "",
    },
    {
      includeDetail: true,
      search: "a+b@example.com",
      page: 2,
      pageSize: 1,
      sort: "nombreContacto",
      direction: "desc",
    },
  );
});

// Optional integration against the user's unchanged Apps Script source.
// APPS_SCRIPT_CONTRACT_PATH points to the supplied file; no Google Sheet is modified.
test(
  "unchanged supplied Apps Script: three pipelines, filters, dates, pagination and missing header",
  {
    skip: !process.env.APPS_SCRIPT_CONTRACT_PATH,
  },
  async (t) => {
    setup(t);
    const source = fs.readFileSync(process.env.APPS_SCRIPT_CONTRACT_PATH, "utf8");
    const headers = [...source.matchAll(/API_HEADER_INDEX\(\s*headers,\s*"([^"]+)"/g)].map(
      (match) => match[1],
    );
    const pipelines = {
      VSL_CLOSERS: { name: "VSL | Closers" },
      OEI_EM: { name: "Lanzamiento I. Pagado OEI - EM" },
      LIG: { name: "Lanzamiento Interno Gratuito" },
    };
    const definitions = [
      ["VSL", pipelines.VSL_CLOSERS.name, "Llamada de Claridad CM [A]"],
      ["OEI", pipelines.OEI_EM.name, "Equipo Millonario | OEI"],
      ["LIG EM", pipelines.LIG.name, calendars[0]],
      ["LIG CM", pipelines.LIG.name, calendars[1]],
    ];
    let sheetHeaders = [...headers];
    const rows = definitions.map(([name, pipeline, calendar]) => {
      const row = {
        "Nombre contacto": name,
        Telefono: "123456789",
        "Correo electrónico": `${name}@example.test`,
        Secuencia: pipeline,
        "Creado el": "2026-08-10",
        "Fecha cita": "2026-09-12",
        "Setter asignado": "Setter Opportunity",
        "Creado por cita": `Creador ${name}`,
        "Closer cita": "Closer Calendar",
        Asignado: "Closer Opportunity",
        "Calendario cita": calendar,
        "Estado cita": "showed",
        Fuente: "VSL FUNNEL",
      };
      return headers.map((header) => row[header] ?? "");
    });
    const context = vm.createContext({
      console: { log() {}, warn() {}, error() {} },
      GHL_PIPELINES: pipelines,
      PropertiesService: {
        getScriptProperties: () => ({ getProperty: () => "private-test-secret" }),
      },
      ContentService: {
        MimeType: { JSON: "application/json" },
        createTextOutput: (text) => ({ setMimeType: () => JSON.parse(text) }),
      },
      Session: { getScriptTimeZone: () => "America/Lima" },
      Utilities: { formatDate: (date) => date.toISOString().slice(0, 10) },
      SHEET_GET_DATA_SHEET: () => ({
        getLastRow: () => rows.length + 1,
        getLastColumn: () => headers.length,
        getRange: () => ({ getValues: () => [sheetHeaders, ...rows] }),
      }),
    });
    vm.runInContext(source, context);
    global.fetch = async (url) =>
      Response.json(context.doGet({ parameter: Object.fromEntries(url.searchParams) }));
    const read = async (params) => {
      const response = await reportApi(request({ includeDetail: "true", ...params }));
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      return body;
    };
    for (const [pipeline, expected] of [
      ["all", 4],
      ["vsl", 1],
      ["oei", 1],
      ["lig", 2],
    ]) {
      const body = await read({ pipeline });
      assert.equal(body.detailTotal, expected, pipeline);
      if (pipeline !== "all") assert.ok(body.detail.every((row) => row.pipeline === pipeline));
    }
    const lig = await read({ pipeline: "lig" });
    assert.deepEqual([...lig.availableCalendars].sort(), [...calendars].sort());
    assert.deepEqual([...lig.availableBookers].sort(), ["Creador LIG CM", "Creador LIG EM"]);
    assert.equal(lig.detail[0].setterAsignado, "Setter Opportunity");
    assert.equal(lig.detail[0].closerCita, "Closer Calendar");
    for (const [filter, value, expected] of [
      ["setter", "Setter Opportunity", 2],
      ["setter", "Creador LIG EM", 0],
      ["booker", "Creador LIG EM", 1],
      ["booker", "Setter Opportunity", 0],
      ["closer", "Closer Calendar", 2],
      ["calendar", calendars[1], 1],
      ["status", "Asistió", 2],
      ["search", "LIG EM", 1],
    ])
      assert.equal(
        (await read({ pipeline: "lig", [filter]: value })).detailTotal,
        expected,
        filter,
      );
    const period = await read({ pipeline: "lig", dateFrom: "2026-09-01", dateTo: "2026-09-25" });
    assert.equal(period.kpis.total, 2); // Appointment date, not opportunity creation date.
    assert.equal(period.detailTotal, 0); // The supplied API dates detail by Creado el.
    const paged = await read({
      pipeline: "lig",
      page: "2",
      pageSize: "1",
      sort: "nombreContacto",
      direction: "desc",
    });
    assert.equal(paged.detailPage, 2);
    assert.equal(paged.detailTotal, 2);
    assert.equal(paged.detail.length, 1);
    for (const direction of ["asc", "desc"]) {
      const body = await read({ pipeline: "lig", sort: "nombreContacto", direction });
      assert.equal(body.detail[0].nombreContacto, direction === "asc" ? "LIG CM" : "LIG EM");
    }
    sheetHeaders = headers.map((header) => (header === "Secuencia" ? "Pipeline" : header));
    const failure = await reportApi(request({ pipeline: "lig" }));
    assert.equal(failure.status, 502);
    assert.match((await failure.json()).details, /No se encontró la columna: Secuencia/);
  },
);
