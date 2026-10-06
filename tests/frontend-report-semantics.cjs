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
    "commonjs",
  );
const {
  getEffectiveSetter,
  getEffectiveBooker,
  getEffectiveSaleDate,
  getEffectiveAppointmentDate,
  getReportRecordValue,
} = require("../src/lib/report-record.ts");
const { getVslClosersReport, readResponse } = require("../src/services/reports.ts");
const { filtrarReporteVsl } = require("../src/lib/vsl-local-filter.ts");
test("setter respects each pipeline and every fallback, including missing properties", () => {
  for (const pipeline of ["vsl", "oei", "lig", "all", undefined]) {
    const r = { pipeline, setterAsignado: "Jimena", createdByUserName: "Evelyn" };
    assert.equal(getEffectiveSetter(r), ["oei", "lig"].includes(pipeline) ? "Evelyn" : "Jimena");
    assert.equal(
      getEffectiveSetter({ ...r, agendadorCita: "Daniela" }),
      ["oei", "lig"].includes(pipeline) ? "Daniela" : "Jimena",
    );
    assert.equal(getEffectiveSetter({ pipeline, setterAsignado: "Jimena" }), "Jimena");
    assert.equal(
      getEffectiveSetter({ pipeline, createdByUserName: "Evelyn" }),
      ["oei", "lig"].includes(pipeline) ? "Evelyn" : "",
    );
    assert.equal(getEffectiveBooker(r), "Evelyn");
  }
  assert.equal(getEffectiveSetter(null), "");
  assert.equal(getEffectiveSetter({}), "");
});
test("sale dates never fall back to first payment and appointment dates ignore it", () => {
  const r = {
    fechaVenta: "2026-09-01",
    fechaCita: "2026-09-02",
    fechaReunion: "2026-09-03",
    fechaPrimerPago: "2026-10-01",
  };
  assert.equal(getEffectiveSaleDate(r), r.fechaVenta);
  assert.equal(getEffectiveAppointmentDate(r), r.fechaCita);
  assert.equal(getEffectiveSaleDate({ ...r, fechaVenta: "" }), r.fechaCita);
  assert.equal(getEffectiveSaleDate({ ...r, fechaVenta: "", fechaCita: "" }), r.fechaReunion);
  assert.equal(getEffectiveSaleDate({ fechaPrimerPago: r.fechaPrimerPago }), "");
  assert.equal(getEffectiveSaleDate(undefined), "");
  assert.equal(getReportRecordValue(r, "fechaPrimerPago"), r.fechaPrimerPago);
});
test("API failures with HTTP 200 enter existing error handling", async () => {
  await assert.rejects(
    readResponse(Response.json({ ok: false, message: "Error de API" })),
    /Error de API/,
  );
});
test("request preserves endpoint, effective setter, booker, dates, and consolidated opportunities", async (t) => {
  const saved = global.fetch;
  t.after(() => {
    global.fetch = saved;
  });
  const row = {
    pipeline: "lig",
    setterAsignado: "Carlos",
    createdByUserName: "Evelyn",
    fechaCita: "2026-09-02",
    fechaPrimerPago: "2026-10-01",
  };
  const sales = { total: 7, byStage: [{ stage: "Venta", count: 7 }], rows: [row, row] };
  global.fetch = async (url) => {
    const q = new URL(url, "http://local");
    assert.equal(q.pathname, "/api/reports/vsl-closers");
    assert.equal(q.searchParams.get("setter"), "Evelyn");
    assert.equal(q.searchParams.get("booker"), "Evelyn");
    assert.equal(q.searchParams.get("dateTo"), "2026-09-30");
    return Response.json({ sales, availableSetters: [] });
  };
  const report = await getVslClosersReport(
    {
      pipeline: "lig",
      setter: "Evelyn",
      booker: "Evelyn",
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
    },
    { includeDetail: true },
  );
  assert.deepEqual(report.sales, sales);
  assert.deepEqual(report.availableSetters, []);
});
test("report origin filters are sent exactly with closer and API options are authoritative", async (t) => {
  const saved = global.fetch;
  t.after(() => {
    global.fetch = saved;
  });
  for (const origin of ["Agendado automatico", "No agendado", ""]) {
    const body = {
      availableOrigins: ["Agendado automatico", "No agendado"],
      availableSetters: ["API name"],
    };
    global.fetch = async (url) => {
      const params = new URL(url, "http://local").searchParams;
      assert.equal(params.get("vslOrigin"), origin);
      assert.equal(params.get("closer"), "Closer seleccionado");
      return Response.json(body);
    };
    const result = await getVslClosersReport(
      { pipeline: "vsl", vslOrigen: origin, closer: "Closer seleccionado" },
      { includeDetail: false },
    );
    assert.deepEqual(result, body);
  }
});

