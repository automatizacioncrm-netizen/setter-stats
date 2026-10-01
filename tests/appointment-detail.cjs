const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename,
  );
const { appointmentDetailFilters, getAppointmentDetail } = require("../src/services/reports.ts");
const { reportApi } = require("../src/server/api/report.api.server.ts");
const filters = {
  pipeline: "vsl",
  leadType: "paid",
  preset: "custom",
  dateFrom: "2026-08-26",
  dateTo: "2026-09-25",
  setter: "",
  booker: "",
  estadoAgenda: "",
  calendar: "Calendario OEI",
  closer: "Closer",
  vslOrigen: "Origen & +",
  vslTipo: "Tipo original",
};
const summary = {
  total: 51,
  confirmado: 10,
  asistio: 30,
  cancelado: 6,
  noShow: 5,
  tasaAsistencia: 58.82,
};
function setup(t) {
  const savedFetch = global.fetch;
  const savedEnv = { ...process.env };
  process.env.APPS_SCRIPT_URL = "https://script.google.com/macros/s/test/exec";
  process.env.APPS_SCRIPT_SECRET = "test-private-secret";
  t.after(() => {
    global.fetch = savedFetch;
    for (const key of ["APPS_SCRIPT_URL", "APPS_SCRIPT_SECRET"])
      savedEnv[key] === undefined ? delete process.env[key] : (process.env[key] = savedEnv[key]);
  });
}
test("click selection respects pipeline, status and all applied filters", () => {
  for (const [pipeline, state] of [
    ["vsl", undefined],
    ["vsl", "Asistió"],
    ["vsl", "Cancelado"],
    ["oei", undefined],
    ["oei", "No asistió"],
    ["lig", undefined],
  ]) {
    const result = appointmentDetailFilters({ ...filters, pipeline }, "José + & María", state);
    assert.equal(result[pipeline === "vsl" ? "setter" : "booker"], "José + & María");
    assert.equal(result[pipeline === "vsl" ? "booker" : "setter"], "");
    for (const key of ["calendar", "dateFrom", "dateTo", "closer", "leadType", "vslTipo"])
      assert.equal(result[key], filters[key]);
    assert.equal(result.vslOrigin, filters.vslOrigen);
    assert.equal(result.status, state ?? "");
  }
  const applied = { ...filters, setter: "Setter", booker: "Booker", estadoAgenda: "Confirmado" };
  assert.equal(appointmentDetailFilters(applied).status, "Confirmado");
  assert.equal(appointmentDetailFilters(applied, "Setter").booker, "Booker");
  assert.equal(
    appointmentDetailFilters({ ...applied, pipeline: "oei" }, "Booker").setter,
    "Setter",
  );
});
test("browser → proxy → authenticated appointment_detail preserves selection on pages 1 and 2", async (t) => {
  setup(t);
  const selected = appointmentDetailFilters(filters, "José + & María", "Asistió");
  const upstreamCalls = [];
  global.fetch = async (url, options) => {
    if (String(url).startsWith("/api/")) {
      assert.ok(!String(url).includes("test-private-secret"));
      return reportApi(new Request(`http://local${url}`));
    }
    const params = new URL(url).searchParams;
    upstreamCalls.push(Object.fromEntries(params));
    assert.equal(options.method, "GET");
    assert.equal(params.get("action"), "appointment_detail");
    assert.equal(params.get("key"), "test-private-secret");
    assert.equal(params.has("includeDetail"), false);
    assert.equal(params.has("sort"), false);
    assert.equal(params.has("direction"), false);
    for (const [key, value] of Object.entries(selected)) assert.equal(params.get(key), value);
    return Response.json({
      ok: true,
      data: {
        rows: [
          {
            appointmentId: "appointment",
            opportunityId: "opportunity",
            contactId: "contact",
            nombreContacto: "Real response",
            estado: "Asistió",
            fechaCreacionCita: "2026-08-26",
          },
        ],
        summary,
        pagination: {
          page: Number(params.get("page")),
          pageSize: 50,
          totalRecords: 51,
          totalPages: 2,
        },
      },
    });
  };
  const first = await getAppointmentDetail(selected, 1);
  const second = await getAppointmentDetail(selected, 2);
  assert.equal(first.rows[0].opportunityId, "opportunity");
  assert.equal(second.pagination.page, 2);
  assert.deepEqual(second.summary, summary);
  const { page: p1, ...rest1 } = upstreamCalls[0];
  const { page: p2, ...rest2 } = upstreamCalls[1];
  assert.equal(p1, "1");
  assert.equal(p2, "2");
  assert.deepEqual(rest1, rest2);
});
test("OEI and LIG forward booker and omit VSL leadType", async (t) => {
  setup(t);
  for (const pipeline of ["oei", "lig"]) {
    global.fetch = async (url) => {
      if (String(url).startsWith("/api/")) return reportApi(new Request(`http://local${url}`));
      const params = new URL(url).searchParams;
      assert.equal(params.get("pipeline"), pipeline);
      assert.equal(params.get("booker"), "María");
      assert.equal(params.get("setter"), "");
      assert.equal(params.has("leadType"), false);
      return Response.json({
        ok: true,
        data: {
          rows: [],
          summary: { ...summary, total: 0 },
          pagination: { page: 1, pageSize: 50, totalRecords: 0, totalPages: 0 },
        },
      });
    };
    assert.deepEqual(
      (await getAppointmentDetail(appointmentDetailFilters({ ...filters, pipeline }, "María")))
        .rows,
      [],
    );
  }
});
test("HTTP/API errors and malformed detail fail through controlled existing error handling", async (t) => {
  setup(t);
  for (const response of [
    Response.json({ ok: false, error: "failure" }),
    new Response("failure", { status: 500 }),
    Response.json({ ok: true, data: { rows: [] } }),
  ]) {
    global.fetch = async (url) =>
      String(url).startsWith("/api/")
        ? reportApi(new Request(`http://local${url}`))
        : response.clone();
    await assert.rejects(
      getAppointmentDetail(appointmentDetailFilters(filters)),
      /Apps Script|formato inválido/,
    );
  }
});
test("invalid pages and reversed dates fail before upstream access", async (t) => {
  setup(t);
  global.fetch = async () => assert.fail("upstream should not be called");
  for (const suffix of ["page=0", "pageSize=101", "dateFrom=2026-10-01&dateTo=2026-09-01"])
    assert.equal(
      (
        await reportApi(
          new Request(`http://local/api/reports/vsl-closers?action=appointment_detail&${suffix}`),
        )
      ).status,
      400,
    );
});

