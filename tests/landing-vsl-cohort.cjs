const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const path = require("node:path");
const Module = require("node:module");
require.extensions[".ts"] = require.extensions[".tsx"] = (m, filename) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    filename,
    "commonjs",
  );
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return resolve.call(
    this,
    name.startsWith("@/") ? path.resolve("src", name.slice(2)) : name,
    ...args,
  );
};
const { mapLandingVslCohort } = require("../src/server/mappers/landing-vsl-cohort.mapper.ts");
const { mapVslReportResponse } = require("../src/server/mappers/vsl-response.mapper.ts");
const { reportApi } = require("../src/server/api/report.api.server.ts");
const { getVslClosersReport } = require("../src/services/reports.ts");
const { EMPTY_REPORT_FILTERS } = require("../src/lib/report-filter-state.ts");
const { renderToStaticMarkup } = require("react-dom/server");
const { createElement } = require("react");
const {
  LeadsWithoutAppointmentSection,
} = require("../src/components/reports/LeadsWithoutAppointmentSection.tsx");

// Reuse the repository's in-memory master-sheet harness without registering its
// unrelated tests. The actual Apps Script is evaluated unchanged by that harness.
const fixtureModule = { exports: {} };
vm.runInNewContext(fs.readFileSync("tests/apps-script-v2.cjs", "utf8"), {
  module: fixtureModule,
  require: (name) => (name === "node:test" ? { test: () => {} } : require(name)),
});
const { setup } = fixtureModule.exports;
const range = { dateFrom: "2026-10-21", dateTo: "2026-10-23" };
const calendar = "VSL PAGADO - EQUIPO MILLONARIO";
// Exact structure supplied by the user, not a live production capture.
const deployedFixture = () => ({
  pipeline: "vsl",
  agrupadoPor: "fechaCreacionOportunidad",
  crucePor: "opportunityId",
  fechaEstadoCita: "fechaCita / fechaReunion",
  unidad: "oportunidades_unicas",
  criterioMultiplesCitas: "Asistió > No asistió > Sin resultado",
  porDia: [
    {
      fechaCreacion: "2026-10-21",
      oportunidades: 20,
      oportunidadesConCita: 12,
      asistidos: 8,
      noAsistidos: 5,
      sinResultado: 7,
      citasAsistidas: 9,
      citasNoAsistidas: 6,
    },
  ],
  total: {
    oportunidades: 20,
    oportunidadesConCita: 12,
    asistidos: 8,
    noAsistidos: 5,
    sinResultado: 7,
    citasAsistidas: 9,
    citasNoAsistidas: 6,
  },
});
const zoneDate = (d) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
function context() {
  const c = setup({ opps: [], appts: [] }).c;
  c.Utilities.formatDate = zoneDate;
  return c;
}
const plain = (v) => JSON.parse(JSON.stringify(v));
const lead = (id, fecha = "2026-10-21", extra = {}) => ({
  opportunityId: id,
  pipeline: "vsl",
  vslOrigen: "No agendado",
  nombreContacto: `Contacto ${id}`,
  fechaCreacionOportunidad: fecha,
  setterOpportunity: "Jose",
  closerOpportunity: "Closer comercial",
  ...extra,
});
const appt = (id, estadoCita, extra = {}) => ({
  appointmentId: id,
  pipeline: "vsl",
  calendarioCita: calendar,
  fechaCita: "2026-10-25",
  estadoCita,
  createdByUserName: "Agendador",
  closerCita: "Closer cita",
  ...extra,
});
function fixture() {
  return plain(
    context().API_BUILD_LANDING_VSL_COHORT_(
      [
        lead("a"),
        lead("a"),
        lead("b"),
        lead("c"),
        lead("d", "2026-10-22"),
        lead("e", "2026-10-23"),
        lead("outside", "2026-10-24"),
        lead("organic", undefined, { vslOrigen: "Orgánico" }),
        ...["oei", "lig", "organico", "gira"].map((pipeline) =>
          lead(pipeline, undefined, { pipeline }),
        ),
      ],
      new Map([
        [
          "a",
          [
            appt("a1", "noshow"),
            appt("a2", "showed"),
            appt("a2", "showed"),
            appt("a3", "confirmed"),
          ],
        ],
        ["b", [appt("b1", "noshow")]],
        ["c", [appt("c1", "confirmed")]],
        ["d", [appt("d1", "cancelled")]],
        [
          "e",
          [
            appt("e1", "showed", { calendarioCita: "ORGANICO - EQUIPO MILLONARIO" }),
            appt("e2", "showed", { pipeline: "oei" }),
          ],
        ],
      ]),
      range,
    ),
  );
}
test("daily cohort joins historical appointments, deduplicates and preserves calendar states", () => {
  const data = fixture();
  assert.equal(data.totalLeads, 5);
  assert.equal(data.porDia.length, 3);
  assert.deepEqual(
    data.porDia.map((d) => [
      d.totalLeads,
      d.leadsAsistidos,
      d.leadsNoAsistidos,
      d.leadsPendientesResultado,
    ]),
    [
      [3, 1, 1, 1],
      [1, 0, 0, 1],
      [1, 0, 0, 1],
    ],
  );
  const a = data.porDia[0].leads[0];
  assert.equal(a.resultadoAsistencia, "Asistió");
  assert.equal(a.citas.length, 3);
  assert.equal(a.citas[1].fechaReunion, "2026-10-25");
  assert.equal(a.citas[2].estadoAgenda, "Confirmado");
  assert.equal(a.citas[2].estadoCalendar, "confirmed");
  assert.equal(data.porDia[1].leads[0].citas[0].estadoAgenda, "Cancelado");
  assert.equal(data.porDia[2].leads[0].resultadoAsistencia, "Pendiente de agenda");
  assert.equal(data.porDia[0].porcentajeAsistencia, 33.33);
  assert.deepEqual(mapLandingVslCohort(data, range, 5).cohorteDiariaVsl, {
    totalLeads: data.totalLeads,
    porDia: data.porDia,
  });
});
test("creation dates and meeting timestamps use Lima; inclusive date boundaries and empty results", () => {
  const c = context();
  assert.equal(c.API_LANDING_COHORT_DATE_("2026-10-22T02:00:00Z"), "2026-10-21");
  assert.equal(c.API_LANDING_COHORT_DATE_("2026-10-22"), "2026-10-22");
  const rows = [
    lead("a", "2026-10-20", { fechaCreacionLandingVsl: "2026-10-21" }),
    lead("b", "2026-10-23"),
  ];
  const data = plain(c.API_BUILD_LANDING_VSL_COHORT_(rows, new Map(), range));
  assert.equal(data.totalLeads, 2);
  assert.equal(
    plain(c.API_BUILD_LANDING_VSL_COHORT_(rows, new Map(), { dateFrom: "2026-11-01" })).totalLeads,
    0,
  );
  assert.ok(plain(c.API_BUILD_LANDING_VSL_COHORT_([lead("bad", "")], new Map(), range)).error);
  assert.deepEqual(mapLandingVslCohort({ totalLeads: 0, porDia: [] }, range, 0).cohorteDiariaVsl, {
    totalLeads: 0,
    porDia: [],
  });
});
test("invalid or partial data stays unavailable without fabricated counts", () => {
  assert.ok(mapLandingVslCohort(undefined, range).cohorteDiariaVslError);
  for (const mutate of [
    (d) => d.porDia[0].leads.push(d.porDia[0].leads[0]),
    (d) => (d.porDia[0].leads[1].opportunityId = "a"),
    (d) => d.porDia[0].leads[0].citas.push(d.porDia[0].leads[0].citas[0]),
    (d) => (d.porDia[0].leads[0].pipeline = "oei"),
    (d) => (d.porDia[0].fecha = "2026-10-20"),
    (d) => (d.porDia[0].porcentajeAsistencia = 99),
    (d) => (d.porDia[0].leads[0].resultadoAsistencia = "No asistió"),
    (d) => (d.totalLeads = 6),
    (d) => (d.porDia[0].leadsNoAsistidos = 0),
  ]) {
    const data = fixture();
    mutate(data);
    assert.ok(mapLandingVslCohort(data, range, 5).cohorteDiariaVslError);
  }
  const summary = fixture();
  summary.porDia.forEach((d) => delete d.leads);
  assert.ok(mapLandingVslCohort(summary, range, 5).cohorteDiariaVsl);
  assert.ok(mapLandingVslCohort(fixture(), range, 6).cohorteDiariaVslError);
});

