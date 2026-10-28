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
  readMonthlyConversion,
  groupMonthlyConversion,
  formatConversionMonth,
  formatMonthlyConversion,
  buildMonthlyConversionMatrix,
  formatMatrixConversion,
} = require("../src/lib/monthly-product-conversion.ts");
const row = (mes, embudo, producto, ventas = 8) => ({
  mes,
  embudo,
  producto,
  closer: "Amaranta Alfonso Krasnova",
  embudoNombre: embudo,
  citasAsistidas: 40,
  ventas,
  porcentajeConversion: null,
});
test("selects consolidated or individual rows exclusively and groups chronologically", () => {
  const rows = [
    row("2026-10", "all", "C"),
    row("2026-09", "all", "B", 2),
    row("2026-10", "all", "A"),
    row("2026-09", "all", "A"),
    row("2026-10", "all", "B"),
    ...["vsl", "oei", "lig", "organico", "gira"].map((p) => row("2026-09", p, "A")),
  ];
  const groups = groupMonthlyConversion(rows, "all");
  assert.deepEqual(
    groups.map(([month, products]) => [month, products.length]),
    [
      ["2026-09", 2],
      ["2026-10", 3],
    ],
  );
  assert.deepEqual(
    groups[1][1].map((r) => r.producto),
    ["A", "B", "C"],
  );
  for (const pipeline of ["vsl", "oei", "lig", "organico", "gira"]) {
    assert.equal(groupMonthlyConversion(rows, pipeline)[0][1].length, 1);
    assert.equal(groupMonthlyConversion(rows, pipeline)[0][1][0].embudo, pipeline);
  }
  assert.equal(groups[0][1][0].citasAsistidas, 40);
});
test("formats API percentages and valid fallback without duplicating denominators", () => {
  const sample = row("2026-09", "all", "A");
  assert.equal(formatMonthlyConversion(sample), "20.00 %");
  assert.equal(formatMonthlyConversion({ ...sample, ventas: 2 }), "5.00 %");
  assert.equal(formatMonthlyConversion({ ...sample, porcentajeConversion: 20 }), "20.00 %");
  assert.equal(
    formatMonthlyConversion({ ...sample, citasAsistidas: 0, porcentajeConversion: 20 }),
    "N/D",
  );
  assert.equal(readMonthlyConversion(undefined), undefined);
  assert.deepEqual(readMonthlyConversion([]), []);
  assert.equal(readMonthlyConversion([{ ...sample, citasAsistidas: null }]), undefined);
  assert.equal(formatConversionMonth("2026-09", false), "Septiembre");
  assert.match(formatConversionMonth("2026-09", true), /Septiembre.*2026/);
  assert.equal(groupMonthlyConversion([sample, { ...sample, mes: "2027-09" }], "all").length, 2);
});
const Module = require("node:module");
const path = require("node:path");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return originalResolve.call(
    this,
    request.startsWith("@/") ? path.resolve("src", request.slice(2)) : request,
    ...args,
  );
};
require.extensions[".tsx"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    filename,
  );