test("legacy VSL local filter preserves all API sales aggregates and rows", () => {
  const sales = {
    total: 12,
    byStage: [{ stage: "Venta", count: 12 }],
    rows: [{ fechaPrimerPago: "2030-01-01" }],
  };
  const report = {
    filters: { pipeline: "vsl" },
    rawRecords: [
      {
        pipeline: "vsl",
        setterAsignado: "Jimena",
        createdByUserName: "Evelyn",
        vslCategoria: "paid",
        estadoAgenda: "Asistió",
      },
    ],
    sales,
  };
  const result = filtrarReporteVsl(report, "paid", {
    sort: "setterAsignado",
    direction: "asc",
    includeDetail: true,
    page: 1,
    pageSize: 25,
  });
  assert.equal(result.sales, sales);
  assert.equal(result, report);
});

const { getEffectiveVslOrigin, getVslType } = require("../src/lib/report-record.ts");
const { mapVslReportResponse } = require("../src/server/mappers/vsl-response.mapper.ts");

test("appointment creation date takes precedence and preserves actual appointment/payment dates", () => {
  const row = {
    appointmentCreatedAt: "2026-09-28",
    fechaCita: "2026-09-30",
    fechaReunion: "2026-10-01",
    fechaPrimerPago: "2026-11-01",
  };
  assert.equal(getEffectiveAppointmentDate(row), "2026-09-28");
  assert.equal(getEffectiveSaleDate(row), "2026-09-28");
  assert.equal(getEffectiveAppointmentDate({ ...row, appointmentCreatedAt: "" }), "2026-09-30");
  assert.equal(
    getEffectiveAppointmentDate({ ...row, appointmentCreatedAt: "", fechaCita: "" }),
    "2026-10-01",
  );
  assert.equal(getEffectiveAppointmentDate(null), "");
  assert.equal(getEffectiveSaleDate({ ...row, fechaVenta: "2026-09-27" }), "2026-09-27");
  assert.equal(getReportRecordValue(row, "fechaCita"), "2026-09-30");
  assert.equal(getReportRecordValue(row, "fechaPrimerPago"), "2026-11-01");
});

const paidOrigins = [
  "VSL FUNNEL",
  "VSL FUNNEL (B)",
  "CUESTIONARIO DE APLICACIÓN - VSL FUNNEL",
  "CUESTIONARIO DE APLICACIÓN - VSL FUNNEL (B)",
  'Encuesta al Lead: "Orden Empresarial Intensivo" 31 de agosto, 01 y 02 de septiembre 2026',
];
for (const origin of paidOrigins)
  test(`paid VSL origin: ${origin}`, () => {
    const row = Object.freeze({
      pipeline: "vsl",
      fuente: origin,
      vslOrigen: "",
      vslCategoria: "organic",
    });
    assert.equal(getEffectiveVslOrigin(row), origin);
    assert.equal(getVslType(row), "paid");
    assert.equal(getVslType({ ...row, vslOrigen: origin, fuente: "" }), "paid");
    assert.equal(getVslType({ ...row, vslOrigen: "Agendado automatico" }), "paid");
    for (const pipeline of ["oei", "lig"])
      assert.equal(getVslType({ ...row, pipeline }), "organic");
    assert.equal(row.vslCategoria, "organic");
  });