test("user-supplied deployed schema maps opportunity counts, not appointment counts", () => {
  const source = deployedFixture();
  const before = JSON.stringify(source);
  const result = mapLandingVslCohort(source, range, 20);
  assert.equal(result.cohorteDiariaVslError, undefined);
  assert.deepEqual(result.cohorteDiariaVsl, {
    totalLeads: 20,
    porDia: [
      {
        fecha: "2026-10-21",
        totalLeads: 20,
        leadsAsistidos: 8,
        leadsNoAsistidos: 5,
        leadsPendientesResultado: 7,
        porcentajeAsistencia: 40,
      },
    ],
  });
  assert.equal(result.cohorteDiariaVsl.porDia[0].leads, undefined);
  assert.equal(JSON.stringify(source), before);
  const empty = {
    ...source,
    porDia: [],
    total: { oportunidades: 0, asistidos: 0, noAsistidos: 0, sinResultado: 0 },
  };
  assert.deepEqual(mapLandingVslCohort(empty, range, 0).cohorteDiariaVsl, {
    totalLeads: 0,
    porDia: [],
  });
  const zero = structuredClone(empty);
  zero.porDia = [{ fechaCreacion: "2026-10-21", ...empty.total }];
  assert.equal(
    mapLandingVslCohort(zero, range, 0).cohorteDiariaVsl.porDia[0].porcentajeAsistencia,
    0,
  );
});

