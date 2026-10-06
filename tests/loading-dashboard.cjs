const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename,
  );
};

// Exercise the actual page handlers with controlled query responses and hook state.
function harness(autoFrames = true) {
  let clock = 0,
    nextId = 0;
  const frames = new Map(),
    timers = new Map();
  const paint = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((fn) => fn());
  };
  const state = [];
  let cursor = 0;
  const notices = [];
  const query = { isLoading: true, isFetching: false, isError: false, data: undefined };
  const api = { post: async () => ({ ok: true, inserted: 2, updated: 17, errors: 0 }) };
  const components = new Map();
  const component = (name) => {
    if (!components.has(name)) components.set(name, name);
    return components.get(name);
  };
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  const source = ts
    .transpileModule(fs.readFileSync("src/pages/VslClosersDashboard.tsx", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    })
    .outputText.replaceAll("import.meta.env.DEV", "false");
  vm.runInNewContext(source, {
    exports,
    requestAnimationFrame: (fn) => {
      const id = ++nextId;
      frames.set(id, fn);
      return id;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout: (fn, delay) => {
      const id = ++nextId;
      timers.set(id, { fn, at: clock + delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "react")
        return {
          useState(initial) {
            const index = cursor++;
            if (!(index in state)) state[index] = initial;
            return [
              state[index],
              (value) => {
                state[index] = typeof value === "function" ? value(state[index]) : value;
              },
            ];
          },
          useRef(initial) {
            const index = cursor++;
            return (state[index] ??= { current: initial });
          },
          useEffect(fn, deps) {
            if (deps[0] === query.data && (deps.length === 1 || typeof deps[1] === "string")) fn();
            if (deps.length === 2 && deps.every((value) => typeof value === "boolean")) fn();
          },
          useMemo: (fn) => fn(),
          useCallback: (fn) => fn,
        };
      if (name === "@tanstack/react-query")
        return {
          useQuery: (options) => {
            query.options = options;
            return query;
          },
        };
      if (name === "sonner")
        return {
          toast: Object.fromEntries(
            ["success", "error", "warning"].map((kind) => [
              kind,
              (...args) => notices.push([kind, ...args]),
            ]),
          ),
        };
      if (name.includes("reconciliation.service"))
        return { triggerVslReconciliation: () => api.post() };
      if (name.includes("pipeline-summary")) return require("../src/lib/pipeline-summary.ts");
      if (name.includes("setter-performance")) return require("../src/lib/setter-performance.ts");
      if (name.includes("report-filter-state")) return require("../src/lib/report-filter-state.ts");
      if (name.includes("services/reports")) return require("../src/services/reports.ts");
      return new Proxy({}, { get: (_, key) => component(key) });
    },
  });
  let tree;
  function render() {
    if (autoFrames) {
      paint();
      paint();
    }
    cursor = 0;
    tree = exports.VslClosersDashboard();
    cursor = 0;
    tree = exports.VslClosersDashboard();
  }
  function find(type, node = tree) {
    if (!node || typeof node !== "object") return undefined;
    if (node.type === type) return node;
    const children = node.props?.children;
    return (Array.isArray(children) ? children.flat(Infinity) : [children])
      .map((child) => (child ? find(type, child) : undefined))
      .find(Boolean);
  }
  function findAll(type, node = tree) {
    if (!node || typeof node !== "object") return [];
    const children = node.props?.children;
    return [
      ...(node.type === type ? [node] : []),
      ...(Array.isArray(children) ? children.flat(Infinity) : [children]).flatMap((child) =>
        child ? findAll(type, child) : [],
      ),
    ];
  }
  function loaded() {
    query.isLoading = false;
    query.data = {
      updatedAt: "2026-09-08",
      kpis: { total: 1 },
      leadTypeKpis: { totalLeads: 1, attended: 1, attendanceRate: 100 },
      setters: [],
    };
    query.refetch = async () => ({ isError: false });
    render();
  }
  render();
  const advance = (ms) => {
    clock += ms;
    for (const [id, timer] of timers)
      if (timer.at <= clock) {
        timers.delete(id);
        timer.fn();
      }
    render();
  };
  return { query, api, notices, render, find, findAll, loaded, paint, advance };
}

test("cards y secciones de agenda consumen los agregados Calendar de la misma respuesta", () => {
  const h = harness();
  h.loaded();
  const setters = [
    {
      setter: "Ana",
      confirmado: 150,
      asistio: 92,
      cancelado: 10,
      noShow: 15,
      total: 267,
      agendadoCRM: 20,
      pendienteAgenda: 3,
      reagendado: 2,
    },
  ];
  const kpis = {
    total: 783,
    confirmado: 300,
    asistio: 357,
    cancelado: 50,
    noShow: 76,
    tasaAsistencia: 45.59,
  };
  h.query.data = {
    ...h.query.data,
    pipelineSummary: {
      vsl: { totalLeads: 1000, conCitaCalendar: 500 },
      oei: { totalLeads: 828, conCitaCalendar: 283 },
    },
    kpis,
    setters,
    leadTypeKpis: { totalLeads: 1828 },
  };
  h.render();
  const cards = h.findAll("KpiCard").map((card) => card.props);
  assert.deepEqual(
    cards.map((card) => card.value),
    [1828, 783, 357],
  );
  assert.equal(cards[1].hint, "43% de los leads agendaron");
  assert.equal(cards[2].hint, "45.59% de asistencia");
  assert.equal(h.find("SetterStatusTable").props.rows, setters);
  assert.equal(h.find("SetterStatusTable").props.totals, kpis);
  assert.equal(h.find("SetterStatusChart").props.rows, setters);
  assert.equal(h.find("SetterStatusChart").props.tasaAsistencia, 45.59);
  assert.equal(h.find("ConversionSummary").props.kpis, kpis);
});

test("period cards preserve the four independent API cohorts", () => {
  const h = harness();
  h.loaded();
  // Expected API results: new lead without appointment; old lead with current
  // appointment; old lead with only a current payment; all three in period.
  for (const [leads, appointments, sales] of [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 1, 1],
  ]) {
    h.query.data = {
      ...h.query.data,
      filters: { dateFrom: "2026-09-01", dateTo: "2026-09-30" },
      leadTypeKpis: { totalLeads: leads },
      kpis: { total: appointments, asistio: appointments, tasaAsistencia: appointments * 100 },
      sales: { total: sales, byStage: [], rows: [] },
      detail: [],
      pipelineSummary: { vsl: { totalLeads: 999, conCitaCalendar: 999 } },
    };
    h.render();
    const cards = h.findAll("KpiCard").map((card) => card.props);
    assert.deepEqual(
      cards.map((card) => card.value),
      [leads, appointments, appointments],
    );
    assert.equal(cards[1].hint, `${appointments} citas en el período`);
    assert.equal(h.find("SalesSection").props.sales.total, sales);
    assert.equal(h.find("ConversionSummary").props.kpis.total, appointments);
  }
});

