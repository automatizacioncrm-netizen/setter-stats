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
    "commonjs",
  );
const helpers = require("../src/lib/sales-detail.ts");
const { mapVslReportResponse } = require("../src/server/mappers/vsl-response.mapper.ts");
const { mergeFilteredReports } = require("../src/lib/merge-filtered-reports.ts");

test("sales detail contract preserves new fields, empty amounts and authoritative setter independently of legacy rows", () => {
  for (const pipeline of ["vsl", "oei", "lig"]) {
    const data = mapVslReportResponse(
      {
        ok: true,
        data: {
          sales: {
            total: 17,
            rows: [{ nombreContacto: "Legacy" }],
            detailRows: [
              {
                pipeline,
                nombreContacto: "New",
                fechaCuota1: "2026-10-09T00:00:00Z",
                monedaPrecioAcordado: "USD",
                precioAcordadoProducto: "1497",
                montoCuota1: 0,
                setterAsignado: "Setter API",
                agendadorCita: "Otro creador",
              },
              { precioAcordadoProducto: "", montoCuota1: null },
            ],
          },
        },
      },
      {
        pipeline,
        dateFrom: "",
        dateTo: "",
        setter: "",
        booker: "",
        status: "",
        closer: "",
        vslOrigin: "",
        includeDetail: false,
        pageSize: 50,
        sort: "nombreContacto",
        direction: "asc",
      },
    );
    assert.equal(data.sales.total, 17);
    assert.equal(data.sales.rows[0].nombreContacto, "Legacy");
    const [row, missing] = data.sales.detailRows;
    assert.equal(row.precioAcordadoProducto, 1497);
    assert.equal(row.montoCuota1, 0);
    assert.equal(missing.precioAcordadoProducto, null);
    assert.equal(missing.montoCuota1, null);
    assert.equal(helpers.saleDetailValue(row, "setterAsignado"), "Setter API");
    assert.equal(helpers.saleDetailValue(row, "agendadorCita"), "Otro creador");
  }
});

test("sale dates preserve calendar days and official money distinguishes missing amounts from zero without conversions", () => {
  assert.equal(
    helpers.saleDetailValue({ setterAsignado: "Agendado automático" }, "setterAsignado"),
    "",
  );
  assert.equal(helpers.formatSaleQuotaDate("2026-10-09T00:00:00+14:00"), "09/10/2026");
  assert.equal(helpers.formatSaleQuotaDate("2026-10-09T23:59:00-05:00"), "09/10/2026");
  assert.equal(helpers.formatSaleQuotaDate("9/10/2026"), "09/10/2026");
  assert.equal(helpers.formatSaleQuotaDate(""), "—");
  for (const [currency, prefix] of [
    ["USD", "$"],
    ["PEN", "S/ "],
  ]) {
    const format = (amount) =>
      helpers
        .formatSaleDetailAmount(
          {
            moneda: currency,
            montoTotalAcordado: amount,
            monedaPrecioAcordado: "EUR",
            precioAcordadoProducto: 999,
          },
          "montoTotalAcordado",
        )
        .replace(/\s/g, " ");
    assert.equal(format(1497), `${prefix}1,497.00`);
    assert.equal(format(0), `${prefix}0.00`);
    assert.equal(format(null), "—");
    assert.equal(format(undefined), "—");
  }
});

test("combined report filters preserve all new sale detail rows", () => {
  const query = {
    pipeline: "oei",
    dateFrom: "",
    dateTo: "",
    setter: "",
    booker: "",
    status: "",
    closer: "",
    vslOrigin: "",
    includeDetail: false,
    pageSize: 50,
    sort: "nombreContacto",
    direction: "asc",
  };
  const reports = ["One", "Two"].map((nombreContacto) =>
    mapVslReportResponse(
      {
        ok: true,
        data: {
          sales: {
            total: 1,
            detailRows: [
              { nombreContacto, monedaPrecioAcordado: "PEN", precioAcordadoProducto: 100 },
            ],
          },
        },
      },
      query,
    ),
  );
  const merged = mergeFilteredReports(reports, { ...query, leadType: "all", preset: "todos" });
  assert.deepEqual(
    merged.sales.detailRows.map((row) => row.nombreContacto),
    ["One", "Two"],
  );
  assert.equal(merged.sales.total, 2);
});

