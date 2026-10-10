const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename,
  );
const {
  EMPTY_REPORT_FILTERS: empty,
  REPORT_CLOSERS,
  isReportCloser,
  rangeForPreset,
  isValidReportRange,
  changeReportFilters,
} = require("../src/lib/report-filter-state.ts");
const { getSetterOptions } = require("../src/lib/setter-performance.ts");
const { getVslClosersReport, appointmentDetailFilters } = require("../src/services/reports.ts");

test("closer selector exposes only the three authorized names regardless of API options", () => {
  const vm = require("node:vm");
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync("src/components/reports/DashboardFilters.tsx", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      exports,
      require(name) {
        if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
        if (name.includes("report-filter-state"))
          return require("../src/lib/report-filter-state.ts");
        if (name.includes("setter-performance")) return require("../src/lib/setter-performance.ts");
        return new Proxy({}, { get: (_, key) => key });
      },
    },
  );
  const visit = (node) => {
    if (!node || typeof node !== "object") return [];
    return [node, ...[node.props?.children].flat(Infinity).flatMap(visit)];
  };
  for (const pipeline of ["all", "vsl", "oei", "lig"]) {
    const changes = [];
    const tree = exports.DashboardFilters({
      filters: { ...empty, pipeline },
      setters: [],
      bookers: [],
      closers: ["Other", "historicalID123456789012345"],
      origins: [],
      calendars: [],
      statuses: [],
      onChange: (value) => changes.push(value),
      onPreset: () => {},
      onClear: () => {},
    });
    const closer = visit(tree).find(
      (node) => node.type === "SearchableFilter" && node.props.label === "Closer",
    );
    assert.deepEqual(
      Array.from(closer.props.options, (option) => option.value),
      ["Fiorela Bernales", "Ezequiel Dario", "Amaranta Alfonso Krasnova"],
    );
    for (const name of REPORT_CLOSERS) {
      assert.equal(isReportCloser(name), true);
      closer.props.onChange(name);
      assert.equal(changes.at(-1).closer, name);
    }
    assert.equal(isReportCloser("Other"), false);
  }
});

test("calendar presets handle Lima midnight, year rollover and leap February", () => {
  assert.deepEqual(rangeForPreset("mesPasado", new Date("2026-10-06T17:00:00Z")), {
    dateFrom: "2026-09-01",
    dateTo: "2026-09-30",
  });
  assert.deepEqual(rangeForPreset("mes", new Date("2026-10-01T04:59:59Z")), {
    dateFrom: "2026-09-01",
    dateTo: "2026-09-30",
  });
  assert.deepEqual(rangeForPreset("mesPasado", new Date("2026-01-06T17:00:00Z")), {
    dateFrom: "2025-12-01",
    dateTo: "2025-12-31",
  });
  assert.deepEqual(rangeForPreset("mesPasado", new Date("2024-03-06T17:00:00Z")), {
    dateFrom: "2024-02-01",
    dateTo: "2024-02-29",
  });
  assert.deepEqual(rangeForPreset("mes", new Date("2026-10-06T17:00:00Z")), {
    dateFrom: "2026-10-01",
    dateTo: "2026-10-06",
  });
  for (const [from, to, valid] of [
    ["", "", true],
    ["2026-09-01", "2026-09-01", true],
    ["2026-10-01", "2026-09-01", false],
    ["2026-02-30", "", false],
    ["invalid", "", false],
  ])
    assert.equal(isValidReportRange({ dateFrom: from, dateTo: to }), valid);
});
test("pipeline transitions migrate person and preserve closer/dates while clearing VSL-only fields", () => {
  let state = {
    ...empty,
    pipeline: "vsl",
    setter: "Evelyn Lopez Horna",
    closer: "Fiorela Bernales",
    dateFrom: "2026-09-01",
    dateTo: "2026-09-30",
    preset: "mesPasado",
    leadType: "paid",
    vslOrigen: "origin",
    vslTipo: "paid",
  };
  state = changeReportFilters(state, { closer: "Fiorela Bernales" });
  assert.equal(state.setter, "Evelyn Lopez Horna");
  for (const pipeline of ["oei", "lig", "all", "vsl"]) {
    state = changeReportFilters(state, { pipeline });
    assert.equal(state.closer, "Fiorela Bernales");
    assert.equal(state.dateFrom, "2026-09-01");
    assert.equal(state.dateTo, "2026-09-30");
    assert.equal(
      state[["oei", "lig"].includes(pipeline) ? "booker" : "setter"],
      "Evelyn Lopez Horna",
    );
    assert.equal(state.vslOrigen, "");
    assert.equal(state.leadType, "all");
    assert.equal(state.vslTipo, undefined);
  }
});
test("searchable canonical options retain all exact source names and whitelist", () => {
  const options = getSetterOptions([
    "Jose Luis",
    "Jose Luis Botto Garcia",
    "Evelyn",
    "Evelyn Lopez Horna",
    "Sin setter",
    "Joseph",
    "Carla",
  ]);
  assert.equal(options.length, 6);
  assert.deepEqual(options.find((x) => x.value === "Jose Luis Botto Garcia").sourceNames, [
    "Jose Luis",
    "Jose Luis Botto Garcia",
  ]);
});

