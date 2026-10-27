const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  ts = require("typescript"),
  path = require("node:path"),
  Module = require("node:module");
require.extensions[".ts"] = require.extensions[".tsx"] = (m, file) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    file,
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
const { dailyMeetingsApi } = require("../src/server/api/daily-meetings.api.server.ts");
const { getDailyMeetingsReport } = require("../src/services/daily-meetings.ts");
const range = { pipeline: "all", dateFrom: "2026-10-01", dateTo: "2026-10-31" };
const totals = (n = 0) => ({
  totalCitas: n,
  confirmados: 0,
  cancelados: 0,
  asistidos: n,
  noAsistidos: 0,
  sinEstado: 0,
});
const row = (id, date, pipeline = "vsl") => ({
  appointmentId: id,
  opportunityId: "same-opportunity",
  nombreContacto: "Contacto simulado",
  telefono: "",
  correo: "",
  pipeline,
  embudo: pipeline,
  calendario: "Calendario",
  setter: "",
  agendadorCita: "",
  closer: "",
  estado: "Asistió",
  fechaReunion: date,
  fechaCreacionCita: "2026-09-28",
  fase: "",
});
const fixture = () => ({
  ok: true,
  data: {
    criterioFecha: "meetingDate",
    unidad: "appointmentId",
    alcance: "todos_los_embudos_permitidos",
    ...range,
    porDia: [
      {
        ...totals(2),
        fechaReunion: "2026-10-02",
        detalles: [row("a", "2026-10-02"), row("b", "2026-10-02", "oei")],
      },
      { ...totals(1), fechaReunion: "2026-10-01", detalles: [row("c", "2026-10-01", "lig")] },
    ],
    total: totals(3),
    diasConCitas: 2,
  },
});
const request = (extra = {}) =>
  new Request(
    `https://local.test/api/reports/daily-meetings?${new URLSearchParams({ ...range, ...extra })}`,
  );
