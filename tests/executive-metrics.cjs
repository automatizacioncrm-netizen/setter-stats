const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const Module = require("node:module");
const path = require("node:path");
require.extensions[".ts"] = require.extensions[".tsx"] = (module, filename) =>
  module._compile(
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
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return originalResolve.call(
    this,
    request.startsWith("@/") ? path.resolve("src", request.slice(2)) : request,
    ...args,
  );
};
const {
  financialSummary,
  appointmentMetrics,
  ratio,
  referencePrice,
  financialAmount,
  setterDisplayName,
} = require("../src/lib/executive-metrics.ts");
const { getSetterOptions } = require("../src/lib/setter-performance.ts");
const { getCompleteAppointments, appointmentDetailFilters } = require("../src/services/reports.ts");
const { mapVslReportResponse } = require("../src/server/mappers/vsl-response.mapper.ts");
const { renderToStaticMarkup } = require("react-dom/server");
const { createElement } = require("react");
const { SalesFinancialTable } = require("../src/components/reports/SalesFinancialTable.tsx");
const { SalesSection } = require("../src/components/reports/SalesSection.tsx");
const { ExecutivePerformance } = require("../src/components/reports/ExecutivePerformance.tsx");
const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
const sale = (patch = {}) => ({
  pipeline: "oei",
  fase: "Ventas Confirmadas",
  productoEvento: "EM",
  monedaPrecioAcordado: "USD",
  precioAcordadoProducto: 1497,
  montoCuota1: 750,
  ...patch,
});
const report = (rows, total = rows.length) => ({
  rows,
  total,
  byStage: [],
  productSummary: [],
  salesValueByCurrency: [],
  cashByCurrency: [],
});
const appointment = (patch = {}) => ({
  appointmentId: "appointment-1",
  estado: "Asistió",
  setterEfectivo: "Evelyn",
  closerCita: "Fiorela",
  ...patch,
});