test("period presets keep Peru dates, seven inclusive days, and empty Todo bounds", () => {
  const h = harness();
  h.loaded();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const day = (offset) => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  for (const [preset, from, to] of [
    ["hoy", today, today],
    ["ayer", day(-1), day(-1)],
    ["7dias", day(-6), today],
    ["mes", `${today.slice(0, 7)}-01`, today],
    ["todos", "", ""],
  ]) {
    h.find("DashboardFilters").props.onPreset(preset);
    h.render();
    const filters = h.query.options.queryKey[1];
    assert.equal(filters.dateFrom, from);
    assert.equal(filters.dateTo, to);
  }
});

test("el pie de Desempeño por Setter suma solo las filas permitidas", () => {
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  const source = ts.transpileModule(
    fs.readFileSync("src/components/reports/SetterStatusTable.tsx", "utf8"),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    },
  ).outputText;
  vm.runInNewContext(source, {
    exports,
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "react")
        return { useState: (value) => [value, () => {}], useMemo: (fn) => fn() };
      if (name === "lucide-react") return { ArrowUpDown: "ArrowUpDown" };
      if (name.includes("setter-performance")) return require("../src/lib/setter-performance.ts");
      throw new Error(name);
    },
  });
  const tree = exports.SetterStatusTable({
    rows: [
      { setter: "Kiara", confirmado: 300, asistio: 344, cancelado: 100, noShow: 202, total: 946 },
      { setter: "Otro", confirmado: 999, asistio: 999, cancelado: 999, noShow: 999, total: 999 },
    ],
    totals: {
      confirmado: 250,
      asistio: 344,
      cancelado: 75,
      noShow: 74,
      total: 743,
      tasaAsistencia: 36.4,
    },
  });
  const visit = (node, type) => {
    if (!node || typeof node !== "object") return undefined;
    if (node.type === type) return node;
    const children = node.props?.children;
    return (Array.isArray(children) ? children.flat(Infinity) : [children])
      .map((child) => visit(child, type))
      .find(Boolean);
  };
  const text = (node) =>
    node == null
      ? ""
      : typeof node === "object"
        ? (Array.isArray(node.props?.children)
            ? node.props.children.flat(Infinity)
            : [node.props?.children]
          )
            .map(text)
            .join("")
        : String(node);
  assert.equal(text(visit(tree, "tfoot")), "Total general30034436%100202946");
});

