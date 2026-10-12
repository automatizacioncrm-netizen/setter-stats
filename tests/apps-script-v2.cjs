const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const source = fs.readFileSync("apps-script/10_API.gs", "utf8");
const names = {
  vsl: "VSL | Closers",
  oei: "Lanzamiento I. Pagado OEI - EM",
  lig: "Lanzamiento Interno Gratuito",
};
const calendars = {
  vsl: "VSL PAGADO - EQUIPO MILLONARIO",
  oei: "Equipo Millonario | OEI",
  lig: "Lanzamiento Interno Gratuito - EM",
};
const headers = [
  "Opportunity ID",
  "Contact ID",
  "Nombre contacto",
  "Telefono",
  "Correo electrónico",
  "Secuencia",
  "Fase",
  "Fuente",
  "Asignado",
  "Creado el",
  "Producto/Evento",
  "Fecha de primer pago",
  "Fecha de cuota 1",
  "Tipo de moneda del precio acordado",
  "Precio Acordado del Producto",
  "Monto de cuota 1",
  "Plan de Pagos",
  "Numero de cuotas pactadas",
  "Moneda del monto acordado",
  "Monto Total Acordado",
  "Monto del último pago",
  "Setter asignado",
  "VSL Origen",
  "Estado de agenda",
  "Fecha de reunión",
  "Numero de citas",
];
const ah = [
  "_Appointment ID",
  "_Opportunity ID",
  "_Contact ID",
  "Embudo",
  "Calendario cita",
  "Estado cita",
  "Fecha cita",
  "_Appointment Created At",
  "_Appointment Updated At",
  "Closer cita",
  "Creado por cita",
];
function opportunity(id, pipeline, sale = true) {
  return {
    "Opportunity ID": id,
    "Contact ID": "contact-" + id,
    "Nombre contacto": "Contacto " + id,
    Telefono: "+51999000111",
    "Correo electrónico": id + "@example.com",
    Secuencia: names[pipeline],
    Fase: sale ? (pipeline === "lig" ? "Ventas" : "Ventas Confirmadas") : "Nuevo",
    Fuente: pipeline === "vsl" ? "VSL FUNNEL" : "",
    Asignado: "Fiorela Bernales",
    "Creado el": "2026-10-01",
    "Producto/Evento": "Equipo Millonario",
    "Fecha de cuota 1": "2026-10-08",
    "Tipo de moneda del precio acordado": "USD",
    "Precio Acordado del Producto": 1497,
    "Monto de cuota 1": 250,
    "Moneda del monto acordado": "PEN",
    "Monto Total Acordado": 9999,
    "Monto del último pago": 88,
    "Setter asignado": "Jose",
    "Fecha de reunión": "2026-10-04",
    "Numero de citas": 0,
  };
}
function appointment(id, oid, pipeline, status = "showed", booker = "Jimena") {
  return {
    "_Appointment ID": id,
    "_Opportunity ID": oid,
    "_Contact ID": "contact-" + oid,
    Embudo: names[pipeline],
    "Calendario cita": calendars[pipeline],
    "Estado cita": status,
    "Fecha cita": "2026-10-04",
    "_Appointment Created At": "2026-10-02",
    "_Appointment Updated At": "2026-10-03T12:00:00Z",
    "Closer cita": "Fiorela Bernales",
    "Creado por cita": booker,
  };
}
function setup(options = {}) {
  const opps = options.opps || [
    opportunity("v1", "vsl"),
    opportunity("v2", "vsl", false),
    opportunity("o1", "oei"),
    opportunity("l1", "lig"),
  ];
  const appts = options.appts || [
    appointment("av1", "v1", "vsl"),
    appointment("av2", "v1", "vsl", "confirmed"),
    appointment("ao1", "o1", "oei"),
    appointment("al1", "l1", "lig"),
    appointment("al1", "l1", "lig"),
  ];
  const properties = new Map([
    ["FRONTEND_SECRET", "test-secret"],
    ["WORKER_CHECKPOINT", "preserve"],
  ]);
  const calls = [];
  const data = {
    OPPORTUNITIES_MASTER: [headers, ...opps.map((o) => headers.map((h) => o[h] ?? ""))],
    APPOINTMENTS_MASTER: [ah, ...appts.map((a) => ah.map((h) => a[h] ?? ""))],
  };
  const c = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    APP_CONFIG: { SHEET_ID: "fixture" },
    GHL_PIPELINES: {
      VSL_CLOSERS: { name: names.vsl },
      OEI_EM: { name: names.oei },
      LIG: { name: names.lig },
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => properties.get(k) || null,
        setProperty: (k, v) => properties.set(k, v),
        deleteProperty: (k) => properties.delete(k),
      }),
    },
    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: (name) => ({
          getLastRow: () => data[name].length,
          getLastColumn: () => data[name][0].length,
          getRange: () => ({ getValues: () => data[name] }),
        }),
      }),
    },
    Session: { getScriptTimeZone: () => "America/Lima" },
    Utilities: { formatDate: (d) => d.toISOString().slice(0, 10) },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (text) => ({
        text,
        setMimeType() {
          return JSON.parse(this.text);
        },
      }),
    },
  });
  for (const [name, stage] of [
    ["OPM_SYNC_MISSING_ONLY", "MISSING"],
    ["OPM_SYNC_UPDATED_ONLY", "UPDATED"],
    ["APPOINTMENTS_MASTER_RECONCILIAR", "APPOINTMENTS"],
    ["OPM_ACTUALIZAR_NUMERO_CITAS", "COUNTS"],
  ]) {
    c[name] = () => {
      calls.push(stage);
      const value = options.results?.[stage];
      if (Array.isArray(value)) return value.shift();
      if (value instanceof Error) throw value;
      return value === undefined ? { success: true, completed: true } : value;
    };
  }
  vm.runInContext(source, c);
  const plain = (value) => JSON.parse(JSON.stringify(value));
  return {
    c,
    properties,
    calls,
    report: (f) => plain(c.API_BUILD_VSL_REPORT(f)),
    detail: (f) => plain(c.API_BUILD_APPOINTMENT_DETAIL(f)),
    post: (action) => c.doPost({ parameter: { action, key: "test-secret" } }),
  };
}
module.exports = { setup };
test("closer normalization is consistent between attended appointments and sale attribution", () => {
  const appt = { ...appointment("al1", "l1", "lig"), "Closer cita": "FIORELA BERNALES" };
  const r = setup({ appts: [appt] }).report({ pipeline: "lig" });
  assert.equal(r.businessMetrics.conversionPorCloser.length, 1);
  assert.equal(r.businessMetrics.conversionPorCloser[0].conversionPct, 100);
  assert.equal(r.businessMetrics.sesionesEntregadasPorCloser[0].closer, "Fiorela Bernales");
});
test("missing booking date is not a zero gap and empty opportunities do not hide real appointments", () => {
  const a = setup({ opps: [] });
  assert.equal(a.report({ pipeline: "lig" }).kpis.total, 1);
  assert.equal(a.c.API_MATCH_DAY_GAP_(null, "0"), false);
  const b = setup();
  const empty = b.c.API_EMPTY_VSL_REPORT("all", "lig");
  assert.ok(empty.businessMetrics);
  assert.equal(empty.businessMetrics.conversionPorEmbudo.length, 3);
});

