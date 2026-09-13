const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

// Exercise the actual page handlers with controlled query responses and hook state.
function harness() {
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
  const source = ts.transpileModule(fs.readFileSync("src/pages/VslClosersDashboard.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, {
    exports,
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
            if (deps.length === 1 && deps[0] === query.data) fn();
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
      return new Proxy({}, { get: (_, key) => component(key) });
    },
  });
  let tree;
  function render() {
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
  return { query, api, notices, render, find, loaded };
}
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
  assert.equal(h.find("LoadingModal").props.open, true);
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
  assert.equal(filters.setter, "");
  assert.equal(filters.pipeline, "vsl");
  assert.equal(filters.leadType, "organic");
  assert.equal(h.query.options.queryKey[2].page, 1);
  h.query.isFetching = true;
  h.render();
  assert.equal(h.find("LoadingModal").props.open, false);
  h.query.isFetching = false;
  h.query.data.leadType = "organic";
  h.render();
  assert.equal(h.find("KpiCard").props.label, "Leads");
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
  const fresh = { total: 0, byStage: [], rows: [] };
  h.query.data = { ...h.query.data, sales: fresh, leadType: "organic" };
  h.query.isFetching = false;
  h.render();
  assert.equal(h.find("SalesSection").props.sales, fresh);
  assert.equal(h.query.options.queryKey[1].estadoAgenda, "No asistió");
  await h.find("RefreshButton").props.onClick();
  h.render();
  assert.equal(h.find("SalesSection").props.sales, h.query.data.sales);
});

test("focus refresh and failed filter refresh retain loaded data without a modal", () => {
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