test("los nombres y cifras de Sin setter abren el mismo detalle", () => {
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  const source = ts.transpileModule(
    fs.readFileSync("src/components/reports/SetterStatusTable.tsx", "utf8"),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    },
  ).outputText;
  vm.runInNewContext(source, {
    exports,
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "react")
        return { useState: (value) => [value, () => {}], useMemo: (fn) => fn() };
      if (name === "lucide-react") return { ArrowUpDown: "ArrowUpDown" };
      if (name.includes("setter-performance")) return require("../src/lib/setter-performance.ts");
      throw new Error(name);
    },
  });
  const calls = [];
  const tree = exports.SetterStatusTable({
    rows: [
      {
        setter: "Sin setter",
        confirmado: 54,
        asistio: 100,
        cancelado: 105,
        noShow: 54,
        total: 313,
      },
    ],
    totals: { confirmado: 54, asistio: 100, cancelado: 105, noShow: 54, total: 313 },
    mode: "setter",
    onDetail: (...args) => calls.push(args),
  });
  const nodes = (node) =>
    !node || typeof node !== "object"
      ? []
      : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
  const detailButtons = nodes(tree).filter((node) => node.type === "button" && node.props.onClick);
  const click = (label) =>
    detailButtons.find((button) => button.props["aria-label"] === label).props.onClick();

  click("Ver todos los agendamientos de Sin setter");
  click("Ver 100 agendamientos de Sin setter: Asistió");
  click("Ver 105 agendamientos de Sin setter: Cancelado");
  click("Ver 313 agendamientos de Sin setter");

  assert.deepEqual(calls, [
    ["Sin setter", undefined, 313, ["Sin setter"]],
    ["Sin setter", "Asistió", 100, ["Sin setter"]],
    ["Sin setter", "Cancelado", 105, ["Sin setter"]],
    ["Sin setter", undefined, 313, ["Sin setter"]],
  ]);
});