test("actual modal renders loading, results, empty/error, page handlers and close", async () => {
  let page = 1;
  let closed = false;
  let logged = false;
  const selected = {
    name: "José",
    count: 51,
    filters: appointmentDetailFilters(filters, "José", "Asistió"),
  };
  const query = { isFetching: true, isError: false, data: undefined, error: undefined };
  let options;
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync("src/components/reports/AppointmentDetailModal.tsx", "utf8"),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
      },
    ).outputText,
    {
      exports,
      console: {
        error: () => {
          logged = true;
        },
      },
      require(name) {
        if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
        if (name === "react")
          return {
            useState: () => [
              page,
              (next) => {
                page = typeof next === "function" ? next(page) : next;
              },
            ],
            useEffect: (fn) => fn(),
          };
        if (name === "@tanstack/react-query")
          return {
            useQuery: (value) => {
              options = value;
              return query;
            },
          };
        if (name.includes("services/reports"))
          return {
            getAppointmentDetail: async (value, number) => ({ filters: value, page: number }),
          };
        return new Proxy({}, { get: (_, key) => key });
      },
    },
  );
  const render = () =>
    exports.AppointmentDetailModal({
      selection: selected,
      onClose: () => {
        closed = true;
      },
    });
  const nodes = (node) =>
    !node || typeof node !== "object"
      ? []
      : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
  const text = (node) =>
    typeof node === "string" || typeof node === "number"
      ? String(node)
      : !node || typeof node !== "object"
        ? ""
        : [node.props?.children].flat(Infinity).map(text).join(" ");
  let tree = render();
  assert.match(text(tree), /Cargando agendamientos/);
  query.isFetching = false;
  query.data = {
    rows: [{ appointmentId: "id", nombreContacto: "Contacto de API" }],
    summary,
    pagination: { page: 1, pageSize: 50, totalRecords: 51, totalPages: 2 },
  };
  tree = render();
  assert.match(text(tree), /51 registros/);
  assert.match(text(tree), /Contacto de API/);
  assert.match(text(tree), /Estado: Asistió/);
  const buttons = nodes(tree).filter((n) => n.type === "Button");
  assert.equal(buttons[0].props.disabled, true);
  assert.equal(buttons[1].props.disabled, false);
  buttons[1].props.onClick();
  tree = render();
  assert.equal(page, 2);
  const request = await options.queryFn({});
  assert.equal(request.page, 2);
  assert.deepEqual(request.filters, selected.filters);
  query.isError = true;
  query.error = new Error("API failed");
  assert.match(text(render()), /No fue posible cargar el detalle/);
  assert.equal(logged, true);
  query.isError = false;
  query.error = undefined;
  query.data = {
    ...query.data,
    rows: [],
    pagination: { page: 1, pageSize: 50, totalRecords: 0, totalPages: 0 },
  };
  tree = render();
  assert.match(text(tree), /No se encontraron agendamientos para los filtros seleccionados/);
  tree.props.onOpenChange(false);
  assert.equal(closed, true);
});
