const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function loadService(
  fetch,
  env = {
    APPS_SCRIPT_URL: "https://script.google.com/macros/s/test/exec",
    APPS_SCRIPT_SECRET: "test-only",
  },
) {
  const exports = {};
  const source = fs
    .readFileSync("src/services/reportApi.ts", "utf8")
    .replaceAll("import.meta.env", "env");
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    { exports, fetch, env, URL, URLSearchParams },
  );
  return exports.getVslReport;
}
const report = () => ({
  report: "VSL",
  leadType: "all",
  leadTypeLabel: "Todos",
  updatedAt: "2026-09-18T12:00:00Z",
  filters: { applied: {}, available: {} },
  pipelineSummary: { vsl: { totalLeads: 10 } },
  pagination: { page: 1, pageSize: 25, totalDetail: 0, totalPages: 0 },
  kpis: { total: 10, confirmado: 2, asistio: 3, cancelado: 1, noShow: 4, tasaAsistencia: 37.5, tasaNoShow: 40 },
  setters: [],
  detail: [],
  sales: { total: 0, byStage: [], cashByCurrency: [], productSummary: [], salesValueByCurrency: [], rows: [] },
});

test("direct GET sends the contract defaults and returns only data, including empty detail", async () => {
  const expected = report();
  const get = loadService(async (url, options) => {
    assert.equal(url.origin, "https://script.google.com");
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      action: "vsl_report",
      frontend_secret: "test-only",
      leadType: "all",
      pipeline: "all",
      calendar: "",
      dateFrom: "",
      dateTo: "",
      setter: "",
      closer: "",
      status: "",
      vslOrigin: "",
      search: "",
      page: "1",
      pageSize: "25",
    });
    assert.equal(options.cache, "no-store");
    return Response.json({ ok: true, data: expected, kpis: { total: 999 } });
  });
  assert.deepEqual(await get(), expected);
});

test("filters and cancellation are forwarded without losing encoded characters", async () => {
  const filters = {
    leadType: "paid",
    pipeline: "vsl",
    calendar: "A & B",
    dateFrom: "2026-09-01",
    dateTo: "2026-09-18",
    setter: "José",
    closer: "Ana",
    status: "Asistió",
    vslOrigin: "ORG",
    search: "a+b@example.com",
    page: 2,
    pageSize: 50,
  };
  const controller = new AbortController();
  await loadService(async (url, options) => {
    for (const [key, value] of Object.entries(filters))
      assert.equal(url.searchParams.get(key), String(value));
    assert.equal(options.signal, controller.signal);
    return Response.json({ ok: true, data: report() });
  })(filters, controller.signal);
});

test("rejects API errors even with HTTP 200, HTTP errors, malformed JSON and root-level payloads", async () => {
  for (const [response, message] of [
    [Response.json({ ok: false, error: "Unauthorized" }), /Unauthorized/],
    [Response.json({ ok: true, data: report() }, { status: 503 }), /No se pudo/],
    [new Response("<html>Login</html>"), /JSON válida/],
    [Response.json({ ok: true, ...report() }), /dentro de data/],
  ])
    await assert.rejects(loadService(async () => response)(), message);
});

function loadView() {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/services/reportView.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports });
  return exports.toReportView;
}

test("maps the real pagination, applied filters and available options without recomputing aggregates", async () => {
  const payload = report();
  payload.leadType = "paid";
  payload.pagination = { page: 3, pageSize: 25, totalDetail: 86, totalPages: 4 };
  payload.filters = {
    applied: { pipeline: "vsl", status: "Asistió", vslOrigin: "Anuncio" },
    available: { setters: ["Ana"], closers: ["Luis"], origins: ["Anuncio"], calendars: ["Calendar"], statuses: ["Asistió"] },
  };
  payload.detail = [{ nombreContacto: "Cliente" }];
  payload.sales.total = 7;
  const data = await loadService(async () => Response.json({ ok: true, data: payload }))();
  const view = loadView()(data, { leadType: "all", pipeline: "all" }, 1);
  assert.equal(view.detailPage, 3);
  assert.equal(view.detailTotal, 86);
  assert.equal(view.detailTotalKnown, true);
  assert.equal(view.leadType, "paid");
  assert.equal(view.filters.pipeline, "vsl");
  assert.equal(view.filters.estadoAgenda, "Asistió");
  assert.equal(view.filters.vslOrigen, "Anuncio");
  assert.deepEqual(view.availableSetters, ["Ana"]);
  assert.equal(view.kpis.tasaAsistencia, 37.5);
  assert.equal(view.kpis.tasaNoShow, 40);
  assert.equal(view.sales.total, 7);
  assert.equal(view.detail, data.detail);
  assert.equal(view.pipelineSummary, data.pipelineSummary);
  assert.equal(view.pagination, data.pagination);
});

test("accepts successful reports with empty or omitted collection fields", async () => {
  const payload = report();
  payload.sales = { total: 0 };
  const data = await loadService(async () => Response.json({ ok: true, data: payload }))();
  const view = loadView()(data, { leadType: "all" }, 1);
  assert.equal(view.detail.length, 0);
  assert.equal(view.setters.length, 0);
  for (const key of ["byStage", "cashByCurrency", "productSummary", "salesValueByCurrency", "rows"])
    assert.equal(view.sales[key].length, 0);
});

test("missing configuration produces an actionable error without fetching", async () => {
  await assert.rejects(
    loadService(() => assert.fail("must not fetch"), {})(),
    /APPS_SCRIPT_URL/,
  );
});