test("el nombre del agendador también abre el detalle en OEI y LIG", () => {
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  const source = ts.transpileModule(
    fs.readFileSync("src/components/reports/SetterStatusTable.tsx", "utf8"),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    },
  ).outputText;
  vm.runInNewContext(source, {
    exports,
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "react")
        return { useState: (value) => [value, () => {}], useMemo: (fn) => fn() };
      if (name === "lucide-react") return { ArrowUpDown: "ArrowUpDown" };
      if (name.includes("setter-performance")) return require("../src/lib/setter-performance.ts");
      throw new Error(name);
    },
  });

  for (const pipeline of ["oei", "lig"]) {
    const calls = [];
    const tree = exports.SetterStatusTable({
      rows: [{ setter: "Alvaro Jesus Paniura Marin", total: 30 }],
      totals: { total: 30 },
      mode: "booker",
      showStatuses: false,
      onDetail: (...args) => calls.push(args),
    });
    const nodes = (node) =>
      !node || typeof node !== "object"
        ? []
        : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
    const nameButton = nodes(tree).find(
      (node) =>
        node.type === "button" &&
        node.props["aria-label"] === "Ver todos los agendamientos de Alvaro Jesus Paniura Marin",
    );
    assert.ok(nameButton, pipeline);
    nameButton.props.onClick();
    assert.deepEqual(
      calls,
      [["Alvaro Jesus Paniura Marin", undefined, 30, ["Alvaro Jesus Paniura Marin"]]],
      pipeline,
    );
  }
});
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("initial loading closes on success or error; retry remains available", () => {
  const h = harness();
  assert.equal(h.find("LoadingModal").props.title, "Cargando reporte...");
  assert.equal(h.find("LoadingModal").props.open, false);
  assert.ok(h.find("Skeleton"));
  h.query.isLoading = false;
  h.query.isError = true;
  h.render();
  assert.equal(h.find("LoadingModal").props.open, false);
  assert.equal(h.find("button").props.children, "Reintentar");
  h.loaded();
  assert.ok(h.find("SetterStatusTable"));
});

test("lead type changes reset incompatible filters and survive reconciliation", async () => {
  const h = harness();
  h.loaded();
  assert.equal(h.query.options.queryKey[1].pipeline, "all");
  assert.equal(h.query.options.queryKey[1].leadType, "all");
  h.find("DashboardFilters").props.onChange({ pipeline: "vsl" });
  h.render();
  h.find("DashboardFilters").props.onChange({
    dateFrom: "2026-08-01",
    dateTo: "2026-08-31",
    setter: "Jose Luis",
  });
  h.render();
  h.find("input").props.onChange({ target: { checked: true } });
  h.render();
  h.find("LeadDetailTable").props.onChange({ page: 4 });
  h.render();
  h.find("DashboardFilters").props.onChange({ leadType: "organic" });
  h.render();
  const filters = h.query.options.queryKey[1];
  assert.equal(filters.dateFrom, "2026-08-01");
  assert.equal(filters.dateTo, "2026-08-31");
  assert.equal(filters.setter, "Jose Luis");
  assert.equal(filters.pipeline, "vsl");
  assert.equal(filters.leadType, "organic");
  assert.equal(h.query.options.queryKey[2].page, 1);
  h.query.isFetching = true;
  h.render();
  assert.equal(h.find("LoadingModal").props.open, false);
  assert.ok(h.find("Skeleton"));
  h.query.isFetching = false;
  h.query.data.leadType = "organic";
  h.advance(350);
  assert.equal(h.find("KpiCard").props.label, "Total de leads");
  assert.equal(h.find("SetterStatusTable").props.rows, h.find("SetterStatusChart").props.rows);
  await h.find("RefreshButton").props.onClick();
  h.render();
  assert.equal(h.query.options.queryKey[1].leadType, "organic");
  assert.equal(h.query.options.queryKey[1].pipeline, "vsl");
});

test("one continuous modal spans POST and GET, blocks duplicate calls, and renders fresh data", async () => {
  const h = harness();
  h.loaded();
  const post = deferred(),
    get = deferred();
  let posts = 0,
    gets = 0;
  h.api.post = () => {
    posts++;
    return post.promise;
  };
  h.query.refetch = () => {
    gets++;
    return get.promise;
  };
  const click = h.find("RefreshButton").props.onClick;
  const pending = click();
  await click();
  h.render();
  assert.equal(posts, 1);
  assert.equal(gets, 0);
  assert.equal(h.find("RefreshButton").props.busy, true);
  assert.equal(h.find("LoadingModal").props.title, "Actualizando datos...");
  post.resolve({ ok: true, inserted: 2, updated: 17, errors: 0 });
  await new Promise(setImmediate);
  h.render();
  assert.equal(gets, 1);
  assert.equal(h.find("LoadingModal").props.open, true);
  assert.equal(h.notices.length, 0);
  h.query.data = { ...h.query.data, setters: [{ setter: "Updated", total: 2 }] };
  get.resolve({ isError: false });
  await pending;
  h.render();
  assert.equal(h.find("LoadingModal").props.open, false);
  assert.equal(h.find("SetterStatusTable").props.rows[0].setter, "Updated");
  assert.equal(h.notices[0][1], "Datos actualizados correctamente");
  assert.equal(h.notices[0][2].description, "2 nuevos · 17 actualizados");
});