test("deployed contract retains integrity checks and exposes only safe schema diagnostics", () => {
  for (const mutate of [
    (d) => d.total.asistidos++,
    (d) => (d.porDia[0].oportunidades = null),
    (d) => (d.porDia[0].asistidos = "secret-test-only-value"),
    (d) => (d.pipeline = "secret-test-only-value"),
    (d) => delete d.total.oportunidades,
    (d) => d.porDia.push(d.porDia[0]),
  ]) {
    const source = deployedFixture();
    mutate(source);
    const error = mapLandingVslCohort(source, range, 20).cohorteDiariaVslError;
    assert.ok(error);
    assert.doesNotMatch(error, /secret-test-only-value/);
  }
  const invalid = deployedFixture();
  invalid.porDia[0].asistidos = null;
  assert.match(
    mapLandingVslCohort(invalid, range).cohorteDiariaVslError,
    /cohorteDiariaVsl\.porDia\.0\.asistidos: esperado number, recibido null/,
  );
});

test("cohort is read inside data; absence differs from an incompatible payload", () => {
  const q = { pipeline: "vsl", ...range, includeDetail: false };
  const correct = mapVslReportResponse(
    { ok: true, data: { cohorteDiariaVsl: deployedFixture() } },
    q,
  );
  assert.equal(correct.cohorteDiariaVsl.totalLeads, 20);
  const wrongLevel = mapVslReportResponse(
    { ok: true, data: {}, cohorteDiariaVsl: deployedFixture() },
    q,
  );
  assert.match(wrongLevel.cohorteDiariaVslError, /no entrega/);
  const incompatible = mapVslReportResponse(
    { ok: true, data: { cohorteDiariaVsl: { porDia: [] } } },
    q,
  );
  assert.match(incompatible.cohorteDiariaVslError, /incompleta o incompatible/);
  assert.match(incompatible.cohorteDiariaVslError, /totalLeads/);
  assert.equal(incompatible.cohorteDiariaVsl, undefined);
});

