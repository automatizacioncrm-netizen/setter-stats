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

test("quota dates preserve calendar days and money distinguishes missing amounts from zero without conversions", () => {
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
            monedaPrecioAcordado: currency,
            precioAcordadoProducto: amount,
            montoTotalAcordado: 999,
          },
          "precioAcordadoProducto",
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

test("actual sales table shows the 16 requested columns and sorts new amounts without changing input records", () => {
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
      fechaVenta: "1999-01-01",
      monedaPrecioAcordado: "USD",
      precioAcordadoProducto: 1497,
    },
    {
      nombreContacto: "Low",
      fechaVenta: "1999-01-01",
      monedaPrecioAcordado: "USD",
      precioAcordadoProducto: 0,
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
  for (const pipeline of ["vsl", "oei", "lig"]) {
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
      "Precio acordado",
      "Monto cuota 1",
      "Fecha de reunión",
      "Plan de pagos",
      "Cuotas",
    ]);
    let body = nodes(tree).find((n) => n.type === "tbody");
    const cells = nodes(body)
      .filter((n) => n.type === "td")
      .map(text);
    assert.equal(cells[4], "Setter API");
    assert.equal(cells[5], "Creador");
    assert.equal(cells[9], "01/01/1999");
    assert.equal(cells[16 + 9], "01/01/1999");
    assert.ok(!text(tree).includes("Do not display"));
    nodes(headers[11])
      .find((n) => n.type === "button")
      .props.onClick();
    tree = exports.SalesSection({ sales, available: true, pipeline });
    body = nodes(tree).find((n) => n.type === "tbody");
    assert.equal(nodes(body).filter((n) => n.type === "td")[3].props.children, "Low");
    assert.equal(rows[0].nombreContacto, "High");
  }
});