test("financial groups separate pipeline, product and currency and preserve original sums", () => {
  const rows = [
    sale(),
    sale({ monedaPrecioAcordado: "PEN", montoCuota1: 2000 }),
    sale({
      pipeline: "vsl",
      productoEvento: "CM",
      precioAcordadoProducto: 10000,
      montoCuota1: 3000,
    }),
  ];
  const result = financialSummary(report(rows));
  assert.equal(result.complete, true);
  assert.equal(result.groups.length, 3);
  assert.equal(
    result.groups.reduce((n, g) => n + g.sales, 0),
    3,
  );
  assert.equal(
    result.groups.reduce((n, g) => n + g.price, 0),
    12994,
  );
  assert.equal(
    result.groups.reduce((n, g) => n + g.quota, 0),
    5750,
  );
  assert.ok(result.groups[1].rate > 100);
  assert.equal(result.groups[1].excess, 1);
});
test("new financial fields never fall back to legacy fields or reference prices", () => {
  const r = financialSummary(
    report([
      sale({
        precioAcordadoProducto: null,
        montoCuota1: null,
        montoTotalAcordado: 99999,
        montoUltimoPago: 99999,
      }),
    ]),
  ).groups[0];
  assert.equal(r.price, 0);
  assert.equal(r.quota, 0);
  assert.equal(r.rate, null);
  assert.equal(r.missingPrice, 1);
  assert.equal(r.reference, 1497);
});
test("unknown currencies remain distinct and suppress financial percentages", () => {
  const groups = financialSummary(
    report([sale({ monedaPrecioAcordado: "" }), sale({ monedaPrecioAcordado: "XYZ" })]),
  ).groups;
  assert.equal(groups.length, 2);
  assert.ok(groups.every((g) => g.currency === null && g.rate === null));
  assert.equal(financialAmount(750, null), "Sin moneda 750.00");
});
test("incomplete price or quota suppresses ratio and marks partial sums", () => {
  const group = financialSummary(report([sale(), sale({ montoCuota1: null })])).groups[0];
  assert.equal(group.price, 2994);
  assert.equal(group.quota, 750);
  assert.equal(group.missingQuota, 1);
  assert.equal(group.rate, null);
});
test("zero price is retained, flagged and never divides by zero", () => {
  const group = financialSummary(report([sale({ precioAcordadoProducto: 0 })])).groups[0];
  assert.equal(group.rate, null);
  assert.equal(group.excess, 1);
  assert.equal(group.zeroPrice, 1);
  assert.equal(ratio(1, 0), null);
});
test("references match only known products and remain in USD", () => {
  assert.equal(referencePrice("Círculo Millonario (CM)"), 10558.7);
  assert.equal(referencePrice("Equipo Millonario"), 1497);
  assert.equal(referencePrice("Otro"), null);
  const html = renderToStaticMarkup(
    createElement(SalesFinancialTable, { sales: report([sale({ monedaPrecioAcordado: "PEN" })]) }),
  );
  assert.match(html, /USD 1,497.00/);
  assert.match(html, /PEN 750.00/);
});
test("complete sale IDs deduplicate without relying on contact names or appointments", () => {
  const r = sale({ opportunityId: "op-1" });
  const result = financialSummary(report([r, { ...r }], 1));
  assert.equal(result.complete, true);
  assert.equal(result.idsVerified, true);
  assert.equal(result.groups[0].sales, 1);
});
test("conflicting opportunity IDs and partial collections cannot produce aggregates", () => {
  assert.equal(financialSummary(report([sale()], 33)).complete, false);
  const result = financialSummary(
    report(
      [sale({ opportunityId: "op-1" }), sale({ opportunityId: "op-1", montoCuota1: 1000 })],
      1,
    ),
  );
  assert.equal(result.complete, false);
  assert.deepEqual(result.groups, []);
});
test("missing IDs do not fabricate deduplication and sales without appointments remain", () => {
  const result = financialSummary(report([sale(), sale()]));
  assert.equal(result.groups[0].sales, 2);
  assert.equal(result.idsVerified, false);
});
test("financial summary uses sales rows even if paginated detail is empty", () => {
  const result = financialSummary({ ...report([sale()]), detailRows: [] });
  assert.equal(result.groups[0].price, 1497);
});
test("unique Appointment IDs count attendance only from normalized status", () => {
  const row = appointment();
  const result = appointmentMetrics(
    [row, { ...row }, appointment({ appointmentId: "appointment-2", estado: "Confirmado" })],
    2,
    1,
  );
  assert.equal(result.complete, true);
  assert.equal(result.setters[0].rate, 50);
  assert.equal(result.closers[0].attended, 1);
});
test("closer attribution for attendance never falls back to opportunity closer", () => {
  const result = appointmentMetrics(
    [appointment({ closerCita: "", closerOpportunity: "Another closer" })],
    1,
    1,
  );
  assert.equal(result.closers[0].name, "Closer de cita no identificado");
});
test("setter preserves effective attribution then actual creator then opportunity fallback", () => {
  const rows = [
    appointment(),
    appointment({
      appointmentId: "2",
      setterEfectivo: "",
      creadoPorCitaNormalizado: "Creator",
      setterOpportunity: "Assigned",
    }),
    appointment({ appointmentId: "3", setterEfectivo: "", setterOpportunity: "Assigned" }),
  ];
  assert.deepEqual(
    appointmentMetrics(rows, 3, 3).setters.map((r) => r.name),
    ["Evelyn", "Creator", "Assigned"],
  );
  assert.equal(setterDisplayName("Agendado automático"), "Sin setter identificado");
});
test("appointments missing IDs, conflicting duplicate rows or mismatched totals are incomplete", () => {
  assert.equal(
    appointmentMetrics([appointment({ appointmentId: undefined })], 1, 1).complete,
    false,
  );
  assert.equal(
    appointmentMetrics([appointment(), appointment({ estado: "Confirmado" })], 1, 0).complete,
    false,
  );
  assert.equal(appointmentMetrics([appointment()], 3, 1).complete, false);
});
test("setter dropdown hides opaque IDs but retains real API names", () => {
  assert.deepEqual(
    getSetterOptions(
      ["Jh1LDdbfRP024sF6O65a", "agoRysbWBVZXKBRcMnIW", "Evelyn Lopez Horna"],
      true,
    ).map((r) => r.label),
    [
      "Alvaro Jesus Paniura Marin",
      "Jose Luis Botto Garcia",
      "Claudia Jimena Ocampo Portilla",
      "Cinthia Maquito",
      "Evelyn Lopez Horna",
      "Kiara Villadolid Huamantumba",
    ],
  );
});
test("mapper preserves only actual opportunity IDs and does not invent them", () => {
  const mapped = mapVslReportResponse(
    { ok: true, data: { sales: { total: 2, rows: [sale({ opportunityId: "op-1" }), sale()] } } },
    { pipeline: "oei", pageSize: 25, sort: "nombreContacto", direction: "asc" },
  );
  assert.equal(mapped.sales.rows[0].opportunityId, "op-1");
  assert.equal("opportunityId" in mapped.sales.rows[1], false);
});
test("all appointment pages load with combined global filters before metrics are calculated", async (t) => {
  const saved = global.fetch;
  t.after(() => (global.fetch = saved));
  const requests = [];
  global.fetch = async (url) => {
    const p = new URL(url, "http://local").searchParams;
    requests.push(p);
    const page = Number(p.get("page"));
    return Response.json({
      rows: [appointment({ appointmentId: String(page) })],
      pagination: { page, pageSize: 1, totalRecords: 3, totalPages: 3 },
      summary: { asistio: 3 },
    });
  };
  const filters = appointmentDetailFilters({
    pipeline: "oei",
    setter: "",
    booker: "Evelyn",
    closer: "Fiorela",
    calendar: "EM",
    dateFrom: "2026-09-01",
    dateTo: "2026-09-30",
    estadoAgenda: "Asistió",
    vslOrigen: "",
    leadType: "all",
  });
  const rows = await getCompleteAppointments(filters);
  assert.equal(rows.length, 3);
  assert.equal(appointmentMetrics(rows, 3, 3).complete, true);
  for (const p of requests) {
    assert.equal(p.get("booker"), "Evelyn");
    assert.equal(p.get("closer"), "Fiorela");
    assert.equal(p.get("dateFrom"), "2026-09-01");
    assert.equal(p.get("status"), "Asistió");
  }
});
test("changing pagination totals rejects instead of rendering partial metrics", async (t) => {
  const saved = global.fetch;
  t.after(() => (global.fetch = saved));
  global.fetch = async (url) => {
    const page = Number(new URL(url, "http://local").searchParams.get("page"));
    return Response.json({
      rows: [appointment()],
      pagination: { page, totalRecords: page === 1 ? 2 : 3, totalPages: 2 },
      summary: { asistio: 1 },
    });
  };
  await assert.rejects(getCompleteAppointments({ pipeline: "oei" }), /no concilian/);
});
test("sales render one financial table, retain commercial cards and sales detail", () => {
  const html = renderToStaticMarkup(
    createElement(SalesSection, {
      available: true,
      pipeline: "oei",
      sales: report([sale({ montoCuota1: 2000 })]),
    }),
  );
  assert.match(html, /Total de ventas/);
  assert.match(html, /Detalle de ventas filtradas/);
  assert.match(html, /Ventas y recaudación por embudo y producto/);
  assert.doesNotMatch(html, /Valor total de ticket de venta|Cash recaudado|% Recaudado/);
  assert.match(html, /133.60 %/);
  assert.match(html, /Revisar: 1 ventas/);
});

test("executive sections consume performance without appointment requests", () => {
  const data = {
    filters: { pipeline: "oei" },
    performance: {
      alcanceAsistencia: "oei",
      alcanceConversionCloser: "oei",
      conversionPorCloser: [
        { closer: "Fiorela Bernales", citasAsistidas: 11, ventas: 3, conversionPct: 27.27 },
      ],
      asistenciaPorSetter: [
        { setter: "Evelyn", agendamientos: 13, citasAsistidas: 8, asistenciaPct: 61.54 },
      ],
      asistenciaPorCloserTodosEmbudos: [
        { closer: "Fiorela Bernales", agendamientos: 27, citasAsistidas: 11, asistenciaPct: 40.74 },
      ],
      diagnostics: { ventasSinCitaAsistida: 22, ventasAtribucionAmbigua: 0 },
    },
  };
  const html = renderToStaticMarkup(createElement(ExecutivePerformance, { report: data }));
  assert.match(html, /27.27 %/);
  assert.match(html, /61.54 %/);
  assert.match(html, /40.74 %/);
  assert.match(html, /22 ventas sin atribución verificable/);
  assert.doesNotMatch(html, /Cargando el conjunto completo|Atribución efectiva del reporte/);
});