function report(filters, n) {
  return {
    filters,
    kpis: { total: n, asistio: n / 2, noShow: 0, totalLeads: n * 10 },
    leadTypeKpis: { totalLeads: n * 10, totalAppointments: n + 1, attended: n / 2 },
    setters: [{ setter: filters.setter || filters.booker, total: n, asistio: n / 2 }],
    pipelineSummary: {
      vsl: {
        key: "vsl",
        totalLeads: n * 10,
        conCitaCalendar: n,
        sinCitaCalendar: n * 9,
        estados: { asistio: n / 2 },
        calendars: [{ calendar: "c", count: n }],
      },
    },
    appointmentPeople: { oeiBookers: [], ligBookers: [], closers: [], bookers: [] },
    sales: {
      total: 2,
      byStage: [{ stage: "Venta Confirmada/Reserva", count: 2 }],
      cashByCurrency: [{ currency: "USD", amount: 40 }],
      salesValueByCurrency: [{ currency: "USD", salesValue: 100, cashCollected: 40 }],
      productSummary: [
        {
          producto: "Curso",
          moneda: "USD",
          ticket: 50,
          cantidad: 2,
          valorVenta: 100,
          cashRecaudado: 40,
        },
      ],
      rows: [{ id: filters.setter || filters.booker, fechaCita: "2026-09-04" }],
    },
    salesAvailable: true,
    availableSetters: [],
    availableBookers: [],
    availableClosers: [],
    availableOrigins: [],
    availableCalendars: [],
    availableStatuses: [],
    detailTotal: n,
    detail: [],
  };
}
test("exact alias queries combine API aggregates while preserving AND filters and sales meeting dates", async (t) => {
  const saved = global.fetch;
  t.after(() => (global.fetch = saved));
  const requests = [];
  global.fetch = async (url) => {
    const q = Object.fromEntries(new URL(url, "http://local").searchParams);
    requests.push(q);
    return Response.json(report(q, q.setter === "Evelyn" ? 10 : 2));
  };
  const filters = {
    ...empty,
    pipeline: "vsl",
    setter: "Evelyn Lopez Horna",
    closer: "Fiorela Bernales",
    dateFrom: "2026-09-01",
    dateTo: "2026-09-30",
    calendar: "c",
    estadoAgenda: "Asistió",
    vslOrigen: "origin",
    leadType: "paid",
    preset: "mesPasado",
  };
  const detail = {
    includeDetail: false,
    page: 1,
    pageSize: 25,
    search: "",
    sort: "nombreContacto",
    direction: "asc",
  };
  const result = await getVslClosersReport(filters, detail, undefined, [
    "Evelyn",
    "Evelyn Lopez Horna",
    "Evelyn",
  ]);
  assert.equal(requests.length, 2);
  for (const q of requests) {
    assert.equal(q.closer, filters.closer);
    assert.equal(q.dateFrom, filters.dateFrom);
    assert.equal(q.dateTo, filters.dateTo);
    assert.equal(q.status, "Asistió");
    assert.equal(q.vslOrigin, "origin");
    assert.equal(q.calendar, "c");
    assert.equal(q.sourceNames, undefined);
    assert.equal(q.preset, undefined);
  }
  assert.equal(result.kpis.total, 12);
  assert.equal(result.kpis.tasaAsistencia, 50);
  assert.equal(result.leadTypeKpis.attendanceRate, 42.86);
  assert.equal(result.pipelineSummary.vsl.conCitaCalendar, 12);
  assert.equal(result.pipelineSummary.vsl.calendars[0].count, 12);
  assert.equal(result.sales.total, 4);
  assert.equal(result.sales.salesValueByCurrency[0].salesValue, 200);
  assert.equal(result.sales.productSummary[0].ticket, 50);
  assert.equal(result.sales.productSummary[0].cantidad, 4);
  assert.equal(result.sales.productSummary[0].porcentajeRecaudado, 40);
  assert.equal(result.sales.rows[0].fechaCita, "2026-09-04");
  const modal = appointmentDetailFilters(filters, "Evelyn Lopez Horna", "Asistió");
  assert.equal(modal.closer, filters.closer);
  assert.equal(modal.dateFrom, filters.dateFrom);
  assert.equal(modal.dateTo, filters.dateTo);
  assert.equal(modal.setter, filters.setter);
});
test("all pipeline requests use correct person fields and Sin setter keeps the sentinel", async (t) => {
  const saved = global.fetch;
  t.after(() => (global.fetch = saved));
  let q;
  global.fetch = async (url) => {
    q = Object.fromEntries(new URL(url, "http://local").searchParams);
    return Response.json(report(q, 2));
  };
  const detail = {
    includeDetail: false,
    page: 1,
    pageSize: 25,
    search: "",
    sort: "nombreContacto",
    direction: "asc",
  };
  for (const pipeline of ["all", "vsl", "oei", "lig"]) {
    const booker = ["oei", "lig"].includes(pipeline);
    await getVslClosersReport(
      {
        ...empty,
        pipeline,
        closer: "Fiorela Bernales",
        [booker ? "booker" : "setter"]: "Evelyn Lopez Horna",
      },
      detail,
      undefined,
      ["Evelyn Lopez Horna"],
    );
    assert.equal(q.pipeline, pipeline);
    assert.equal(q[booker ? "booker" : "setter"], "Evelyn Lopez Horna");
    assert.equal(q.closer, "Fiorela Bernales");
    assert.equal(q.leadType, pipeline === "vsl" ? "all" : undefined);
  }
  await getVslClosersReport(
    { ...empty, pipeline: "vsl", setter: "Sin setter" },
    detail,
    undefined,
    ["Sin setter"],
  );
  assert.equal(q.setter, "__SIN_SETTER__");
  let calls = 0;
  global.fetch = async () => {
    calls++;
  };
  await assert.rejects(
    getVslClosersReport({ ...empty, dateFrom: "2026-10-01", dateTo: "2026-09-01" }, detail),
    /rango de fechas/,
  );
  assert.equal(calls, 0);
});