async function withApi(payload, fn) {
  const previous = global.fetch,
    env = { ...process.env },
    warn = console.warn;
  const calls = [],
    warnings = [];
  process.env.APPS_SCRIPT_URL = "https://script.google.com/macros/s/fixture/exec";
  process.env.APPS_SCRIPT_SECRET = "private-test-only";
  process.env.NODE_ENV = "production";
  global.fetch = async (input, options) => {
    calls.push({ url: new URL(input), options });
    return Response.json(payload);
  };
  console.warn = (...x) => warnings.push(x);
  try {
    return await fn(calls, warnings);
  } finally {
    global.fetch = previous;
    console.warn = warn;
    for (const key of ["APPS_SCRIPT_URL", "APPS_SCRIPT_SECRET", "NODE_ENV"])
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
  }
}
test("new proxy preserves all funnels, appointment identity and official totals with server-only auth", async () => {
  await withApi(fixture(), async (calls) => {
    const response = await dailyMeetingsApi(request({ pipeline: "all", setter: "ignored" }));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(body.total, totals(3));
    assert.deepEqual(
      body.porDia.map((d) => d.fechaReunion),
      ["2026-10-01", "2026-10-02"],
    );
    assert.equal(body.porDia[1].detalles.length, 2);
    assert.equal(new Set(body.porDia[1].detalles.map((x) => x.opportunityId)).size, 1);
    assert.deepEqual(body.warnings, []);
    assert.equal(calls[0].url.searchParams.get("action"), "daily_meetings_report");
    assert.equal(calls[0].url.searchParams.get("key"), "private-test-only");
    assert.deepEqual([...calls[0].url.searchParams.keys()].sort(), [
      "action",
      "calendar",
      "dateFrom",
      "dateTo",
      "key",
      "pipeline",
    ]);
    assert.doesNotMatch(JSON.stringify(body), /private-test-only/);
  });
});
test("consistency warnings retain official values instead of changing or hiding data", async () => {
  const raw = fixture();
  raw.data.porDia[0].totalCitas = 9;
  raw.data.total.totalCitas = 99;
  await withApi(raw, async (_calls, warnings) => {
    const r = await dailyMeetingsApi(request());
    const b = await r.json();
    assert.equal(r.status, 200);
    assert.equal(b.total.totalCitas, 99);
    assert.equal(b.porDia[1].totalCitas, 9);
    assert.ok(b.warnings.length > 0);
    assert.ok(warnings.length > 0);
    assert.doesNotMatch(
      JSON.stringify(warnings),
      /Contacto simulado|same-opportunity|private-test-only/,
    );
  });
});
test("invalid ranges, duplicate IDs and unrelated dates are rejected; empty is valid", async () => {
  await withApi(fixture(), async (calls) => {
    assert.equal((await dailyMeetingsApi(request({ dateFrom: "2026-02-30" }))).status, 400);
    assert.equal(calls.length, 0);
  });
  for (const mutate of [
    (d) => (d.porDia[0].detalles[1].appointmentId = "a"),
    (d) => (d.porDia[0].detalles[0].fechaReunion = "2026-11-01"),
    (d) => (d.dateTo = "2026-10-30"),
    (d) => delete d.porDia[0].detalles,
  ]) {
    const raw = fixture();
    mutate(raw.data);
    await withApi(raw, async () => assert.equal((await dailyMeetingsApi(request())).status, 502));
  }
  const empty = fixture();
  empty.data.porDia = [];
  empty.data.total = totals();
  empty.data.diasConCitas = 0;
  await withApi(empty, async () =>
    assert.deepEqual((await (await dailyMeetingsApi(request())).json()).total, totals()),
  );
});
test("client sends pipeline and dates and passes AbortSignal, errors remain errors", async () => {
  const previous = global.fetch,
    controller = new AbortController();
  try {
    global.fetch = async (url, options) => {
      const q = new URL(url, "https://local.test");
      assert.equal(q.pathname, "/api/reports/daily-meetings");
      assert.deepEqual([...q.searchParams.keys()], ["pipeline", "dateFrom", "dateTo", "calendar"]);
      assert.equal(q.searchParams.get("pipeline"), "all");
      assert.equal(options.signal, controller.signal);
      return Response.json({ message: "upstream unavailable" }, { status: 502 });
    };
    await assert.rejects(getDailyMeetingsReport(range, controller.signal), /upstream unavailable/);
  } finally {
    global.fetch = previous;
  }
});

