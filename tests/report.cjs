const ts = require("typescript");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { test } = require("node:test");
require.extensions[".ts"] = (module, filename) => {
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename,
  );
};
const {
  mapSheetRowsToVslReport: map,
  defaultFilters,
  defaultDetail,
} = require("../src/server/mappers/vsl-report.mapper.ts");
const { developmentSheet } = require("../src/server/fixtures/vsl-development.ts");
const { mapReconciliationResponse } = require("../src/server/mappers/reconciliation.mapper.ts");
test("exact pivot example and zero-safe rates", () => {
  const report = map(developmentSheet().rows);
  assert.deepEqual(
    report.setters.map((r) => r.total),
    [12, 35, 24, 72, 25],
  );
  assert.deepEqual(report.kpis, {
    totalLeads: 168,
    conEstadoAgenda: 168,
    total: 168,
    agendadoCRM: 55,
    asistio: 60,
    cancelado: 39,
    noShow: 11,
    pendienteAgenda: 2,
    reagendado: 1,
    tasaAsistencia: 35.71,
    tasaNoShow: 6.55,
  });
  assert.equal(map([]).kpis.tasaAsistencia, 0);
});
test("setter is independent from closer; other sequences and unknown states", () => {
  const rows = [
    {
      Secuencia: " VSL | CLOSERS ",
      "Setter asignado": " Ana  Maria ",
      Asignado: "Pedro",
      "Estado de agenda": "Asistió",
      Telefono: "00123",
      "Correo electrónico": null,
    },
    { Secuencia: "OTHER", "Estado de agenda": "Asistió" },
    { Secuencia: "VSL | CLOSERS", "Estado de agenda": "__proto__" },
  ];
  const report = map(rows, defaultFilters, { ...defaultDetail, includeDetail: true });
  assert.equal(report.setters[0].setter, "Ana Maria");
  assert.equal(report.kpis.total, 1);
  assert.equal(report.unknownStatusCount, 1);
  assert.equal(report.detail.find((r) => r.telefono).telefono, "00123");
  assert.equal(map(rows, { ...defaultFilters, closer: "Pedro" }).kpis.total, 1);
  assert.equal(map(rows, { ...defaultFilters, setter: "Pedro" }).kpis.total, 0);
});
test("date boundaries in Lima, origin, status and paginated search", () => {
  const rows = developmentSheet().rows;
  assert.equal(map(rows, { ...defaultFilters, dateFrom: "2026-09-07" }).kpis.total, 0);
  const filtered = map(rows, {
    ...defaultFilters,
    setter: "Evelyn",
    estadoAgenda: "Asistió",
    vslOrigen: "No agendado",
  });
  assert.equal(filtered.kpis.total, 9);
  const paged = map(rows, defaultFilters, {
    ...defaultDetail,
    includeDetail: true,
    pageSize: 10,
    page: 2,
  });
  assert.equal(paged.detail.length, 10);
  assert.equal(paged.kpis.total, 168);
  const searched = map(rows, defaultFilters, {
    ...defaultDetail,
    includeDetail: true,
    search: "ejemplo1@example.com",
  });
  assert.equal(searched.detailTotal, 1);
  assert.equal(searched.kpis.total, 168);
  assert.equal(
    map([{ ...rows[0], "Fecha de reunión": "2026-09-07T02:00:00Z" }], {
      ...defaultFilters,
      dateFrom: "2026-09-06",
      dateTo: "2026-09-06",
    }).kpis.total,
    1,
  );
});
test("reconciliation maps numeric strings and rejects invalid responses", () => {
  const raw = {
    ok: true,
    timestamp: "2026-09-06T23:10:30.000Z",
    resultado: {
      revisadas: "930",
      nuevas: 1,
      modificadas: 0,
      sinCambios: 929,
      insertadas: 1,
      actualizadas: 0,
      errores: 0,
      segundos: 8.38,
    },
  };
  const result = mapReconciliationResponse(raw);
  assert.equal(result.reviewed, 930);
  assert.equal(result.durationSeconds, 8.38);
  assert.throws(() => mapReconciliationResponse({ ok: true }));
});
const { mapVslReportResponse } = require("../src/server/mappers/vsl-response.mapper.ts");
const {
  fetchVslReport,
  runVslReconciliation,
} = require("../src/server/adapters/apps-script.adapter.server.ts");
const { apiError } = require("../src/server/config/env.server.ts");
const query = {
  dateFrom: "2026-09-01",
  dateTo: "2026-09-07",
  setter: "Evelyn & Ana",
  status: "Asistió",
  vslOrigin: "No agendado",
  closer: "Pedro",
  search: "a+b",
  page: 2,
  pageSize: 25,
  includeDetail: true,
  sort: "nombreContacto",
  direction: "asc",
};
test("report response defaults, numeric strings, phone strings and pagination", () => {
  const raw = {
    ok: true,
    data: {
      report: "VSL | CLOSERS",
      kpis: { total: "10", asistio: "3", agendadoCRM: "7" },
      setters: [{ setter: "Ana" }],
      detail: {
        rows: [{ telefono: "00123", estadoAgenda: "Otro", correo: null }],
        pagination: { page: 2, totalRecords: 30 },
      },
      extra: "ignored",
    },
  };
  const result = mapVslReportResponse(raw, query);
  assert.equal(result.kpis.total, 10);
  assert.equal(result.kpis.totalLeads, 30);
  assert.equal(result.kpis.conEstadoAgenda, 10);
  assert.equal(result.kpis.tasaAsistencia, 30);
  assert.equal(result.setters[0].cancelado, 0);
  assert.equal(result.detail[0].telefono, "00123");
  assert.equal(result.detail[0].correo, "");
  assert.equal(result.detailPage, 2);
  assert.throws(() => mapVslReportResponse({ ok: false }, query));
  assert.throws(() => mapVslReportResponse({ ok: true, data: { report: "OTHER" } }, query));
});
test("real leads and classified leads are distinct; rates use the six agenda states", () => {
  const result = mapVslReportResponse(
    {
      ok: true,
      data: {
        report: "VSL | CLOSERS",
        kpis: {
          total: 999,
          agendadoCRM: "118",
          asistio: "188",
          cancelado: "95",
          noShow: "49",
          pendienteAgenda: "188",
          reagendado: "2",
        },
        detail: { pagination: { totalRecords: "947" } },
      },
    },
    { ...query, includeDetail: false },
  );
  assert.equal(result.kpis.totalLeads, 947);
  assert.equal(result.kpis.conEstadoAgenda, 640);
  assert.equal(result.kpis.total, 640);
  assert.equal(result.kpis.tasaAsistencia, 29.38);
  assert.equal(result.kpis.tasaNoShow, 7.66);
  assert.equal(result.detail.length, 0);
  const empty = mapVslReportResponse({ ok: true, data: { report: "VSL | CLOSERS" } }, query);
  for (const value of Object.values(empty.kpis)) assert.equal(value, 0);
});

