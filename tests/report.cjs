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
const vm = require("node:vm");
const { mapReconciliationResponse } = require("../src/server/mappers/reconciliation.mapper.ts");

test("Apps Script paid report: all/date/setter/closer/status/origin filters and detail-only search", () => {
  const headers = [
    "Nombre contacto",
    "Telefono",
    "Correo electrónico",
    "Secuencia",
    "Fase",
    "Fuente",
    "Asignado",
    "Setter asignado",
    "VSL Origen",
    "Estado de agenda",
    "Fecha de reunión",
  ];
  const record = (
    name,
    source,
    status,
    date,
    setter = "Ana",
    closer = "Pedro",
    origin = "Origen A",
  ) => [
    name,
    "00123",
    "test@example.com",
    "VSL | CLOSERS",
    "",
    source,
    closer,
    setter,
    origin,
    status,
    date,
  ];
  const rows = [
    record("Hoy asistió", "VSL FUNNEL", "Asistió", "2026-09-08"),
    record("Hoy sin estado", " vsl funnel ", "", "2026-09-08"),
    record("Ayer", "VSL FUNNEL", "No show", "2026-09-07", "Beto", "Luis", "Origen B"),
    record("Semana", "VSL FUNNEL", "Agendado CRM", "2026-09-02"),
    record("Anterior", "VSL FUNNEL", "Asistió", "2026-08-31"),
    record("Orgánico", "Orgánico", "Asistió", "2026-09-08"),
    record("WhatsApp", "WhatsApp", "Asistió", "2026-09-08"),
    record("Coincidencia parcial", "Otra fuente", "Asistió", "2026-09-08"),
  ];
  let values = [headers, ...rows];
  const ctx = vm.createContext({
    APP_CONFIG: { PIPELINE_NAME: "VSL | CLOSERS" },
    SHEET_GET_DATA_SHEET: () => ({
      getLastRow: () => values.length,
      getLastColumn: () => headers.length,
      getRange: () => ({ getValues: () => values }),
    }),
  });
  vm.runInContext(fs.readFileSync("apps-script/10_API.gs", "utf8"), ctx);
  const build = (filters) => JSON.parse(JSON.stringify(ctx.API_BUILD_VSL_REPORT(filters)));
  const scenarios = [
    [{}, 5, 2],
    [{ dateFrom: "2026-09-08", dateTo: "2026-09-08" }, 2, 1],
    [{ dateFrom: "2026-09-02", dateTo: "2026-09-08" }, 4, 1],
    [{ dateFrom: "2026-09-02", dateTo: "2026-09-07" }, 2, 0],
    [{ setter: "Ana" }, 4, 2],
    [{ closer: "Luis" }, 1, 0],
    [{ status: "Asistió" }, 2, 2],
    [{ vslOrigin: "Origen B" }, 1, 0],
    [{ setter: "Missing" }, 0, 0],
  ];
  for (const [filters, total, attended] of scenarios) {
    const raw = build(filters);
    const report = mapVslReportResponse({ ok: true, data: raw }, { ...query, ...filters });
    assert.equal(report.leadTypeKpis.totalLeads, total);
    assert.equal(report.leadTypeKpis.attended, attended);
    assert.equal(
      report.leadTypeKpis.attendanceRate,
      total ? +((attended / total) * 100).toFixed(2) : 0,
    );
    assert.equal(
      report.setters.reduce((sum, row) => sum + row.asistio, 0),
      attended,
    );
    assert.equal(
      report.setters.reduce((sum, row) => sum + row.total, 0),
      report.kpis.conEstadoAgenda,
    );
    assert.equal(
      report.kpis.tasaAsistencia,
      report.kpis.conEstadoAgenda
        ? +((attended / report.kpis.conEstadoAgenda) * 100).toFixed(2)
        : 0,
    );
    const searched = build({ ...filters, search: "Hoy asistió", pageSize: 1, page: 99 });
    assert.deepEqual(searched.leadTypeKpis, raw.leadTypeKpis);
    assert.deepEqual(searched.kpis, raw.kpis);
    assert.deepEqual(searched.setters, raw.setters);
    assert.ok(searched.detail.pagination.totalRecords <= 1);
    assert.equal(searched.detail.pagination.page, 1);
  }
  const noMatch = build({ search: "No existe" });
  assert.equal(noMatch.detail.pagination.totalRecords, 0);
  assert.equal(noMatch.leadTypeKpis.totalLeads, 5);
  const examples = [
    ["VSL FUNNEL", "paid"],
    ["vsl funnel", "paid"],
    ["META | VSL FUNNEL", "paid"],
    ["VSL FUNNEL - META ADS", "paid"],
    ["Campaña VSL FUNNEL Perú", "paid"],
    ["Organico", "organic"],
    ["ORGANICO | WHATSAPP", "organic"],
    ["ORGÁNICO", "organic"],
    ["Organico Facebook", "organic"],
    ["LEAD ORGANICO", "organic"],
    ["VSL FUNNEL ORGANICO", "paid"],
    ["WhatsApp", "other"],
    [null, "other"],
  ];
  const { getLeadType } = require("../src/server/mappers/lead-source.ts");
  for (const [source, expected] of examples) {
    assert.equal(ctx.API_GET_LEAD_TYPE(source), expected);
    assert.equal(getLeadType(source), expected);
  }
  values = [
    headers,
    ...examples.map(([source, type], i) =>
      record(String(i), source, "Asistió", "2026-09-08", type, type, type),
    ),
  ];
  for (const leadType of ["paid", "organic"]) {
    const raw = build({ leadType, dateFrom: "2026-09-08", dateTo: "2026-09-08" });
    const report = mapVslReportResponse({ ok: true, data: raw }, query);
    const expected = examples.filter(([, type]) => type === leadType).length;
    assert.equal(report.leadType, leadType);
    assert.equal(report.leadTypeKpis.totalLeads, expected);
    assert.equal(report.leadTypeKpis.attended, expected);
    assert.equal(
      report.setters.reduce((sum, r) => sum + r.asistio, 0),
      expected,
    );
    assert.deepEqual(report.availableSetters, [leadType]);
    assert.deepEqual(report.availableClosers, [leadType]);
    assert.deepEqual(report.availableOrigins, [leadType]);
  }
  assert.equal(build({ leadType: "invalid" }).leadType, "paid");
  values = [headers];
  assert.deepEqual(build({}).leadTypeKpis, { totalLeads: 0, attended: 0, attendanceRate: 0 });
  assert.throws(() => mapVslReportResponse({ ok: true, data: { report: "VSL | CLOSERS" } }, query));
});
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
      Fuente: "VSL FUNNEL",
      "Setter asignado": " Ana  Maria ",
      Asignado: "Pedro",
      "Estado de agenda": "Asistió",
      Telefono: "00123",
      "Correo electrónico": null,
    },
    { Secuencia: "OTHER", "Estado de agenda": "Asistió" },
    { Secuencia: "VSL | CLOSERS", Fuente: "VSL FUNNEL", "Estado de agenda": "__proto__" },
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
test("service and internal endpoint forward leadType with filters; missing/invalid values use paid", async () => {
  const { getVslClosersReport } = require("../src/services/reports.ts");
  const { reportApi } = require("../src/server/api/report.api.server.ts");
  const savedFetch = global.fetch;
  const savedUrl = process.env.APPS_SCRIPT_URL;
  const savedSecret = process.env.APPS_SCRIPT_SECRET;
  try {
    process.env.APPS_SCRIPT_URL = "https://example.com/exec";
    process.env.APPS_SCRIPT_SECRET = "test-only";
    global.fetch = async (url) => {
      const params = new URL(url, "https://local.test").searchParams;
      assert.equal(params.get("leadType"), "organic");
      assert.equal(params.get("setter"), "Ana");
      assert.equal(params.get("dateFrom"), "2026-08-01");
      return Response.json({});
    };
    await getVslClosersReport(
      { ...defaultFilters, leadType: "organic", setter: "Ana", dateFrom: "2026-08-01" },
      defaultDetail,
    );
    for (const [value, expected] of [
      ["organic", "organic"],
      ["paid", "paid"],
      ["invalid", "paid"],
      ["", "paid"],
    ]) {
      global.fetch = async (url) => {
        assert.equal(url.searchParams.get("leadType"), expected);
        assert.equal(url.searchParams.get("dateFrom"), "2026-08-01");
        return Response.json({
          ok: true,
          data: {
            report: "VSL | CLOSERS",
            leadType: expected,
            leadTypeKpis: { totalLeads: 0, attended: 0, attendanceRate: 0 },
          },
        });
      };
      const response = await reportApi(
        new Request(
          `https://local.test/api/reports/vsl-closers?dateFrom=2026-08-01${value ? `&leadType=${value}` : ""}`,
        ),
      );
      assert.equal(response.status, 200);
      assert.equal((await response.json()).leadType, expected);
    }
  } finally {
    global.fetch = savedFetch;
    if (savedUrl === undefined) delete process.env.APPS_SCRIPT_URL;
    else process.env.APPS_SCRIPT_URL = savedUrl;
    if (savedSecret === undefined) delete process.env.APPS_SCRIPT_SECRET;
    else process.env.APPS_SCRIPT_SECRET = savedSecret;
  }
});
const query = {
  leadType: "paid",
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
      leadType: "paid",
      leadTypeKpis: { totalLeads: "30", attended: "3", attendanceRate: "10" },
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
        leadType: "paid",
        kpis: {
          total: 999,
          agendadoCRM: "118",
          asistio: "188",
          cancelado: "95",
          noShow: "49",
          pendienteAgenda: "188",
          reagendado: "2",
        },
        leadTypeKpis: { totalLeads: 947, attended: 188, attendanceRate: 19.85 },
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
  const empty = mapVslReportResponse(
    {
      ok: true,
      data: {
        report: "VSL | CLOSERS",
        leadType: "paid",
        leadTypeKpis: { totalLeads: 0, attended: 0, attendanceRate: 0 },
      },
    },
    query,
  );
  for (const value of Object.values(empty.kpis)) assert.equal(value, 0);
});