function ui(initial) {
  const query = {
      isPending: false,
      isFetching: false,
      isError: false,
      data: initial,
      refetch: () => {
        query.retries++;
      },
      retries: 0,
    },
    states = new Map();
  let current,
    props = { ...range };
  const jsx = (type, props, key) => ({ type, props, key }),
    exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync("src/components/reports/DailyMeetingsReport.tsx", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      exports,
      require(name) {
        if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
        if (name === "react")
          return {
            useState(value) {
              const h = current,
                i = h.cursor++;
              if (!(i in h.values)) h.values[i] = value;
              return [
                h.values[i],
                (v) => (h.values[i] = typeof v === "function" ? v(h.values[i]) : v),
              ];
            },
            useRef(value) {
              const h = current,
                i = h.cursor++;
              return (h.values[i] ??= { current: value });
            },
          };
        if (name === "@tanstack/react-query")
          return {
            useQuery: (options) => {
              query.options = options;
              return query;
            },
          };
        if (name === "./ExecutiveTable") return { ExecutiveTable: "DetailTable" };
        if (name === "@/components/ui/dialog")
          return Object.fromEntries(
            ["Dialog", "DialogContent", "DialogTitle", "DialogDescription", "DialogHeader"].map(
              (n) => [n, n],
            ),
          );
        return require(name);
      },
    },
  );
  function expand(n) {
    if (!n || typeof n !== "object") return n;
    if (Array.isArray(n)) return n.map(expand);
    if (typeof n.type === "function") {
      const k = n.type.name + (n.key || "");
      if (!states.has(k)) states.set(k, { values: [], cursor: 0 });
      current = states.get(k);
      current.cursor = 0;
      return expand(n.type(n.props));
    }
    return { ...n, props: { ...n.props, children: expand(n.props?.children) } };
  }
  const collect = (n) =>
    !n || typeof n !== "object"
      ? []
      : Array.isArray(n)
        ? n.flatMap(collect)
        : [n, ...collect(n.props?.children)];
  let tree;
  const render = () => (tree = expand(jsx(exports.DailyMeetingsReport, props)));
  render();
  return {
    query,
    render,
    nodes: () => collect(tree),
    setRange: (range) => {
      props = { ...props, ...range };
      render();
    },
  };
}
test("daily table sorts without moving TOTAL GENERAL, modal uses only selected appointment IDs", () => {
  const raw = fixture().data,
    h = ui({ ...raw, porDia: [...raw.porDia].reverse(), warnings: [] });
  const rows = () =>
    h
      .nodes()
      .filter((n) => n.type === "tr" && n.key)
      .map((n) => n.key);
  assert.deepEqual(Array.from(rows()), ["2026-10-01", "2026-10-02"]);
  h.nodes()
    .find((n) => n.type === "button" && n.props.children === "Fecha de reunión ↕")
    .props.onClick();
  h.render();
  assert.deepEqual(Array.from(rows()), ["2026-10-02", "2026-10-01"]);
  assert.equal(h.nodes().filter((n) => n.type === "tfoot").length, 1);
  let restored = 0;
  h.nodes()
    .find((n) => n.type === "button" && n.props["aria-label"] === "Ver detalle del 02/10/2026")
    .props.onClick({
      currentTarget: {
        focus() {
          restored++;
        },
      },
    });
  h.render();
  const detail = h.nodes().find((n) => n.type === "DetailTable");
  assert.equal(detail.props.rows.length, 2);
  assert.equal(detail.props.columns.length, 12);
  assert.equal(detail.props.rowKey(detail.props.rows[1]), "b");
  assert.ok(detail.props.rows.every((r) => r.fechaReunion === "2026-10-02"));
  const modal = h.nodes().find((n) => n.type === "DialogContent");
  modal.props.onEscapeKeyDown();
  h.render();
  assert.equal(
    h.nodes().find((n) => n.type === "Dialog"),
    undefined,
  );
  modal.props.onCloseAutoFocus({ preventDefault() {} });
  assert.equal(restored, 1);
  h.nodes()
    .find((n) => n.type === "button" && n.props["aria-label"] === "Ver detalle del 01/10/2026")
    .props.onClick();
  h.render();
  h.setRange({ dateFrom: "2026-11-01", dateTo: "2026-11-30" });
  assert.equal(
    h.nodes().find((n) => n.type === "Dialog"),
    undefined,
  );
  assert.deepEqual(Array.from(h.query.options.queryKey), [
    "daily-meetings",
    "all",
    "2026-11-01",
    "2026-11-30",
    "",
  ]);
});
test("loading, empty and retry states never fabricate zero counts on failure", () => {
  const h = ui(undefined);
  h.query.isPending = true;
  h.render();
  assert.ok(h.nodes().some((n) => n.type === "p" && /Cargando citas/.test(n.props.children)));
  assert.equal(
    h.nodes().find((n) => n.type === "table"),
    undefined,
  );
  h.query.isPending = false;
  h.query.isError = true;
  h.query.error = new Error("Test failure");
  h.render();
  h.nodes()
    .find((n) => n.type === "button" && n.props.children === "Reintentar")
    .props.onClick();
  assert.equal(h.query.retries, 1);
  h.query.isError = false;
  h.query.data = { ...fixture().data, porDia: [], total: totals(), warnings: [] };
  h.render();
  assert.ok(
    h
      .nodes()
      .some(
        (n) => n.type === "td" && n.props.children === "No hay citas en el período seleccionado.",
      ),
  );
});
test("late responses cannot replace the selected pipeline at the same dates", async () => {
  const { QueryClient, QueryObserver } = require("@tanstack/react-query");
  const client = new QueryClient();
  let first, second;
  const observer = new QueryObserver(client, {
    queryKey: ["daily-meetings", "vsl", range.dateFrom, range.dateTo],
    queryFn: () => new Promise((resolve) => (first = resolve)),
  });
  const stop = observer.subscribe(() => {});
  observer.setOptions({
    queryKey: ["daily-meetings", "oei", range.dateFrom, range.dateTo],
    queryFn: () => new Promise((resolve) => (second = resolve)),
  });
  second("new-data");
  await new Promise((resolve) => setTimeout(resolve, 5));
  first("old-data");
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(observer.getCurrentResult().data, "new-data");
  stop();
  client.clear();
});

