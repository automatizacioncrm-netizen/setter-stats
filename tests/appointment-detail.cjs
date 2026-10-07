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
const {
  appointmentDetailFilters,
  getAppointmentDetail,
  getSetterApiValue,
} = require("../src/services/reports.ts");
const { reportApi } = require("../src/server/api/report.api.server.ts");

test("performance table filters existing rows and totals across pipeline changes, preserving clicks", () => {
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync("src/components/reports/SetterStatusTable.tsx", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      exports,
      require(name) {
        if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
        if (name === "react")
          return { useMemo: (fn) => fn(), useState: (value) => [value, () => {}] };
        if (name.includes("setter-performance")) return require("../src/lib/setter-performance.ts");
        return { ArrowUpDown: "ArrowUpDown" };
      },
    },
  );
  const nodes = (node) =>
    !node || typeof node !== "object"
      ? []
      : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
  const content = (node) =>
    typeof node === "string" || typeof node === "number"
      ? String(node)
      : !node || typeof node !== "object"
        ? ""
        : [node.props?.children].flat(Infinity).map(content).join("");
  const allowed = [
    "Alvaro Jesus Paniura Marin",
    "Jose Luis Botto Garcia",
    "Claudia Jimena Ocampo Portilla",
    "Cinthia Maquito",
    "Evelyn Lopez Horna",
    "Kiara",
    "Sin setter",
  ];
  const hidden = [
    "Joseph",
    "Amaranta Alfonso Krasnova",
    "Angel Julca",
    "Carla",
    "Jh1LDdbfRP024sF6O65a",
  ];
  const makeRow = (setter) =>
    Object.freeze({ setter, confirmado: 2, asistio: 3, cancelado: 4, noShow: 1, total: 10 });
  for (const pipeline of ["vsl", "oei", "lig", "vsl"]) {
    const names = pipeline === "vsl" ? allowed : allowed.filter((name) => name !== "Kiara");
    const apiNames = names;
    const zeroRow = Object.freeze({
      setter: "Jose Luis Botto Garcia",
      confirmado: 0,
      asistio: 0,
      cancelado: 0,
      noShow: 0,
      total: 0,
    });
    const rows = Object.freeze([...apiNames, ...hidden].map(makeRow).concat(zeroRow));
    const clicks = [];
    const tree = exports.SetterStatusTable({
      rows,
      totals: { total: 999, asistio: 999 },
      mode: pipeline === "vsl" ? "setter" : "booker",
      showStatuses: true,
      onDetail: (...args) => clicks.push(args),
    });
    const body = nodes(tree).find((node) => node.type === "tbody");
    const renderedRows = nodes(body).filter((node) => node.type === "tr");
    assert.deepEqual(
      renderedRows.map((row) => content(nodes(row).find((node) => node.type === "td"))).sort(),
      [...names].sort(),
    );
    const footer = nodes(tree).find((node) => node.type === "tfoot");
    assert.deepEqual(
      nodes(footer)
        .filter((node) => node.type === "td")
        .map(content),
      [
        "Total general",
        String(names.length * 2),
        String(names.length * 3),
        "30%",
        String(names.length * 4),
        String(names.length),
        String(names.length * 10),
      ],
    );
    for (const row of renderedRows) {
      const buttons = nodes(row).filter((node) => node.type === "button");
      buttons.forEach((button) => button.props.onClick());
    }
    for (const person of apiNames) {
      assert.ok(
        clicks.some(
          ([name, status, count]) => name === person && status === undefined && count === 10,
        ),
      );
      for (const status of ["Confirmado", "Asistió", "Cancelado", "No asistió"])
        assert.ok(clicks.some(([name, state]) => name === person && state === status));
    }
    const unassigned = appointmentDetailFilters({ pipeline }, "Sin setter");
    assert.equal(
      unassigned[pipeline === "vsl" ? "setter" : "booker"],
      pipeline === "vsl" ? "__SIN_SETTER__" : "Sin setter",
    );
    assert.equal(rows.length, names.length + hidden.length + 1);
  }
  for (const rows of [
    [],
    [makeRow("Otro")],
    [makeRow("  ÁLVARO   JESÚS PANIURA MARÍN  ")],
    [makeRow("")],
  ]) {
    const tree = exports.SetterStatusTable({ rows, totals: {}, mode: "general" });
    const body = nodes(tree).find((node) => node.type === "tbody");
    assert.equal(
      nodes(body).filter((node) => node.type === "tr").length,
      rows.length && rows[0].setter !== "Otro" ? 1 : 0,
    );
    assert.ok(!content(tree).includes("NaN"));
  }
  const clicks = [];
  const groupedTree = exports.SetterStatusTable({
    rows: [
      makeRow("Jose Luis"),
      makeRow("Jose Luis Botto Garcia"),
      makeRow("Evelyn"),
      makeRow("Joseph"),
    ],
    totals: { total: 999 },
    mode: "setter",
    onDetail: (...args) => clicks.push(args),
  });
  const groupedBody = nodes(groupedTree).find((node) => node.type === "tbody");
  assert.equal(nodes(groupedBody).filter((node) => node.type === "tr").length, 2);
  const mergedName = nodes(groupedBody).find(
    (node) =>
      node.type === "button" &&
      node.props["aria-label"] === "Ver todos los agendamientos de Jose Luis Botto Garcia",
  );
  mergedName.props.onClick();
  assert.deepEqual(clicks[0], [
    "Jose Luis Botto Garcia",
    undefined,
    20,
    ["Jose Luis", "Jose Luis Botto Garcia"],
  ]);
  const footer = nodes(groupedTree).find((node) => node.type === "tfoot");
  assert.deepEqual(
    nodes(footer)
      .filter((node) => node.type === "td")
      .map(content),
    ["Total general", "6", "9", "30%", "12", "3", "30"],
  );
});
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
    assert.equal(result.status, state);
  }
  const applied = { ...filters, setter: "Setter", booker: "Booker", estadoAgenda: "Confirmado" };
  assert.equal(appointmentDetailFilters(applied).status, "Confirmado");
  assert.equal(appointmentDetailFilters(applied, "Setter").booker, "Booker");
  assert.equal(
    appointmentDetailFilters({ ...applied, pipeline: "oei" }, "Booker").setter,
    "Setter",
  );
});
test("setter names and totals omit status and use the empty-setter sentinel", async (t) => {
  assert.equal(getSetterApiValue("Jose Luis"), "Jose Luis");
  assert.equal(getSetterApiValue(" Sin Setter "), "__SIN_SETTER__");
  assert.equal(getSetterApiValue("Sin setter asignado"), "__SIN_SETTER__");

  const activeStatus = { ...filters, estadoAgenda: "Confirmado" };
  const normal = appointmentDetailFilters(activeStatus, "Jose Luis");
  const unassigned = appointmentDetailFilters(activeStatus, "Sin setter");
  assert.equal(normal.setter, "Jose Luis");
  assert.equal("status" in normal, false);
  assert.equal(unassigned.setter, "__SIN_SETTER__");
  assert.equal("status" in unassigned, false);
  assert.equal(appointmentDetailFilters(activeStatus, "Sin setter", "Asistió").status, "Asistió");

  setup(t);
  const browserUrls = [];
  global.fetch = async (url) => {
    if (String(url).startsWith("/api/")) {
      browserUrls.push(new URL(`http://local${url}`));
      return Response.json({
        rows: [],
        summary: { ...summary, total: 0 },
        pagination: { page: 1, pageSize: 50, totalRecords: 0, totalPages: 0 },
      });
    }
    return assert.fail("The proxy should not be needed in this serialization check");
  };
  await getAppointmentDetail(unassigned);
  assert.equal(browserUrls[0].searchParams.get("setter"), "__SIN_SETTER__");
  assert.equal(browserUrls[0].searchParams.has("status"), false);
  assert.equal(browserUrls[0].searchParams.get("page"), "1");
  assert.equal(browserUrls[0].searchParams.get("pageSize"), "50");
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
  assert.equal("dateField" in rest1, false, "legacy requests must omit dateField");
  for (const dateField of ["appointmentCreated", "meetingDate"]) {
    selected.dateField = dateField;
    const dated = await getAppointmentDetail(selected);
    assert.equal(dated.pagination.totalRecords, 51);
    assert.equal(upstreamCalls.at(-1).dateField, dateField);
    assert.equal(upstreamCalls.at(-1).closer, selected.closer);
    assert.equal(upstreamCalls.at(-1).dateFrom, selected.dateFrom);
    assert.equal(upstreamCalls.at(-1).dateTo, selected.dateTo);
  }
  const previousCalls = upstreamCalls.length;
  const invalid = await reportApi(
    new Request(
      "http://local/api/reports/vsl-closers?action=appointment_detail&dateField=unsupported",
    ),
  );
  assert.equal(invalid.status, 400);
  assert.equal(upstreamCalls.length, previousCalls, "invalid dateField never reaches upstream");
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

test("new detail contract preserves AND filters, server order and available options in every pipeline", async (t) => {
  setup(t);
  const calendars = [
    "VSL PAGADO - CIRCULO MILLONARIO",
    "ORGANICO - CIRCULO MILLONARIO",
    "VSL PAGADO - EQUIPO MILLONARIO",
    "ORGANICO - EQUIPO MILLONARIO",
  ];
  for (const pipeline of ["vsl", "oei", "lig"]) {
    const rows = calendars.map((calendario, i) => ({
      appointmentId: `appointment-${i}`,
      calendario,
      nombreContacto: i === 0 ? "Z" : "A",
      fechaCreacionCita: `2026-10-0${7 - i}`,
      setterEfectivo: "Jose Luis Botto Garcia",
      bookingMode: "automatic",
      diferenciaDias: 0,
      diferenciaDiasLabel: "Mismo día",
      vslOrigen: "API origin",
    }));
    const available = {
      dateFields: [
        { value: "appointmentCreated", label: "Fecha de creación de cita" },
        { value: "meetingDate", label: "Fecha de cita / reunión" },
      ],
      bookingModes: [{ value: "automatic", label: "Agendado automático" }],
      dayGaps: [{ value: "0", label: "Mismo día", days: 0 }],
    };
    global.fetch = async (url) => {
      if (String(url).startsWith("/api/")) return reportApi(new Request(`http://local${url}`));
      const params = new URL(url).searchParams;
      assert.equal(params.get("pipeline"), pipeline);
      assert.equal(params.get("bookingMode"), "automatic");
      assert.equal(params.get("dayGap"), "0");
      assert.equal(params.get("dateField"), "meetingDate");
      assert.equal(params.get("setter"), "Jose Luis Botto Garcia");
      assert.equal(params.get("vslOrigin"), "Origen & +");
      assert.equal(params.has("sort"), false);
      return Response.json({
        ok: true,
        data: {
          rows,
          filters: { available },
          summary,
          pagination: { page: 1, pageSize: 50, totalRecords: 4, totalPages: 1 },
        },
      });
    };
    const result = await getAppointmentDetail({
      ...appointmentDetailFilters({ ...filters, pipeline }),
      setter: "Jose Luis Botto Garcia",
      dateField: "meetingDate",
      bookingMode: "automatic",
      dayGap: "0",
    });
    assert.deepEqual(result.rows, rows);
    assert.deepEqual(result.filters.available, available);
    assert.equal(new Set(result.rows.map((row) => row.appointmentId)).size, 4);
  }
});

test("actual modal renders loading, results, empty/error, page handlers and close", async () => {
  const state = [];
  let cursor = 0;
  const effects = [];
  const timers = new Map();
  let timerId = 0;
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
      setTimeout: (fn) => {
        const id = ++timerId;
        timers.set(id, fn);
        return id;
      },
      clearTimeout: (id) => timers.delete(id),
      console: {
        error: () => {
          logged = true;
        },
      },
      require(name) {
        if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
        if (name === "react")
          return {
            useState: (initial) => {
              const index = cursor++;
              if (!(index in state)) state[index] = initial;
              return [
                state[index],
                (next) => {
                  state[index] = typeof next === "function" ? next(state[index]) : next;
                },
              ];
            },
            useEffect: (fn, deps) => {
              const index = cursor++;
              const previous = effects[index];
              if (!previous || deps.some((dep, i) => dep !== previous.deps[i])) {
                previous?.cleanup?.();
                effects[index] = { deps, cleanup: fn() };
              }
            },
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
        if (name.includes("report-filter-state"))
          return require("../src/lib/report-filter-state.ts");
        return new Proxy({}, { get: (_, key) => key });
      },
    },
  );
  const render = () => {
    cursor = 0;
    return exports.AppointmentDetailModal({
      selection: selected,
      onClose: () => {
        closed = true;
      },
    });
  };
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
    rows: [
      {
        appointmentId: "id",
        nombreContacto: "Contacto de API",
        setterEfectivo: "Setter de API",
        agendadoPor: "Alias",
        creadoPorCita: "Otro creador",
        bookingMode: "automatic",
        diferenciaDiasLabel: "Mismo día",
        vslOrigen: "Origen API",
        correo: "oculto@example.com",
      },
    ],
    filters: {
      available: {
        dayGaps: [{ value: "0", label: "Mismo día", days: 0 }],
        bookingModes: [
          { value: "automatic", label: "Agendado automático" },
          { value: "manual", label: "Agendado manual" },
        ],
        dateFields: [{ value: "appointmentCreated" }, { value: "meetingDate" }],
      },
    },
    summary,
    pagination: { page: 1, pageSize: 50, totalRecords: 51, totalPages: 2 },
  };
  tree = render();
  assert.match(text(tree), /51 registros/);
  assert.match(text(tree), /Contacto de API/);
  assert.match(text(tree), /Estado: Asistió/);
  assert.match(text(tree), /Setter de API/);
  assert.match(text(tree), /Origen API/);
  assert.match(text(tree), /Mismo día/);
  assert.ok(!text(tree).includes("oculto@example.com"));
  assert.ok(!nodes(tree).some((node) => node.type === "th" && text(node) === "Correo"));
  assert.ok(nodes(tree).some((node) => node.type === "th" && text(node) === "VSL Origen"));
  const buttons = nodes(tree).filter(
    (n) => n.type === "Button" && ["Anterior", "Siguiente"].includes(n.props.children),
  );
  assert.equal(buttons[0].props.disabled, true);
  assert.equal(buttons[1].props.disabled, false);
  buttons[1].props.onClick();
  tree = render();
  assert.equal(state[0], 2);
  const request = await options.queryFn({});
  assert.equal(request.page, 2);
  assert.deepEqual(
    { ...request.filters },
    { ...selected.filters, dateField: "appointmentCreated", bookingMode: "", dayGap: "" },
  );
  nodes(tree)
    .find((node) => node.type === "input")
    .props.onChange({ target: { value: "987654321" } });
  tree = render();
  assert.equal(options.enabled, false);
  assert.match(text(tree), /Cargando agendamientos/);
  const pending = [...timers.values()];
  timers.clear();
  pending.forEach((fn) => fn());
  tree = render();
  assert.equal(state[0], 1);
  assert.equal(options.enabled, true);
  const searched = await options.queryFn({});
  assert.equal(searched.filters.search, "987654321");
  assert.equal(searched.page, 1);
  const button = (label) =>
    nodes(tree).find((node) => node.type === "Button" && node.props.children === label);
  const selectDate = nodes(tree).find((node) => node.type === "select");
  selectDate.props.onChange({ target: { value: "meetingDate" } });
  tree = render();
  button("Mes pasado").props.onClick();
  tree = render();
  const previousMonth = require("../src/lib/report-filter-state.ts").rangeForPreset("mesPasado");
  let dated = await options.queryFn({});
  assert.equal(dated.filters.dateField, "meetingDate");
  assert.equal(dated.filters.dateFrom, previousMonth.dateFrom);
  assert.equal(dated.filters.dateTo, previousMonth.dateTo);
  assert.equal(dated.filters.search, "987654321");
  for (const key of ["pipeline", "setter", "booker", "closer", "status", "calendar", "vslOrigin"])
    assert.equal(dated.filters[key], selected.filters[key]);
  button("Este mes").props.onClick();
  tree = render();
  dated = await options.queryFn({});
  const currentMonth = require("../src/lib/report-filter-state.ts").rangeForPreset("mes");
  assert.equal(dated.filters.dateFrom, currentMonth.dateFrom);
  assert.equal(dated.filters.dateTo, currentMonth.dateTo);
  assert.equal(dated.filters.dateField, "meetingDate");
  const dates = nodes(tree).filter((node) => node.type === "input" && node.props.type === "date");
  dates[0].props.onChange({ target: { value: "2026-10-31", validity: { valid: true } } });
  dates[1].props.onChange({ target: { value: "2026-10-01", validity: { valid: true } } });
  tree = render();
  assert.equal(options.enabled, false);
  assert.match(text(tree), /Desde debe ser anterior o igual a Hasta/);
  button("Limpiar fechas").props.onClick();
  tree = render();
  dated = await options.queryFn({});
  assert.equal(options.enabled, true);
  assert.equal(dated.page, 1);
  assert.equal(dated.filters.dateFrom, "");
  assert.equal(dated.filters.dateTo, "");
  assert.equal(dated.filters.dateField, "meetingDate");
  assert.equal(dated.filters.search, "987654321");
  assert.equal(
    selected.filters.dateFrom,
    filters.dateFrom,
    "modal edits never mutate global filters",
  );
  for (const [label, value, key] of [
    ["Tipo de agendamiento", "automatic", "bookingMode"],
    ["Diferencia de días", "0", "dayGap"],
  ]) {
    state[0] = 2;
    tree = render();
    nodes(tree)
      .find((node) => node.type === "select" && node.props["aria-label"] === label)
      .props.onChange({ target: { value } });
    tree = render();
    const filtered = await options.queryFn({});
    assert.equal(filtered.page, 1);
    assert.equal(filtered.filters[key], value);
    assert.equal(filtered.filters.dateField, "meetingDate");
  }
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