test("actual sales table shows the 15 official columns in every pipeline and sorts amounts without changing input records", () => {
  let sort = null;
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync("src/components/reports/SalesSection.tsx", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      exports,
      require(name) {
        if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
        if (name === "react")
          return {
            useMemo: (fn) => fn(),
            useState: () => [
              sort,
              (next) => {
                sort = next(sort);
              },
            ],
          };
        if (name.includes("sales-detail")) return helpers;
        if (name.includes("sales-stage-style"))
          return { getSalesStageStyle: () => ({ badge: "" }) };
        return new Proxy({}, { get: (_, name) => name });
      },
    },
  );
  const rows = [
    {
      nombreContacto: "High",
      setterAsignado: "Setter API",
      agendadorCita: "Creador",
      fechaCuota1: "2026-10-09",
      fechaVenta: "2026-10-10",
      moneda: "USD",
      montoTotalAcordado: 1497,
      montoUltimoPago: 1497,
      planPagos: "Contado",
      monedaPrecioAcordado: "EUR",
      precioAcordadoProducto: 9999,
      montoCuota1: 8888,
      numeroCuotasPactadas: 99,
    },
    {
      nombreContacto: "Low",
      fechaVenta: "",
      fechaCuota1: "2026-10-01",
      fechaReunion: "2026-10-02",
      moneda: "USD",
      montoTotalAcordado: 0,
      montoUltimoPago: 0,
      planPagos: "Cuotas",
      monedaPrecioAcordado: "EUR",
      precioAcordadoProducto: 19999,
    },
  ];
  const sales = {
    total: 2,
    byStage: [],
    salesValueByCurrency: [],
    rows: [{ nombreContacto: "Do not display" }],
    detailRows: rows,
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
        : [node.props?.children].flat(Infinity).map(text).join("");
  for (const pipeline of ["vsl", "oei", "lig", "all"]) {
    sort = null;
    let tree = exports.SalesSection({ sales, available: true, pipeline });
    const headers = nodes(tree).filter((n) => n.type === "th");
    assert.deepEqual(headers.map(text), [
      "Embudo",
      "Secuencia",
      "Calendario",
      "Nombre del contacto",
      "Setter",
      "Agendador",
      "Closer cita",
      "Fase",
      "Producto",
      "Fecha de venta",
      "Moneda",
      "Monto Total Acordado",
      "Monto del último pago",
      "Fecha de reunión",
      "Plan de pagos",
    ]);
    let body = nodes(tree).find((n) => n.type === "tbody");
    const cells = nodes(body)
      .filter((n) => n.type === "td")
      .map(text);
    assert.equal(cells[4], "Setter API");
    assert.equal(cells[5], "Creador");
    assert.equal(cells[9], "10/10/2026");
    assert.equal(cells[10], "USD");
    assert.equal(cells[11], "$1,497.00");
    assert.equal(cells[12], "$1,497.00");
    assert.equal(cells[14], "Contado");
    assert.equal(cells[15 + 9], "—");
    assert.equal(cells[15 + 11], "$0.00");
    assert.equal(cells[15 + 12], "$0.00");
    assert.equal(cells[15 + 14], "Cuotas");
    assert.ok(nodes(tree).some((n) => n.props?.className === "overflow-x-auto"));
    assert.ok(!text(tree).includes("Do not display"));
    nodes(headers[11])
      .find((n) => n.type === "button")
      .props.onClick();
    tree = exports.SalesSection({ sales, available: true, pipeline });
    body = nodes(tree).find((n) => n.type === "tbody");
    assert.equal(nodes(body).filter((n) => n.type === "td")[3].props.children, "Low");
    assert.equal(rows[0].nombreContacto, "High");
    // Official PEN data, null/absent amounts and no legacy fallbacks.
    sort = null;
    const examples = [
      {
        fechaVenta: "2026-10-12",
        moneda: "PEN",
        montoTotalAcordado: 6480.36,
        montoUltimoPago: 2160.12,
        planPagos: "Cuotas",
      },
      {
        moneda: "",
        montoTotalAcordado: null,
        montoUltimoPago: undefined,
        fechaCuota1: "2026-10-10",
        fechaReunion: "2026-10-11",
        monedaPrecioAcordado: "USD",
        precioAcordadoProducto: 1497,
        montoCuota1: 1497,
      },
    ];
    tree = exports.SalesSection({
      sales: { ...sales, detailRows: examples },
      available: true,
      pipeline,
    });
    const exampleCells = nodes(nodes(tree).find((n) => n.type === "tbody"))
      .filter((n) => n.type === "td")
      .map(text);
    assert.equal(exampleCells[9], "12/10/2026");
    assert.equal(exampleCells[10], "PEN");
    assert.match(exampleCells[11], /6,480\.36/);
    assert.match(exampleCells[12], /2,160\.12/);
    assert.equal(exampleCells[14], "Cuotas");
    for (const col of [9, 10, 11, 12]) assert.equal(exampleCells[15 + col], "—");
  }
});