test("all supported pipeline identifiers reach Apps Script without other filters or client reclassification", async () => {
  for (const pipeline of ["vsl", "oei", "lig", "organico", "gira", "all"]) {
    const raw = fixture();
    raw.data.pipeline = pipeline;
    raw.data.alcance = pipeline === "all" ? "todos_los_embudos_permitidos" : "embudo_seleccionado";
    // The proxy must not rewrite backend attribution, rows or official counts.
    await withApi(raw, async (calls) => {
      const response = await dailyMeetingsApi(
        request({ pipeline, setter: "ignored", calendar: "ignored", leadType: "ignored" }),
      );
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.pipeline, pipeline);
      assert.equal(calls[0].url.searchParams.get("pipeline"), pipeline);
      assert.deepEqual([...calls[0].url.searchParams.keys()].sort(), [
        "action",
        "calendar",
        "dateFrom",
        "dateTo",
        "key",
        "pipeline",
      ]);
      assert.deepEqual(body.total, raw.data.total);
      assert.deepEqual(body.porDia[1].detalles, raw.data.porDia[0].detalles);
    });
  }
  await withApi(fixture(), async (calls) => {
    assert.equal((await dailyMeetingsApi(request({ pipeline: "invalid" }))).status, 400);
    assert.equal(calls.length, 0);
    assert.equal((await dailyMeetingsApi(request({ pipeline: "vsl" }))).status, 502);
  });
});

test("pipeline changes update title, cache identity and modal selection even when dates stay unchanged", async () => {
  const h = ui({ ...fixture().data, warnings: [] });
  h.setRange({ ...range, pipeline: "vsl" });
  assert.equal(
    h
      .nodes()
      .find((n) => n.type === "h3")
      .props.children.join(""),
    "Citas por fecha de reunión — VSL | Closers",
  );
  assert.deepEqual(Array.from(h.query.options.queryKey), [
    "daily-meetings",
    "vsl",
    range.dateFrom,
    range.dateTo,
    "",
  ]);
  h.nodes()
    .find((n) => n.type === "button" && n.props["aria-haspopup"] === "dialog")
    .props.onClick();
  h.render();
  assert.ok(h.nodes().find((n) => n.type === "Dialog"));
  h.setRange({ ...range, pipeline: "oei" });
  assert.equal(
    h.nodes().find((n) => n.type === "Dialog"),
    undefined,
  );
  assert.equal(
    h
      .nodes()
      .find((n) => n.type === "h3")
      .props.children.join(""),
    "Citas por fecha de reunión — Lanzamiento I. Pagado OEI - EM",
  );
  assert.deepEqual(Array.from(h.query.options.queryKey), [
    "daily-meetings",
    "oei",
    range.dateFrom,
    range.dateTo,
    "",
  ]);
  const previous = global.fetch;
  try {
    global.fetch = async (input) => {
      const q = new URL(input, "https://local.test").searchParams;
      assert.equal(q.get("pipeline"), "oei");
      assert.equal(q.get("dateFrom"), range.dateFrom);
      assert.equal(q.get("dateTo"), range.dateTo);
      return Response.json({});
    };
    await h.query.options.queryFn({ signal: undefined });
  } finally {
    global.fetch = previous;
  }
});