test("simulated HTTP journey preserves deployed cohort through adapter, proxy and client with unchanged KPIs", async () => {
  const previousFetch = global.fetch;
  const keys = ["APPS_SCRIPT_URL", "APPS_SCRIPT_SECRET", "NODE_ENV"];
  const previousEnv = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  process.env.APPS_SCRIPT_URL = "https://script.google.com/macros/s/test-fixture/exec";
  process.env.APPS_SCRIPT_SECRET = "test-only-credential";
  process.env.NODE_ENV = "production";
  try {
    for (const empty of [false, true]) {
      const source = deployedFixture();
      if (empty) {
        source.porDia = [];
        source.total = { oportunidades: 0, asistidos: 0, noAsistidos: 0, sinResultado: 0 };
      }
      const raw = {
        ok: true,
        data: {
          cohorteDiariaVsl: source,
          updatedAt: "2026-10-27T15:00:00Z",
          leadsVslSinCita: {
            totalLeads: empty ? 0 : 20,
            leadsConCita: empty ? 0 : 12,
            leadsSinCita: empty ? 0 : 8,
          },
          kpis: { total: 15, confirmado: 2, asistio: 8, cancelado: 0, noShow: 5 },
        },
      };
      const filters = {
        ...EMPTY_REPORT_FILTERS,
        preset: "custom",
        pipeline: "vsl",
        leadType: "paid",
        dateFrom: empty ? "2026-11-01" : range.dateFrom,
        dateTo: empty ? "2026-11-02" : range.dateTo,
      };
      let upstream = 0,
        finalBody;
      global.fetch = async (input, options) => {
        if (String(input).startsWith("/api/")) {
          const response = await reportApi(new Request(new URL(input, "https://local.test")));
          assert.equal(response.status, 200);
          assert.equal(response.headers.get("cache-control"), "no-store");
          finalBody = await response.clone().json();
          return response;
        }
        upstream++;
        const q = new URL(input).searchParams;
        for (const [key, value] of Object.entries({
          pipeline: "vsl",
          leadType: "paid",
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          action: "vsl_report",
        }))
          assert.equal(q.get(key), value);
        assert.equal(options.cache, "no-store");
        return Response.json(raw);
      };
      const result = await getVslClosersReport(filters, {
        includeDetail: false,
        page: 1,
        pageSize: 25,
        sort: "nombreContacto",
        direction: "asc",
      });
      assert.equal(upstream, 1);
      assert.equal(finalBody.cohorteDiariaVslError, undefined);
      assert.equal(finalBody.cohorteDiariaVsl.totalLeads, empty ? 0 : 20);
      assert.deepEqual(result.cohorteDiariaVsl, finalBody.cohorteDiariaVsl);
      assert.equal(result.cohorteDiariaVsl.porDia.length, empty ? 0 : 1);
      assert.doesNotMatch(JSON.stringify(finalBody), /test-only-credential/);
      // Removing only the cohort at the upstream source must not change any
      // existing metric, filter, attribution or other section of the response.
      const without = structuredClone(raw);
      delete without.data.cohorteDiariaVsl;
      const control = await (
        await reportApi(
          new Request(
            `https://local.test/api/reports/vsl-closers?pipeline=vsl&leadType=paid&dateFrom=${filters.dateFrom}&dateTo=${filters.dateTo}`,
          ),
        )
      ).json();
      // Use the same query defaults as the HTTP route for a direct comparison.
      const baseline = mapVslReportResponse(without, {
        ...filters,
        includeDetail: false,
        pageSize: 25,
        sort: "nombreContacto",
        direction: "asc",
        status: "",
        vslOrigin: "",
      });
      for (const item of [control, baseline]) {
        delete item.cohorteDiariaVsl;
        delete item.cohorteDiariaVslError;
      }
      assert.deepEqual(control, baseline);
    }
  } finally {
    global.fetch = previousFetch;
    for (const key of keys)
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
  }
});
test("proxy only maps VSL cohorts and the three existing KPI cards stay unchanged", () => {
  const raw = {
    ok: true,
    data: {
      cohorteDiariaVsl: fixture(),
      leadsVslSinCita: { totalLeads: 5, leadsConCita: 2, leadsSinCita: 3 },
      detail: [],
    },
  };
  const q = {
    ...range,
    pipeline: "vsl",
    includeDetail: false,
    pageSize: 25,
    sort: "nombreContacto",
    direction: "asc",
  };
  const report = mapVslReportResponse(raw, q);
  assert.equal(report.cohorteDiariaVsl.totalLeads, 5);
  const output = renderToStaticMarkup(createElement(LeadsWithoutAppointmentSection, { report }));
  assert.match(output, /Detalle de leads Landing VSL/);
  assert.doesNotMatch(output, /Detalle de leads pendientes de agenda/);
  assert.equal((output.match(/text-3xl/g) || []).length, 3);
  assert.equal(report.leadsVslSinCita.totalLeads, 5);
  for (const pipeline of ["all", "oei", "lig", "organico", "gira"])
    assert.equal(mapVslReportResponse(raw, { ...q, pipeline }).cohorteDiariaVsl, undefined);
});