test("zero changes uses the already-updated message", async () => {
  const h = harness();
  h.loaded();
  h.api.post = async () => ({ ok: true, inserted: 0, updated: 0, errors: 0 });
  await h.find("RefreshButton").props.onClick();
  assert.equal(h.notices[0][2].description, "Los datos ya estaban actualizados");
});

for (const stage of ["POST", "GET"])
  test(`${stage} failure closes modal and preserves valid dashboard`, async () => {
    const h = harness();
    h.loaded();
    const previous = h.query.data;
    if (stage === "POST")
      h.api.post = async () => {
        throw new Error("Failed");
      };
    else
      h.query.refetch = async () => {
        h.query.isError = true;
        return { isError: true };
      };
    await h.find("RefreshButton").props.onClick();
    h.render();
    assert.equal(h.find("LoadingModal").props.open, false);
    assert.equal(h.find("RefreshButton").props.busy, false);
    assert.equal(h.query.data, previous);
    assert.ok(h.find("SetterStatusTable"));
    assert.equal(
      h.notices[0][1],
      stage === "POST"
        ? "No se pudo actualizar la información."
        : "La sincronización terminó, pero no se pudo recargar el reporte. Intenta nuevamente.",
    );
  });

test("sales uses the same query data as the setter table across filters and refresh", async () => {
  const h = harness();
  h.loaded();
  const first = { total: 1, byStage: [], rows: [] };
  h.query.data.sales = first;
  h.query.data.salesAvailable = true;
  h.render();
  assert.equal(h.find("SalesSection").props.sales, first);
  h.find("DashboardFilters").props.onChange({ pipeline: "vsl" });
  h.render();
  h.find("DashboardFilters").props.onChange({ leadType: "organic" });
  h.render();
  h.find("DashboardFilters").props.onChange({
    dateFrom: "2026-09-01",
    dateTo: "2026-09-08",
    setter: "Ana",
    closer: "Pedro",
    estadoAgenda: "No asistió",
    vslOrigen: "No agendado",
  });
  h.query.isFetching = true;
  h.render();
  assert.equal(h.find("LoadingModal").props.open, false);
  assert.ok(h.find("Skeleton"));
  const fresh = { total: 0, byStage: [], rows: [] };
  h.query.data = { ...h.query.data, sales: fresh, leadType: "organic" };
  h.query.isFetching = false;
  h.advance(350);
  assert.equal(h.find("SalesSection").props.sales, fresh);
  assert.equal(h.query.options.queryKey[1].estadoAgenda, "No asistió");
  await h.find("RefreshButton").props.onClick();
  h.render();
  assert.equal(h.find("SalesSection").props.sales, h.query.data.sales);
});