test("both lead KPIs respect general filters and ignore detail pagination/search", () => {
  const base = {
    Secuencia: "VSL | CLOSERS",
    Fuente: "VSL FUNNEL",
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
const { mapSalesResponse } = require("../src/server/mappers/sales.mapper.ts");
const { SALES_STAGES } = require("../src/types/reports.ts");
const sale = (fase, name = "Contacto repetido") => ({
  fase,
  nombreContacto: name,
  setterAsignado: "Setter",
  closerAsignado: "Closer",
  fuente: "VSL FUNNEL",
  fechaReunion: "2026-09-08",
});
function salesFixture() {
  return {
    total: "5",
    byStage: [...SALES_STAGES]
      .reverse()
      .map((stage) => ({ stage, count: stage === SALES_STAGES[0] ? "2" : "1" })),
    rows: [...SALES_STAGES.map((stage) => sale(stage)), sale(SALES_STAGES[0])],
  };
}
test("sales preserves opportunities with repeated names, normalizes and orders stages", () => {
  const result = mapSalesResponse(salesFixture());
  assert.equal(result.total, 5);
  assert.deepEqual(
    result.byStage.map((r) => r.stage),
    SALES_STAGES,
  );
  assert.equal(
    result.byStage.reduce((sum, r) => sum + r.count, 0),
    result.total,
  );
  assert.equal(result.rows.length, result.total);
  assert.equal(result.rows[0].setterAsignado, "Setter");
  assert.equal(result.rows[0].closerAsignado, "Closer");
  assert.equal(result.rows.filter((r) => r.nombreContacto === "Contacto repetido").length, 5);
  const sparse = mapSalesResponse({
    total: 1,
    byStage: [{ stage: SALES_STAGES[0], count: 1 }],
    rows: [{ fase: SALES_STAGES[0], nombreContacto: null }],
  });
  assert.equal(sparse.rows[0].nombreContacto, "");
  assert.equal(sparse.rows[0].fuente, "");
  assert.equal(sparse.byStage.length, 4);
});
test("sales rejects inconsistent counts, invalid phases and duplicate summaries", () => {
  for (const update of [
    { total: 6 },
    { rows: [] },
    { byStage: [{ stage: SALES_STAGES[0], count: 5 }] },
    {
      byStage: [
        { stage: SALES_STAGES[0], count: 2 },
        { stage: SALES_STAGES[0], count: 3 },
      ],
    },
    { rows: [sale("Asistió")] },
    { total: -1 },
    { total: 1.5 },
  ])
    assert.throws(
      () => mapSalesResponse({ ...salesFixture(), ...update }),
      (e) => e.status === 502,
    );
  assert.equal(mapSalesResponse(undefined).total, 0);
  assert.deepEqual(mapSalesResponse({ total: 0, byStage: [], rows: [] }).rows, []);
});
test("report and endpoint carry sales through the same filtered GET, independent of detail page", async () => {
  const { reportApi } = require("../src/server/api/report.api.server.ts");
  const savedFetch = global.fetch,
    savedUrl = process.env.APPS_SCRIPT_URL,
    savedSecret = process.env.APPS_SCRIPT_SECRET;
  const base = {
    report: "VSL | CLOSERS",
    leadType: "paid",
    leadTypeKpis: { totalLeads: 5, attended: 0, attendanceRate: 0 },
  };
  assert.equal(mapVslReportResponse({ ok: true, data: base }, query).salesAvailable, false);
  try {
    process.env.APPS_SCRIPT_URL = "https://example.com/exec";
    process.env.APPS_SCRIPT_SECRET = "test-only";
    for (const leadType of ["paid", "organic"]) {
      let calls = 0;
      global.fetch = async (url) => {
        calls++;
        for (const [key, value] of Object.entries({
          leadType,
          dateFrom: "2026-09-01",
          dateTo: "2026-09-08",
          setter: "Setter",
          closer: "Closer",
          status: "No show",
          vslOrigin: "No agendado",
        }))
          assert.equal(url.searchParams.get(key), value);
        return Response.json({ ok: true, data: { ...base, leadType, sales: salesFixture() } });
      };
      const response = await reportApi(
        new Request(
          `https://local.test/api/reports/vsl-closers?leadType=${leadType}&dateFrom=2026-09-01&dateTo=2026-09-08&setter=Setter&closer=Closer&status=No%20show&vslOrigin=No%20agendado&pageSize=1&includeDetail=false`,
        ),
      );
      assert.equal(response.status, 200);
      const report = await response.json();
      assert.equal(calls, 1);
      assert.equal(report.sales.total, 5);
      assert.equal(report.sales.rows.length, 5);
      assert.equal(report.salesAvailable, true);
    }
  } finally {
    global.fetch = savedFetch;
    if (savedUrl === undefined) delete process.env.APPS_SCRIPT_URL;
    else process.env.APPS_SCRIPT_URL = savedUrl;
    if (savedSecret === undefined) delete process.env.APPS_SCRIPT_SECRET;
    else process.env.APPS_SCRIPT_SECRET = savedSecret;
  }
});