test("complete Apps Script report uses the master-sheet join and respects selected filters", () => {
  const opp = (id, created, origin = "No agendado") => ({
    "Opportunity ID": id,
    "Contact ID": id,
    "Nombre contacto": id,
    Secuencia: "VSL | Closers",
    Fase: "Nuevo",
    Fuente: "VSL FUNNEL",
    Asignado: "Fiorela Bernales",
    "Creado el": created,
    "Setter asignado": "Jose",
    "VSL Origen": origin,
  });
  const appointment = (id, oid, status, meeting) => ({
    "_Appointment ID": id,
    "_Opportunity ID": oid,
    "_Contact ID": oid,
    Embudo: "VSL | Closers",
    "Calendario cita": calendar,
    "Estado cita": status,
    "Fecha cita": meeting,
    "_Appointment Created At": "2026-10-24",
    "Closer cita": "Fiorela Bernales",
    "Creado por cita": "Jimena",
  });
  const h = setup({
    opps: [
      opp("a", "2026-10-21", "Agendado automatico"),
      opp("b", "2026-10-23"),
      opp("outside", "2026-10-24"),
    ],
    appts: [
      appointment("a1", "a", "showed", "2026-10-25"),
      appointment("a2", "a", "noshow", "2026-10-26"),
      appointment("b1", "b", "confirmed", "2026-11-01"),
    ],
  });
  const report = h.report({ pipeline: "vsl", ...range, includeDetail: false });
  assert.equal(report.cohorteDiariaVsl.totalLeads, 2);
  assert.equal(report.cohorteDiariaVsl.porDia[0].leadsAsistidos, 1);
  assert.equal(report.cohorteDiariaVsl.porDia[1].leadsPendientesResultado, 1);
  assert.equal(report.leadsVslSinCita.totalLeads, 2);
  assert.equal(report.leadsVslSinCita.leadsConCita, 1);
  assert.equal(report.leadsVslSinCita.leadsSinCita, 1);
  assert.equal(
    report.cohorteDiariaVsl.porDia.reduce((n, d) => n + d.totalLeads, 0),
    report.leadsVslSinCita.totalLeads,
  );
  const mapped = mapVslReportResponse({ ok: true, data: report }, { pipeline: "vsl", ...range });
  assert.equal(mapped.cohorteDiariaVslError, undefined);
  assert.equal(mapped.cohorteDiariaVsl.porDia[0].leads[0].citas.length, 2);
  assert.equal(
    h.report({ pipeline: "vsl", ...range, closer: "Otro" }).cohorteDiariaVsl.totalLeads,
    0,
  );
  assert.equal(
    h.report({ pipeline: "vsl", ...range, status: "Confirmado" }).cohorteDiariaVsl.totalLeads,
    1,
  );
  assert.equal(
    h.report({ pipeline: "vsl", ...range, calendar: "Otro" }).cohorteDiariaVsl.totalLeads,
    0,
  );
  assert.equal(
    h.report({ pipeline: "vsl", ...range, vslOrigin: "No agendado" }).cohorteDiariaVsl.totalLeads,
    1,
  );
  assert.equal(
    h.report({ pipeline: "vsl", ...range, setter: "Evelyn" }).cohorteDiariaVsl.totalLeads,
    0,
  );
  for (const pipeline of ["all", "oei", "lig", "organico", "gira"])
    assert.equal(h.report({ pipeline, ...range }).cohorteDiariaVsl, undefined);
});