test("all filter handlers show stable skeletons without a modal or reconciliation", () => {
  const h = harness(false);
  h.loaded();
  let posts = 0;
  h.api.post = () => {
    posts++;
  };
  const changes = [
    { pipeline: "vsl" },
    { pipeline: "oei" },
    { pipeline: "all" },
    { leadType: "paid" },
    { leadType: "organic" },
    { calendar: "Calendar A" },
    { calendar: "Calendar B" },
    { setter: "Setter" },
    { booker: "Booker" },
    { estadoAgenda: "Asistió" },
    { vslOrigen: "Origen" },
    { closer: "Closer" },
    { dateFrom: "2026-09-01", preset: "custom" },
    { dateTo: "2026-09-21", preset: "custom" },
  ];
  const actions = [
    ...changes.map((change) => () => h.find("DashboardFilters").props.onChange(change)),
    ...["todos", "hoy", "ayer", "7dias", "mes", "custom"].map(
      (preset) => () => h.find("DashboardFilters").props.onPreset(preset),
    ),
    () => h.find("DashboardFilters").props.onClear(),
  ];
  for (const action of actions) {
    const previousFilters = h.query.options.queryKey[1];
    action();
    h.render();
    assert.equal(h.find("LoadingModal").props.open, false);
    assert.ok(h.find("Skeleton"));
    assert.equal(
      h.query.options.queryKey[1],
      previousFilters,
      "placeholder precedes filter application",
    );
    h.paint();
    h.paint();
    h.render();
    h.advance(349);
    assert.equal(h.find("LoadingModal").props.open, false);
    assert.ok(h.find("Skeleton"));
    h.advance(1);
    assert.equal(h.find("LoadingModal").props.open, false);
  }
  assert.equal(posts, 0);
});

test("latest filter wins and the skeleton waits for a pending GET, including failure", () => {
  const h = harness(false);
  h.loaded();
  const change = (pipeline) => h.find("DashboardFilters").props.onChange({ pipeline });
  change("vsl");
  change("oei");
  change("vsl");
  h.render();
  h.paint();
  h.paint();
  h.render();
  assert.equal(h.query.options.queryKey[1].pipeline, "vsl");
  h.advance(200);
  change("oei");
  h.render();
  h.paint();
  h.paint();
  h.render();
  h.advance(150);
  assert.equal(h.find("LoadingModal").props.open, false);
  assert.ok(h.find("Skeleton"));
  h.query.isFetching = true;
  h.advance(200);
  assert.equal(h.find("LoadingModal").props.open, false);
  assert.ok(h.find("Skeleton"));
  h.query.isFetching = false;
  h.query.isError = true;
  h.render();
  assert.equal(h.find("LoadingModal").props.open, false);
  assert.equal(h.query.options.queryKey[1].pipeline, "oei");
  assert.ok(h.find("KpiCard"));
});

test("filter changes hide old figures, reset VSL fields, and close appointment details", () => {
  const h = harness();
  h.loaded();
  h.find("DashboardFilters").props.onChange({ pipeline: "vsl" });
  h.render();
  h.advance(350);
  h.find("DashboardFilters").props.onChange({ vslOrigen: "Agendado automatico", leadType: "paid" });
  h.render();
  h.advance(350);
  h.find("SetterStatusTable").props.onDetail("Kiara", "Asistió", 1);
  h.render();
  assert.ok(h.find("AppointmentDetailModal"));
  h.find("DashboardFilters").props.onChange({ pipeline: "oei" });
  h.query.data = undefined;
  h.query.isLoading = true;
  h.query.isFetching = true;
  h.render();
  assert.equal(h.find("AppointmentDetailModal"), undefined);
  assert.equal(h.find("KpiCard"), undefined);
  const filters = h.query.options.queryKey[1];
  assert.equal(filters.pipeline, "oei");
  assert.equal(filters.leadType, "all");
  assert.equal(filters.vslOrigen, "");
});

test("focus refresh retains loaded data without starting a filter transition", () => {
  const h = harness();
  h.loaded();
  const previous = h.query.data;
  assert.equal(h.query.options.refetchOnWindowFocus, true);
  h.query.isFetching = true;
  h.render();
  assert.equal(h.find("LoadingModal").props.open, false);
  assert.ok(h.find("SetterStatusTable"));
  h.query.data = undefined;
  h.query.isLoading = true;
  h.render();
  assert.equal(h.find("LoadingModal").props.open, false);
  assert.equal(h.find("SetterStatusTable").props.rows, previous.setters);
  h.query.isLoading = false;
  h.query.isFetching = false;
  h.query.isError = true;
  h.render();
  assert.equal(h.find("LoadingModal").props.open, false);
  assert.ok(h.find("SetterStatusTable"));
});