test("both lead KPIs respect general filters and ignore detail pagination/search", () => {
  const base = {
    Secuencia: "VSL | CLOSERS",
    "Setter asignado": "Ana",
    Asignado: "Pedro",
    "VSL Origen": "Origen A",
    "Fecha de reunión": "2026-09-06",
  };
  const rows = [
    { ...base, "Estado de agenda": "Asistió", "Nombre contacto": "Uno" },
    { ...base, "Estado de agenda": "" },
    { ...base, "Estado de agenda": "Desconocido" },
    {
      ...base,
      "Setter asignado": "Beto",
      Asignado: "Luis",
      "VSL Origen": "Origen B",
      "Fecha de reunión": "2026-09-08",
      "Estado de agenda": "No show",
    },
  ];
  for (const filter of [
    { setter: "Ana" },
    { closer: "Pedro" },
    { vslOrigen: "Origen A" },
    { dateFrom: "2026-09-06", dateTo: "2026-09-06" },
  ]) {
    const result = map(rows, { ...defaultFilters, ...filter });
    assert.equal(result.kpis.totalLeads, 3);
    assert.equal(result.kpis.conEstadoAgenda, 1);
    assert.equal(result.setters[0].total, 1);
    assert.equal(result.kpis.tasaAsistencia, 100);
  }
  const classified = map(rows, { ...defaultFilters, estadoAgenda: "Asistió" });
  assert.equal(classified.kpis.totalLeads, 1);
  assert.equal(classified.kpis.conEstadoAgenda, 1);
  const searched = map(rows, defaultFilters, { ...defaultDetail, search: "Uno", pageSize: 1 });
  assert.equal(searched.kpis.totalLeads, 4);
  assert.equal(searched.kpis.conEstadoAgenda, 2);
  assert.equal(searched.detailTotal, 1);
  const empty = map(rows, { ...defaultFilters, setter: "Missing" });
  for (const value of Object.values(empty.kpis)) assert.equal(value, 0);
});
test("central adapter forwards only allowed params and sanitizes upstream failures", async () => {
  const previousFetch = global.fetch;
  const previousUrl = process.env.APPS_SCRIPT_URL,
    previousSecret = process.env.APPS_SCRIPT_SECRET;
  process.env.APPS_SCRIPT_URL = "https://example.com/exec";
  process.env.APPS_SCRIPT_SECRET = "test-only-sentinel";
  try {
    global.fetch = async (url, options) => {
      assert.equal(url.searchParams.get("key"), "test-only-sentinel");
      if (options.method === "GET") {
        assert.equal(url.searchParams.get("action"), "vsl_report");
        assert.equal(url.searchParams.get("setter"), query.setter);
        assert.equal(url.searchParams.get("status"), "Asistió");
        assert.equal(url.searchParams.get("page"), "2");
        assert.equal(url.searchParams.has("sort"), false);
      } else assert.equal(url.searchParams.get("action"), "vsl_reconciliar");
      assert.ok(options.signal);
      return Response.json({ ok: true });
    };
    await fetchVslReport(query);
    await runVslReconciliation();
    for (const response of [
      new Response(""),
      new Response("<html>bad</html>"),
      Response.json({ ok: false, message: "test-only-sentinel" }),
      new Response("", { status: 500 }),
    ]) {
      global.fetch = async () => response;
      await assert.rejects(
        fetchVslReport(query),
        (e) => e.status === 502 && !e.message.includes("test-only-sentinel"),
      );
    }
    global.fetch = async () => {
      throw new Error("test-only-sentinel");
    };
    await assert.rejects(fetchVslReport(query), (e) => !e.message.includes("test-only-sentinel"));
    delete process.env.APPS_SCRIPT_SECRET;
    await assert.rejects(fetchVslReport(query), (e) => e.status === 503);
  } finally {
    global.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.APPS_SCRIPT_URL;
    else process.env.APPS_SCRIPT_URL = previousUrl;
    if (previousSecret === undefined) delete process.env.APPS_SCRIPT_SECRET;
    else process.env.APPS_SCRIPT_SECRET = previousSecret;
  }
});