test("meeting attendance column replaces Sin estado and uses row/official total percentages", async () => {
  const raw = fixture();
  raw.data.porDia = [
    { ...totals(7), asistidos: 4, confirmados: 3, fechaReunion: "2026-10-01", detalles: [] },
    { ...totals(10), asistidos: 5, confirmados: 5, fechaReunion: "2026-10-02", detalles: [] },
    { ...totals(0), fechaReunion: "2026-10-03", detalles: [] },
  ];
  raw.data.total = { ...totals(17), asistidos: 9, confirmados: 8 };
  const h = ui({ ...raw.data, warnings: [] });
  const daily = () => h.nodes().filter((n) => n.type === "tr" && n.key);
  assert.deepEqual(
    Array.from(daily(), (n) => n.props.children[2].props.children),
    ["57.14 %", "50.00 %", "0.00 %"],
  );
  const headers = h.nodes().filter((n) => n.type === "th" && n.props.scope === "col");
  assert.equal(headers.length, 8);
  assert.equal(JSON.stringify(headers).includes("Sin estado"), false);
  assert.ok(h.nodes().some((n) => n.type === "button" && n.props.children === "% Asistencia ↕"));
  const footer = () => h.nodes().find((n) => n.type === "tfoot").props.children;
  assert.equal(footer().props.children[2].props.children, "52.94 %");
  h.nodes()
    .find((n) => n.type === "button" && n.props.children === "% Asistencia ↕")
    .props.onClick();
  h.render();
  assert.deepEqual(
    Array.from(daily(), (n) => n.key),
    ["2026-10-03", "2026-10-02", "2026-10-01"],
  );
  assert.equal(footer().props.children[2].props.children, "52.94 %");
  raw.data.porDia[0].porcentajeAsistencia = 56.78;
  raw.data.total.porcentajeAsistencia = 53.21;
  h.query.data = { ...raw.data, warnings: [] };
  h.render();
  assert.equal(
    daily().find((n) => n.key === "2026-10-01").props.children[2].props.children,
    "56.78 %",
  );
  assert.equal(footer().props.children[2].props.children, "53.21 %");
  await withApi(raw, async () => {
    const response = await dailyMeetingsApi(request());
    const body = await response.json();
    assert.equal(body.porDia[0].porcentajeAsistencia, 56.78);
    assert.equal(body.total.porcentajeAsistencia, 53.21);
  });
});

test("calendar is forwarded literally, included in cache identity and closes the prior modal", async () => {
  const calendar = "VSL PAGADO - CIRCULO MILLONARIO";
  await withApi(
    { ...fixture(), data: { ...fixture().data, pipeline: "vsl", alcance: "embudo_seleccionado" } },
    async (calls) => {
      assert.equal((await dailyMeetingsApi(request({ pipeline: "vsl", calendar }))).status, 200);
      assert.equal(calls[0].url.searchParams.get("calendar"), calendar);
      assert.equal(calls[0].url.searchParams.get("pipeline"), "vsl");
    },
  );
  const h = ui({ ...fixture().data, warnings: [] });
  h.setRange({ ...range, pipeline: "vsl", calendar });
  h.nodes()
    .find((n) => n.type === "button" && n.props["aria-haspopup"] === "dialog")
    .props.onClick();
  h.render();
  assert.ok(h.nodes().find((n) => n.type === "Dialog"));
  assert.equal(h.query.options.queryKey.at(-1), calendar);
  h.setRange({ ...range, pipeline: "vsl", calendar: "VSL PAGADO - EQUIPO MILLONARIO" });
  assert.equal(
    h.nodes().find((n) => n.type === "Dialog"),
    undefined,
  );
});