function ui(report) {
  const states = new Map();
  let current;
  const exports = {};
  const jsx = (type, props, key) => ({ type, props, key });
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync("src/components/reports/LandingVslCohortDetail.tsx", "utf8"),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
      },
    ).outputText,
    {
      exports,
      require(name) {
        if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
        if (name === "react")
          return {
            useState(initial) {
              const hook = current,
                index = hook.cursor++;
              if (!(index in hook.values)) hook.values[index] = initial;
              return [
                hook.values[index],
                (v) => (hook.values[index] = typeof v === "function" ? v(hook.values[index]) : v),
              ];
            },
          };
        if (name === "./ExecutiveTable") return { ExecutiveTable: "Table" };
        return require(name);
      },
    },
  );
  function expand(node) {
    if (!node || typeof node !== "object") return node;
    if (Array.isArray(node)) return node.map(expand);
    if (typeof node.type === "function") {
      const key = node.type.name + (node.key || "");
      if (!states.has(key)) states.set(key, { values: [], cursor: 0 });
      current = states.get(key);
      current.cursor = 0;
      return expand(node.type(node.props));
    }
    return { ...node, props: { ...node.props, children: expand(node.props?.children) } };
  }
  let tree;
  const render = () => (tree = expand(jsx(exports.LandingVslCohortDetail, { report })));
  const collect = (n) =>
    !n || typeof n !== "object"
      ? []
      : Array.isArray(n)
        ? n.flatMap(collect)
        : [n, ...collect(n.props?.children)];
  render();
  return { render, nodes: () => collect(tree) };
}
test("expand, daily actions, lead pagination and appointment subdetails work on the real component", () => {
  const data = fixture();
  const first = data.porDia[0];
  first.leads = Array.from({ length: 26 }, (_, i) => ({
    ...first.leads[0],
    opportunityId: `lead-${i}`,
  }));
  first.totalLeads = first.leadsAsistidos = 26;
  first.leadsNoAsistidos = first.leadsPendientesResultado = 0;
  first.porcentajeAsistencia = 100;
  data.totalLeads = 28;
  const report = {
    filters: { ...EMPTY_REPORT_FILTERS, pipeline: "vsl", ...range },
    cohorteDiariaVsl: data,
  };
  const h = ui(report);
  assert.equal(h.nodes().filter((n) => n.type === "Table").length, 0);
  h.nodes()
    .find((n) => n.type === "details")
    .props.onToggle({ currentTarget: { open: true } });
  h.render();
  let summary = h.nodes().find((n) => n.type === "Table");
  assert.equal(summary.props.rows.length, 3);
  const action = summary.props.columns
    .find((c) => c.key === "detail")
    .render(summary.props.rows[0]);
  action.props.onClick();
  h.render();
  let detail = h.nodes().filter((n) => n.type === "Table")[1];
  assert.equal(detail.props.rows.length, 25);
  assert.equal(detail.props.columns.length, 10);
  assert.equal(
    detail.props.columns.find((c) => c.key === "calendar").render(detail.props.rows[0]).type,
    "details",
  );
  h.nodes()
    .find((n) => n.type === "button" && n.props.children === "Siguiente")
    .props.onClick();
  h.render();
  detail = h.nodes().filter((n) => n.type === "Table")[1];
  assert.equal(detail.props.rows.length, 1);
  assert.equal(detail.props.rows[0].opportunityId, "lead-25");
  const sort = h.nodes().find((n) => n.type === "button" && Array.isArray(n.props.children));
  sort.props.onClick();
  h.render();
  summary = h.nodes().find((n) => n.type === "Table");
  assert.equal(summary.props.rows[0].fecha, "2026-10-23");
});

test("deployed summary renders its day without inventing individual lead records", () => {
  const report = {
    filters: { ...EMPTY_REPORT_FILTERS, pipeline: "vsl", ...range },
    ...mapLandingVslCohort(deployedFixture(), range, 20),
  };
  const h = ui(report);
  h.nodes()
    .find((n) => n.type === "details")
    .props.onToggle({ currentTarget: { open: true } });
  h.render();
  const table = h.nodes().find((n) => n.type === "Table");
  assert.equal(table.props.rows[0].fecha, "2026-10-21");
  assert.equal(table.props.rows[0].totalLeads, 20);
  assert.equal(table.props.rows[0].porcentajeAsistencia, 40);
  table.props.columns
    .find((c) => c.key === "detail")
    .render(table.props.rows[0])
    .props.onClick();
  h.render();
  assert.ok(
    h.nodes().some((n) => n.type === "p" && /no sus registros individuales/.test(n.props.children)),
  );
  assert.equal(h.nodes().filter((n) => n.type === "Table").length, 1);
});