test("unknown origins retain existing category and explicit origin wins for display", () => {
  assert.equal(getVslType({ pipeline: "vsl", vslOrigen: "otro", vslCategoria: "paid" }), "paid");
  assert.equal(
    getVslType({ pipeline: "vsl", vslOrigen: "otro", vslCategoria: "organic" }),
    "organic",
  );
  assert.equal(getEffectiveVslOrigin({ vslOrigen: "original", fuente: "VSL FUNNEL" }), "original");
});

test("mapper preserves supplied dates in detail, raw records and sales without inventing absent dates", () => {
  const row = {
    pipeline: "vsl",
    appointmentCreatedAt: "2026-09-28",
    fechaVenta: "2026-09-29",
    fechaCita: "2026-09-30",
  };
  const q = {
    pipeline: "vsl",
    includeDetail: true,
    pageSize: 25,
    sort: "nombreContacto",
    direction: "asc",
  };
  const report = mapVslReportResponse(
    {
      ok: true,
      data: {
        rawRecords: [row, {}],
        detail: { rows: [row] },
        sales: { total: 2, rows: [row, row] },
        kpis: { total: 5 },
      },
    },
    q,
  );
  for (const r of [report.detail[0], report.rawRecords[0], report.sales.rows[0]]) {
    assert.equal(r.appointmentCreatedAt, row.appointmentCreatedAt);
    assert.equal(r.fechaVenta, row.fechaVenta);
  }
  assert.equal("appointmentCreatedAt" in report.rawRecords[1], false);
  assert.equal("fechaVenta" in report.rawRecords[1], false);
  assert.equal(report.kpis.total, 5);
  assert.equal(report.sales.rows.length, 2);
});

test("all query params and authoritative period results survive frontend service", async (t) => {
  const saved = global.fetch;
  t.after(() => {
    global.fetch = saved;
  });
  const filters = {
    pipeline: "vsl",
    calendar: "calendar",
    dateFrom: "2026-09-28",
    dateTo: "2026-09-28",
    setter: "setter",
    booker: "booker",
    closer: "closer",
    estadoAgenda: "Confirmado",
    vslOrigen: paidOrigins[4],
    leadType: "paid",
    preset: "custom",
  };
  const detail = {
    includeDetail: true,
    search: "name",
    page: 2,
    pageSize: 25,
    sort: "nombreContacto",
    direction: "desc",
  };
  const row = {
    pipeline: "vsl",
    appointmentCreatedAt: "2026-09-28",
    fechaCita: "2026-09-30",
    fechaPrimerPago: "2026-10-01",
    fuente: paidOrigins[4],
  };
  const body = {
    kpis: { total: 8, totalLeads: 1 },
    detail: [row],
    rawRecords: [row],
    sales: { total: 2, rows: [row, row] },
    availableOrigins: ["existing"],
  };
  global.fetch = async (url) => {
    const params = new URL(url, "http://local").searchParams;
    for (const [key, value] of Object.entries({
      ...filters,
      ...detail,
      status: filters.estadoAgenda,
      vslOrigin: filters.vslOrigen,
    })) {
      if (["preset", "estadoAgenda", "vslOrigen"].includes(key)) continue;
      assert.equal(params.get(key), String(value));
    }
    return Response.json(body);
  };
  const report = await getVslClosersReport(filters, detail);
  assert.deepEqual(report.kpis, body.kpis);
  assert.deepEqual(report.detail, body.detail);
  assert.deepEqual(report.sales, body.sales);
  assert.deepEqual(report.availableOrigins, ["existing"]);
  assert.equal(filtrarReporteVsl(report, "paid", detail), report);
});