const { renderToStaticMarkup } = require("react-dom/server");
const { createElement } = require("react");
const {
  MonthlyProductConversionTable,
} = require("../src/components/reports/MonthlyProductConversionTable.tsx");
const { SalesSection } = require("../src/components/reports/SalesSection.tsx");
const { mapVslReportResponse } = require("../src/server/mappers/vsl-response.mapper.ts");
test("renders semantic month spans, ordered columns and distinct unavailable/empty states", () => {
  const rows = [
    row("2026-09", "all", "Equipo Millonario"),
    row("2026-09", "all", "Círculo Millonario"),
    row("2026-10", "all", "Equipo Millonario"),
  ];
  const html = renderToStaticMarkup(
    createElement(MonthlyProductConversionTable, { rows, pipeline: "all" }),
  );
  assert.match(html, /rowSpan="3"[^>]*>Septiembre de 2026<\/th>/i);
  assert.match(html, /rowSpan="3"[^>]*>Octubre de 2026<\/th>/i);
  assert.equal((html.match(/Septiembre/g) || []).length, 1);
  assert.match(html, /overflow-x-auto/);
  assert.deepEqual(
    [...html.match(/<thead[\s\S]*?<\/thead>/)[0].matchAll(/<th .*?>(.*?)<\/th>/g)].map((m) => m[1]),
    [
      "MES",
      "CLOSER",
      "EQUIPO MILLONARIO",
      "CÍRCULO MILLONARIO",
      "Asistencias",
      "Ventas",
      "% Conversión",
      "Asistencias",
      "Ventas",
      "% Conversión",
    ],
  );
  assert.match(
    renderToStaticMarkup(createElement(MonthlyProductConversionTable, { pipeline: "all" })),
    /aún no está disponible en la API/,
  );
  assert.match(
    renderToStaticMarkup(
      createElement(MonthlyProductConversionTable, { rows: [], pipeline: "all" }),
    ),
    /No hay datos para los filtros seleccionados/,
  );
  const sales = {
    rows: [],
    total: 0,
    byStage: [],
    productSummary: [],
    salesValueByCurrency: [],
    cashByCurrency: [],
    conversionPorProductoMensual: rows,
  };
  const section = renderToStaticMarkup(
    createElement(SalesSection, { sales, available: true, pipeline: "all" }),
  );
  assert.match(
    section,
    /<details[^>]*><summary[^>]*>Identificación de ventas<\/summary>[\s\S]*Conversión mensual[\s\S]*<\/details>[\s\S]*6\. Detalle de ventas/,
  );
  assert.doesNotMatch(section, /<details[^>]* open/);
});
test("Apps Script envelope preserves monthly field, including absence and empty arrays", () => {
  const q = {
    pipeline: "all",
    dateFrom: "",
    dateTo: "",
    setter: "",
    closer: "",
    status: "",
    vslOrigin: "",
    includeDetail: false,
    pageSize: 25,
    sort: "nombreContacto",
    direction: "asc",
  };
  for (const values of [undefined, [], [row("2026-09", "all", "A")]]) {
    const mapped = mapVslReportResponse(
      { ok: true, data: { sales: { conversionPorProductoMensual: values } } },
      q,
    );
    assert.deepEqual(mapped.sales.conversionPorProductoMensual, values);
  }
});
const vm = require("node:vm");
function monthlyApi(opportunities, appointments, filters = {}) {
  const context = vm.createContext({
    GHL_PIPELINES: {
      VSL_CLOSERS: { name: "VSL | Closers" },
      OEI_EM: { name: "OEI" },
      LIG: { name: "LIG" },
    },
    Utilities: { formatDate: (d) => d.toISOString().slice(0, 10) },
    Session: { getScriptTimeZone: () => "America/Lima" },
  });
  vm.runInContext(fs.readFileSync("apps-script/10_API.gs", "utf8"), context);
  const oppHeaders = [
    "Opportunity ID",
    "Secuencia",
    "Fase",
    "Asignado a",
    "Producto/Evento",
    "Fecha de primer pago",
    "Setter asignado",
    "VSL Origen",
    "Fuente",
    "Estado de agenda",
  ];
  const apptHeaders = [
    "Appointment ID",
    "Opportunity ID",
    "Embudo",
    "Calendario cita",
    "Estado cita",
    "Fecha cita",
    "Closer cita",
    "Creado por cita",
  ];
  const fields = {
    opportunityId: "Opportunity ID",
    secuencia: "Secuencia",
    fase: "Fase",
    asignado: "Asignado",
    producto: "Producto/Evento",
    fechaPrimerPago: "Fecha de primer pago",
    setter: "Setter asignado",
    vslOrigen: "VSL Origen",
    fuente: "Fuente",
    estadoAgenda: "Estado de agenda",
  };
  const apptFields = {
    appointmentId: "Appointment ID",
    opportunityId: "Opportunity ID",
    embudo: "Embudo",
    calendarioCita: "Calendario cita",
    estadoCita: "Estado cita",
    fechaCita: "Fecha cita",
    closerCita: "Closer cita",
    createdByUserName: "Creado por cita",
  };
  const oi = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, oppHeaders.indexOf(v)]));
  const ai = Object.fromEntries(
    Object.entries(apptFields).map(([k, v]) => [k, apptHeaders.indexOf(v)]),
  );
  const oppData = {
    headers: oppHeaders,
    rows: opportunities.map((o) => oppHeaders.map((h) => o[h] ?? "")),
  };
  const apptData = {
    headers: apptHeaders,
    rows: appointments.map((a) => apptHeaders.map((h) => a[h] ?? "")),
  };
  const result = context.API_MONTHLY_CLOSER_PRODUCT_CONVERSION_(
    oppData,
    apptData,
    oi,
    ai,
    { pipeline: "all", ...filters },
    filters.leadType || "all",
    filters.vslTipo || "all",
  );
  return JSON.parse(JSON.stringify(result));
}
const monthlyOpp = (id, changes = {}) => ({
  "Opportunity ID": id,
  Secuencia: "OEI",
  Fase: "Ventas Confirmadas",
  "Asignado a": "Closer Nuevo Sin Lista",
  "Producto/Evento": "Equipo Millonario",
  "Fecha de primer pago": "2026-09-15",
  "Setter asignado": "Setter Nuevo",
  ...changes,
});
const monthlyAppt = (id, oid, changes = {}) => ({
  "Appointment ID": id,
  "Opportunity ID": oid,
  Embudo: "OEI",
  "Estado cita": "showed",
  "Fecha cita": "2026-09-12",
  ...changes,
});
test("monthly API accepts only authorized phases, deduplicates sales, and retains unknown products and real closers", () => {
  const stages = [
    "Venta Confirmada/Reserva",
    "Venta Confirmada / Reserva",
    "Venta confirmada/Reserva",
    "Ventas Confirmadas",
  ];
  const opps = stages.map((stage, i) =>
    monthlyOpp("s" + i, {
      Fase: stage,
      "Producto/Evento": i === 0 ? "Circulo Millonario" : i === 1 ? "Otro" : "",
    }),
  );
  opps.push(
    opps[0],
    ...["Ventas", "Venta Cerrada", "Perdida", "Reserva / Deposito"].map((stage, i) =>
      monthlyOpp("invalid" + i, { Fase: stage }),
    ),
  );
  const rows = monthlyApi(opps, []).filter((r) => r.embudo === "all");
  assert.equal(
    rows.reduce((sum, r) => sum + r.ventas, 0),
    4,
  );
  assert.equal(rows.find((r) => r.producto === "Sin identificar").ventas, 3);
  assert.equal(rows.find((r) => r.producto === "Círculo Millonario").ventas, 1);
  assert.ok(
    rows.every((r) => r.closer === "Closer Nuevo Sin Lista" && r.porcentajeConversion === null),
  );
});
test("monthly API attributes appointments once to linked product, deduplicates IDs and keeps sale/meeting months independent", () => {
  const opps = [
    monthlyOpp("em"),
    monthlyOpp("cm", {
      "Producto/Evento": "Círculo Millonario",
      "Fecha de primer pago": "2026-10-01",
    }),
    monthlyOpp("unknown", { "Asignado a": "", "Producto/Evento": "" }),
  ];
  const appts = [
    monthlyAppt("a", "em"),
    monthlyAppt("a", "em"),
    monthlyAppt("b", "cm"),
    monthlyAppt("c", "unknown"),
    monthlyAppt("d", "em", { "Estado cita": "confirmed" }),
    monthlyAppt("e", "em", { "Estado cita": "" }),
  ];
  const rows = monthlyApi(opps, appts).filter((r) => r.embudo === "all");
  assert.equal(
    rows.reduce((sum, r) => sum + r.citasAsistidas, 0),
    3,
  );
  assert.equal(
    rows.reduce((sum, r) => sum + r.ventas, 0),
    3,
  );
  const em = rows.find((r) => r.producto === "Equipo Millonario");
  assert.equal(em.porcentajeConversion, 100);
  assert.equal(
    rows.find((r) => r.mes === "2026-09" && r.producto === "Círculo Millonario").ventas,
    0,
  );
  assert.equal(rows.find((r) => r.mes === "2026-10").citasAsistidas, 0);
  assert.equal(
    rows.find((r) => r.producto === "Sin identificar").closer,
    "Sin closer identificado",
  );
});
test("monthly API uses appointment closer for meetings and assigned opportunity closer for sales with normalized matching", () => {
  const opps = [monthlyOpp("o", { "Asignado a": "María Pérez" })];
  const appts = [
    monthlyAppt("a", "o", { "Closer cita": "Otro Closer" }),
    monthlyAppt("b", "o", { "Closer cita": " MARIA  PEREZ " }),
  ];
  const rows = monthlyApi(opps, appts, { closer: "maria perez" }).filter((r) => r.embudo === "all");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ventas, 1);
  assert.equal(rows[0].citasAsistidas, 1);
  const other = monthlyApi(opps, appts, { closer: "Otro Closer" }).filter(
    (r) => r.embudo === "all",
  );
  assert.equal(other[0].ventas, 0);
  assert.equal(other[0].citasAsistidas, 1);
});
test("monthly API preserves date, pipeline, setter, booker, status and origin filters", () => {
  const opps = [monthlyOpp("o")];
  const appts = [monthlyAppt("a", "o", { "Creado por cita": "Agendador Real" })];
  for (const filters of [
    { pipeline: "lig" },
    { setter: "No coincide" },
    { booker: "No coincide" },
    { status: "No asistió" },
    { vslOrigin: "No coincide" },
    { calendar: "No coincide" },
    { dateFrom: "2026-10-01" },
  ]) {
    assert.deepEqual(monthlyApi(opps, appts, filters), [], JSON.stringify(filters));
  }
  const selected = monthlyApi(opps, appts, {
    setter: "Setter Nuevo",
    booker: "Agendador Real",
    dateFrom: "2026-09-01",
    dateTo: "2026-09-30",
  }).filter((r) => r.embudo === "all");
  assert.equal(selected[0].ventas, 1);
  assert.equal(selected[0].citasAsistidas, 1);
});
test("monthly API calculates 20 percent from five unique appointments and one sale, without mixing consolidated rows", () => {
  const opps = [monthlyOpp("o")];
  const appts = Array.from({ length: 5 }, (_, i) => monthlyAppt("a" + i, "o"));
  const rows = monthlyApi(opps, appts);
  for (const pipeline of ["oei", "all"]) {
    const group = rows.filter((r) => r.embudo === pipeline);
    assert.equal(group.length, 1);
    assert.equal(group[0].citasAsistidas, 5);
    assert.equal(group[0].ventas, 1);
    assert.equal(group[0].porcentajeConversion, 20);
    assert.equal(formatMonthlyConversion(group[0]), "20.00 %");
  }
});
test("monthly VSL sales need no appointment and missing closer remains explicitly unidentified", () => {
  const opps = [
    monthlyOpp("v", { Secuencia: "VSL | Closers", "VSL Origen": "No agendado", "Asignado a": "" }),
  ];
  const rows = monthlyApi(opps, [], { pipeline: "vsl", leadType: "paid" });
  assert.equal(rows.find((r) => r.embudo === "vsl").ventas, 1);
  assert.equal(rows.find((r) => r.embudo === "vsl").closer, "Sin closer identificado");
  assert.equal(
    readMonthlyConversion([{ ...row("2026-09", "all", "A"), closer: "" }])[0].closer,
    "Sin closer identificado",
  );
});
test("matrix shows only authorized closers/products, three rows per active month, chronological order and zero cells", () => {
  const rows = [
    row("2026-09", "all", "Equipo Millonario"),
    { ...row("2026-10", "all", "Círculo Millonario"), closer: "  ezequiel  darío " },
    { ...row("2026-11", "all", "Equipo Millonario"), closer: "Otro closer" },
    row("2026-12", "all", "Sin identificar"),
    { ...row("2027-01", "all", "Equipo Millonario"), citasAsistidas: 0, ventas: 0 },
  ];
  const before = JSON.stringify(rows);
  const matrix = buildMonthlyConversionMatrix(rows, "all");
  assert.deepEqual(
    matrix.map((m) => m.mes),
    ["2026-09", "2026-10"],
  );
  assert.deepEqual(
    matrix[0].closers.map((c) => c.label),
    ["AMARANTA", "EZEQUIEL", "FIORELA"],
  );
  assert.deepEqual(
    matrix[1].closers[0].products.map((p) => [p.citasAsistidas, p.ventas]),
    [
      [0, 0],
      [0, 0],
    ],
  );
  assert.equal(matrix[0].closers[1].name, "Ezequiel Dario");
  assert.equal(matrix[1].closers[1].products[1].ventas, 8);
  assert.equal(JSON.stringify(rows), before);
  const html = renderToStaticMarkup(
    createElement(MonthlyProductConversionTable, { rows, pipeline: "all" }),
  );
  for (const label of ["AMARANTA", "EZEQUIEL", "FIORELA"])
    assert.equal(html.split(">" + label + "<").length - 1, 2);
  assert.doesNotMatch(
    html,
    /Otro closer|Sin identificar|Sin closer identificado|Noviembre|Diciembre|Enero/,
  );
  assert.equal((html.match(/colSpan="3"/g) || []).length, 2);
});
test("matrix sums individual funnels, uses consolidated rows exclusively and recalculates weighted conversion", () => {
  const vsl = {
    ...row("2026-09", "vsl", "Equipo Millonario", 1),
    citasAsistidas: 10,
    porcentajeConversion: 999,
  };
  const oei = { ...vsl, embudo: "oei", citasAsistidas: 30, ventas: 7 };
  const cell = (rows) => buildMonthlyConversionMatrix(rows, "all")[0].closers[0].products[0];
  assert.deepEqual([cell([vsl, oei]).citasAsistidas, cell([vsl, oei]).ventas], [40, 8]);
  assert.equal(formatMatrixConversion(cell([vsl, oei])), "20.00 %");
  const all = { ...vsl, embudo: "all", citasAsistidas: 40, ventas: 8 };
  assert.deepEqual(cell([all, vsl, oei, all]), cell([all]));
  for (const pipeline of ["vsl", "oei", "lig", "organico", "gira"]) {
    const matrix = buildMonthlyConversionMatrix(
      [all, vsl, oei, ...(["vsl", "oei"].includes(pipeline) ? [] : [{ ...vsl, embudo: pipeline }])],
      pipeline,
    );
    assert.equal(matrix[0].closers[0].products[0].citasAsistidas, pipeline === "oei" ? 30 : 10);
  }
  assert.equal(buildMonthlyConversionMatrix([vsl, { ...vsl, ventas: 3 }], "vsl"), undefined);
});
test("matrix conversion uses zero for empty cells and N/D only for sales without attendance", () => {
  assert.equal(formatMatrixConversion({ citasAsistidas: 0, ventas: 0 }), "0.00 %");
  assert.equal(formatMatrixConversion({ citasAsistidas: 0, ventas: 1 }), "N/D");
  assert.equal(formatMatrixConversion({ citasAsistidas: 40, ventas: 2 }), "5.00 %");
  const matrix = buildMonthlyConversionMatrix(
    [{ ...row("2026-09", "all", "Equipo Millonario"), citasAsistidas: 0, ventas: 1 }],
    "all",
  );
  assert.equal(matrix.length, 1);
  assert.equal(matrix[0].closers.length, 3);
});
test("matrix includes July 2026 through current Lima month only, never reassigning future records", () => {
  const rows = ["2028-09", "2026-10", "2026-06", "2026-09", "2026-07", "2026-08", "2026-11"].map(
    (m) => row(m, "all", "Equipo Millonario"),
  );
  const before = JSON.stringify(rows);
  const months = buildMonthlyConversionMatrix(rows, "all", new Date("2026-10-28T12:00:00Z"));
  assert.deepEqual(
    months.map((m) => m.mes),
    ["2026-07", "2026-08", "2026-09", "2026-10"],
  );
  assert.ok(months.every((m) => m.closers[0].products[0].ventas === 8));
  assert.equal(JSON.stringify(rows), before);
  assert.equal(formatConversionMonth(months[0].mes, true), "Julio de 2026");
  assert.deepEqual(
    buildMonthlyConversionMatrix(
      [row("2026-08", "all", "Equipo Millonario")],
      "all",
      new Date("2026-10-28T12:00:00Z"),
    ).map((m) => m.mes),
    ["2026-08"],
  );
});
test("matrix upper month follows Lima at a UTC month boundary and advances over time", () => {
  const rows = ["2026-10", "2026-11", "2027-01"].map((m) => row(m, "all", "Equipo Millonario"));
  assert.deepEqual(
    buildMonthlyConversionMatrix(rows, "all", new Date("2026-11-01T02:00:00Z")).map((m) => m.mes),
    ["2026-10"],
  );
  assert.deepEqual(
    buildMonthlyConversionMatrix(rows, "all", new Date("2026-11-01T05:00:00Z")).map((m) => m.mes),
    ["2026-10", "2026-11"],
  );
  assert.deepEqual(
    buildMonthlyConversionMatrix(rows, "all", new Date("2027-01-15T12:00:00Z")).map((m) => m.mes),
    ["2026-10", "2026-11", "2027-01"],
  );
});