test("Apps Script syntax, unique top-level declarations and known external dependencies", () => {
  new vm.Script(source);
  const ast = ts.createSourceFile(
    "10_API.js",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  assert.equal(ast.parseDiagnostics.length, 0);
  const globals = [];
  for (const node of ast.statements) {
    if (ts.isFunctionDeclaration(node)) globals.push(node.name.text);
    if (ts.isVariableStatement(node))
      for (const d of node.declarationList.declarations) globals.push(d.name.text);
  }
  assert.equal(new Set(globals).size, globals.length);
  const known = new Set([
    ...globals,
    "String",
    "Number",
    "Boolean",
    "Date",
    "Map",
    "Set",
    "Error",
    "JSON",
    "Object",
    "Array",
    "isNaN",
    "OPM_SYNC_MISSING_ONLY",
    "OPM_SYNC_UPDATED_ONLY",
    "APPOINTMENTS_MASTER_RECONCILIAR",
    "OPM_ACTUALIZAR_NUMERO_CITAS",
  ]);
  const unresolved = new Set();
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      !known.has(node.expression.text) &&
      !["fallback", "createItem"].includes(node.expression.text)
    )
      unresolved.add(node.expression.text);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.deepEqual([...unresolved], []);
  assert.equal(/\bOPM_FULL_SYNC\s*\(/.test(source), false);
});
test("all includes three pipelines and LIG once, including its sale and appointments", () => {
  const a = setup();
  const all = a.report({ pipeline: "all" });
  const lig = a.report({ pipeline: "lig" });
  assert.equal(all.leadTypeKpis.totalLeads, 4);
  assert.equal(all.kpis.total, 4);
  assert.equal(all.sales.total, 3);
  assert.equal(lig.leadTypeKpis.totalLeads, 1);
  assert.equal(lig.kpis.total, 1);
  assert.equal(lig.sales.total, 1);
  assert.ok(lig.detail.rows.every((r) => r.pipeline === "lig"));
  assert.equal(all.businessMetrics.conversionPorEmbudo.find((r) => r.pipeline === "lig").ventas, 1);
});
test("paid/organic apply to VSL only, including stale filters for LIG/OEI", () => {
  const a = setup();
  for (const pipeline of ["oei", "lig"]) {
    assert.equal(a.report({ pipeline, leadType: "organic", vslTipo: "paid" }).sales.total, 1);
    assert.equal(a.detail({ pipeline, leadType: "paid" }).rows.length, 1);
  }
  assert.equal(a.report({ pipeline: "all", leadType: "organic" }).leadTypeKpis.totalLeads, 2);
});
test("booking counts assigned opportunities, not appointments or the booker", () => {
  const a = setup();
  const row = a.report({ pipeline: "all" }).businessMetrics.agendamientoPorSetter[0];
  assert.equal(row.setter, "Jose Luis Botto Garcia");
  assert.equal(row.leadsAsignados, 4);
  assert.equal(row.agendados, 3);
  assert.equal(row.noAgendados, 1);
  assert.equal(row.agendamientoPct, 75);
  const vsl = a.report({ pipeline: "vsl", setter: "Jose" }).businessMetrics
    .agendamientoPorSetter[0];
  assert.equal(vsl.leadsAsignados, 2);
  assert.equal(vsl.agendados, 1);
});
test("monthly VSL uses historical appointments outside the selected dates", () => {
  const a = setup({
    appts: [{ ...appointment("a1", "v1", "vsl"), "_Appointment Created At": "2026-09-01" }],
  });
  const r = a.report({
    pipeline: "all",
    dateFrom: "2026-10-01",
    dateTo: "2026-10-31",
  }).businessMetrics;
  assert.deepEqual(r.leadsNoAgendadosVslPorMes, [
    { month: "2026-10", leads: 2, agendados: 1, noAgendados: 1, noAgendadosPct: 50 },
  ]);
});
test("appointment detail preserves fields and aliases, dates, gap, filters and pagination", () => {
  const a = setup();
  const detail = a.detail({
    pipeline: "lig",
    dayGap: "2",
    bookingMode: "manual",
    dateField: "meetingDate",
    dateFrom: "2026-10-04",
    dateTo: "2026-10-04",
  });
  const r = detail.rows[0];
  assert.equal(r.diferenciaDias, 2);
  assert.equal(r.diferenciaDiasLabel, "2 días");
  for (const key of [
    "appointmentId",
    "opportunityId",
    "contactId",
    "contacto",
    "telefono",
    "correo",
    "pipeline",
    "calendar",
    "setter",
    "booker",
    "closer",
    "status",
    "fechaCita",
    "appointmentCreatedAt",
    "appointmentUpdatedAt",
    "producto",
  ])
    assert.ok(r[key]);
  assert.equal(r.appointmentUpdatedAt, "2026-10-03T12:00:00Z");
  assert.equal(a.detail({ pipeline: "all", page: 2, pageSize: 1 }).pagination.totalRecords, 4);
  assert.equal(a.detail({ pipeline: "lig", dayGap: "0" }).rows.length, 0);
  assert.equal(a.detail({ pipeline: "lig", search: "missing" }).rows.length, 0);
});
test("unique opportunity IDs prevent duplicate sales/cash/leads and unknown pipelines are excluded", () => {
  const o = opportunity("l1", "lig");
  const unknown = { ...opportunity("u1", "lig"), Secuencia: "Unknown" };
  const a = setup({ opps: [o, o, unknown] });
  const r = a.report({ pipeline: "all" });
  assert.equal(r.sales.total, 1);
  assert.equal(r.leadTypeKpis.totalLeads, 1);
  assert.deepEqual(r.businessMetrics.cashPorEmbudoProducto, [
    { pipeline: "lig", producto: "EM", moneda: "USD", cash: 250 },
  ]);
  assert.equal(r.businessMetrics.metadata.cash.historicalTotal, false);
});
test("cash retains historical last payment field, separates currencies and product codes", () => {
  const v = {
    ...opportunity("v1", "vsl"),
    "Fecha de cuota 1": "2026-09-20",
    "Producto/Evento": "Circulo Millonario",
  };
  const o = opportunity("o1", "oei");
  const r = setup({ opps: [v, o] }).report({ pipeline: "all" }).businessMetrics;
  assert.deepEqual(r.cashPorProducto, [
    { producto: "CM", moneda: "PEN", cash: 88 },
    { producto: "EM", moneda: "USD", cash: 250 },
  ]);
  assert.equal(r.sesionesEntregadasPorCloser[0].sesionesEntregadas, 3);
  assert.ok(!JSON.stringify(r).includes("desertados"));
});
test("missing/updated checkpoints gate later phases and worker checkpoints remain untouched", () => {
  const a = setup({
    results: {
      MISSING: [{ completed: false }, { completed: true }],
      UPDATED: [{ completed: false }, { completed: true }],
    },
  });
  for (const expected of [
    ["MISSING"],
    ["MISSING", "MISSING"],
    ["MISSING", "MISSING", "UPDATED"],
    ["MISSING", "MISSING", "UPDATED", "UPDATED"],
  ]) {
    const r = a.post("reconcile_opportunities");
    assert.deepEqual(a.calls, expected);
    assert.equal(r.nextAction, r.completed ? null : "reconcile_opportunities");
    for (const key of [
      "ok",
      "success",
      "completed",
      "stage",
      "nextAction",
      "resultado",
      "timestamp",
    ])
      assert.ok(key in r);
  }
  assert.equal(a.properties.get("WORKER_CHECKPOINT"), "preserve");
  assert.equal(a.calls.includes("COUNTS"), false);
});
test("appointments incomplete never recalculates counts; all respects every stage", () => {
  const a = setup({ results: { APPOINTMENTS: [{ completed: false }, { completed: true }] } });
  assert.equal(a.post("reconcile_all").completed, false);
  assert.deepEqual(a.calls, ["MISSING"]);
  assert.equal(a.post("reconcile_all").completed, false);
  assert.deepEqual(a.calls, ["MISSING", "UPDATED"]);
  assert.equal(a.post("reconcile_all").completed, false);
  assert.deepEqual(a.calls, ["MISSING", "UPDATED", "APPOINTMENTS"]);
  assert.equal(a.post("reconcile_all").completed, true);
  assert.deepEqual(a.calls, ["MISSING", "UPDATED", "APPOINTMENTS", "APPOINTMENTS", "COUNTS"]);
});
test("standalone appointment continuation and count failure resume without rerunning appointments", () => {
  const a = setup({
    results: {
      APPOINTMENTS: [{ completed: false }, { completed: true }],
      COUNTS: { ok: false, error: "count failure" },
    },
  });
  assert.equal(a.post("reconcile_appointments").completed, false);
  const error = a.post("reconcile_appointments");
  assert.equal(error.ok, false);
  assert.equal(error.stage, "COUNTS");
  a.c.OPM_ACTUALIZAR_NUMERO_CITAS = () => {
    a.calls.push("COUNTS");
    return { completed: true };
  };
  assert.equal(a.post("reconcile_appointments").completed, true);
  assert.deepEqual(a.calls, ["APPOINTMENTS", "APPOINTMENTS", "COUNTS", "COUNTS"]);
});
test("POST authentication, JSON input, failures and missing worker are explicit", () => {
  const a = setup();
  assert.equal(a.c.doPost({ parameter: { action: "reconcile_all", key: "bad" } }).ok, false);
  assert.equal(a.calls.length, 0);
  const r = a.c.doPost({
    postData: {
      type: "application/json",
      contents: JSON.stringify({ action: "reconcile_opportunities", key: "test-secret" }),
    },
  });
  assert.equal(r.ok, true);
  const b = setup();
  delete b.c.OPM_SYNC_UPDATED_ONLY;
  b.post("reconcile_opportunities");
  const error = b.post("reconcile_opportunities");
  assert.equal(error.ok, false);
  assert.equal(error.stage, "UPDATED");
  assert.match(error.error, /No existe/);
});
