const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename,
  );
};

const { reportApi } = require("../src/server/api/report.api.server.ts");
const { getVslClosersReport } = require("../src/services/reports.ts");
const { getPipelineCardMetrics } = require("../src/lib/pipeline-summary.ts");
const { mapVslReportResponse } = require("../src/server/mappers/vsl-response.mapper.ts");

test("date contract preserves independent API totals and creation metadata without filtering rows", () => {
  const dateSemantics = {
    leads: "Creado el",
    appointments: "Fecha cita",
    appointmentsFallback: "Fecha de reunión",
    sales: "Fecha de primer pago",
  };
  const query = {
    pipeline: "oei",
    dateFrom: "2026-09-01",
    dateTo: "2026-09-30",
    includeDetail: true,
    pageSize: 25,
    sort: "nombreContacto",
    direction: "asc",
  };
  for (const [leads, appointments, sales] of [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 1, 1],
  ]) {
    const raw = {
      ok: true,
      data: {
        dateSemantics,
        leadTypeKpis: { totalLeads: leads },
        kpis: { total: appointments, asistio: appointments, tasaAsistencia: appointments * 100 },
        sales: {
          total: sales,
          rows: sales
            ? [
                {
                  fechaPrimerPago: "2026-09-12",
                  fase: "Ventas Confirmadas",
                  fechaCita: "2026-08-10",
                },
              ]
            : [],
        },
        detail: {
          rows: leads
            ? [
                {
                  nombreContacto: "Test",
                  fechaCreacionOportunidad: "2026-09-11T16:42:56.549Z",
                  fechaCita: appointments ? "2026-09-10" : "",
                },
              ]
            : [],
        },
      },
    };
    const result = mapVslReportResponse(raw, query);
    assert.equal(result.leadTypeKpis.totalLeads, leads);
    assert.equal(result.kpis.total, appointments);
    assert.equal(result.sales.total, sales);
    assert.equal(result.detail.length, leads);
    assert.deepEqual(result.dateSemantics, dateSemantics);
    if (leads) assert.equal(result.detail[0].fechaCreacionOportunidad, "2026-09-11T16:42:56.549Z");
    if (sales) assert.equal(result.sales.rows[0].fechaPrimerPago, "2026-09-12");
  }
});

const vslCalendars = [
  "Llamada de Claridad CM [A]",
  "Sesión Equipo Millonario (A)",
  "Llamada de Claridad CM [ORG]",
  "Sesión Equipo Millonario (ORG)",
];
const oeiCalendar = "Equipo Millonario | OEI";

test("las tres cards distinguen leads, agendamientos y asistencia por embudo", () => {
  const summary = {
    vsl: { totalLeads: 1200, conCitaCalendar: 300, estados: { asistio: 100 } },
    oei: { totalLeads: 826, conCitaCalendar: 42, estados: { asistio: 13 } },
  };
  assert.deepEqual(getPipelineCardMetrics(summary, "oei"), {
    totalLeads: 826,
    totalAppointments: 42,
    attended: 13,
    bookingRate: 5,
    attendanceRate: 31,
  });
  assert.deepEqual(getPipelineCardMetrics(summary, "all"), {
    totalLeads: 2026,
    totalAppointments: 342,
    attended: 113,
    bookingRate: 17,
    attendanceRate: 33,
  });
  assert.deepEqual(getPipelineCardMetrics(summary, "vsl"), {
    totalLeads: 1200,
    totalAppointments: 300,
    attended: 100,
    bookingRate: 25,
    attendanceRate: 33,
  });
});

test("VSL usa el resumen ya filtrado por tipo y no inventa totales si falta", () => {
  const filteredVsl = (totalLeads, conCitaCalendar, asistio) => ({
    vsl: { totalLeads, conCitaCalendar, estados: { asistio } },
  });
  assert.equal(getPipelineCardMetrics(filteredVsl(900, 250, 80), "vsl").totalAppointments, 250);
  assert.equal(getPipelineCardMetrics(filteredVsl(400, 100, 25), "vsl").totalAppointments, 100);
  assert.equal(getPipelineCardMetrics(filteredVsl(500, 150, 55), "vsl").totalAppointments, 150);
  assert.equal(getPipelineCardMetrics(filteredVsl(0, 0, 0), "vsl").attendanceRate, 0);
  assert.equal(getPipelineCardMetrics(undefined, "oei").totalLeads, null);
});

test("el proxy reenvía los cinco modos y acepta KPIs consolidados sin leadTypeKpis", async () => {
  process.env.APPS_SCRIPT_URL = "https://example.com/script";
  process.env.APPS_SCRIPT_SECRET = "test-secret";
  const originalFetch = global.fetch;
  try {
    for (const [pipeline, leadType, expectedCalendars] of [
      ["all", null, [...vslCalendars, oeiCalendar]],
      ["vsl", "all", vslCalendars],
      ["vsl", "paid", vslCalendars.slice(0, 2)],
      ["vsl", "organic", vslCalendars.slice(2)],
      ["oei", null, [oeiCalendar]],
    ]) {
      let upstream;
      global.fetch = async (url) => {
        upstream = new URL(url);
        return Response.json({
          ok: true,
          data: {
            report: "VSL | CLOSERS + OEI",
            filters: {
              available: {
                calendars: expectedCalendars,
                setters: ["Ana"],
                closers: ["Luis"],
                statuses: ["Agendado CRM", "Confirmado", "Asistió"],
              },
            },
            pipelineSummary: { vsl: { totalLeads: 2 }, oei: { totalLeads: 1 } },
            kpis: {
              total: 3,
              agendadoCRM: 0,
              confirmado: 1,
              asistio: 1,
              cancelado: 0,
              noShow: 0,
              pendienteAgenda: 1,
              reagendado: 0,
              tasaAsistencia: 33.33,
              tasaNoShow: 0,
            },
            setters: [{ setter: "Ana", total: 3, confirmado: 1, asistio: 1 }],
            sales: {
              total: 1,
              byStage: [{ stage: "Venta Cerrada", count: 1 }],
              rows: [{ nombreContacto: "Cliente", fase: "Venta Cerrada", montoUltimoPago: 100 }],
            },
            detail: {
              rows: [
                {
                  nombreContacto: "A",
                  estadoAgenda: "Confirmado",
                  estadoAgendaOriginal: "Agendado CRM",
                  estadoCita: "confirmed",
                },
                {
                  nombreContacto: "B",
                  estadoAgenda: "Asistió",
                  estadoAgendaOriginal: "Agendado CRM",
                  estadoCita: "showed",
                },
                {
                  nombreContacto: "C",
                  estadoAgenda: "Pendiente de agenda",
                  estadoAgendaOriginal: "Pendiente de agenda",
                  estadoCita: "",
                },
              ],
              pagination: { page: 1, totalRecords: 3 },
            },
          },
        });
      };
      const params = new URLSearchParams({ pipeline, includeDetail: "true" });
      if (leadType) params.set("leadType", leadType);
      const response = await reportApi(
        new Request(`https://local.test/api/reports/vsl-closers?${params}`),
      );
      assert.equal(response.status, 200);
      assert.equal(upstream.searchParams.get("pipeline"), pipeline);
      assert.equal(upstream.searchParams.get("leadType"), leadType);
      assert.equal(upstream.searchParams.get("includeDetail"), "true");
      const body = await response.json();
      assert.deepEqual(body.availableCalendars, expectedCalendars);
      assert.equal(body.kpis.total, 3);
      assert.equal(body.kpis.confirmado, 1);
      assert.equal(body.setters[0].confirmado, 1);
      assert.deepEqual(
        body.detail.map((row) => row.estadoAgenda),
        ["Confirmado", "Asistió", "Pendiente de agenda"],
      );
      assert.equal(body.sales.total, 1);
      assert.equal(body.pipelineSummary.oei.totalLeads, 1);
    }
  } finally {
    global.fetch = originalFetch;
  }
});

test("la petición inicial usa pipeline=all y omite leadType", async () => {
  process.env.APPS_SCRIPT_URL = "https://example.com/script";
  process.env.APPS_SCRIPT_SECRET = "test-secret";
  const originalFetch = global.fetch;
  try {
    let upstream;
    global.fetch = async (url) => {
      upstream = new URL(url);
      return Response.json({ ok: true, data: { kpis: { total: 0 }, setters: [], sales: {} } });
    };
    const response = await reportApi(new Request("https://local.test/api/reports/vsl-closers"));
    assert.equal(response.status, 200);
    assert.equal(upstream.searchParams.get("pipeline"), "all");
    assert.equal(upstream.searchParams.has("leadType"), false);
    assert.equal(upstream.searchParams.get("includeDetail"), "false");
  } finally {
    global.fetch = originalFetch;
  }
});

test("OEI reenvía booker y conserva personas, campos de cita y campos financieros", async () => {
  process.env.APPS_SCRIPT_URL = "https://example.com/script";
  process.env.APPS_SCRIPT_SECRET = "test-secret";
  const originalFetch = global.fetch;
  try {
    global.fetch = async (url) => {
      const upstream = new URL(url);
      assert.equal(upstream.searchParams.get("pipeline"), "oei");
      assert.equal(upstream.searchParams.get("booker"), "Jose Luis Botto Garcia");
      assert.equal(upstream.searchParams.get("closer"), "Amaranta Alfonso Krasnova");
      assert.equal(upstream.searchParams.has("leadType"), false);
      return Response.json({
        ok: true,
        data: {
          filters: {
            available: {
              bookers: ["Jose Luis Botto Garcia"],
              closers: ["0otMYLyUM0BjGXao6W0k"],
            },
          },
          appointmentPeople: {
            oeiBookers: [{ agendador: "Jose Luis Botto Garcia", total: 1 }],
            closers: [{ closer: "Amaranta Alfonso Krasnova", total: 1 }],
          },
          kpis: { total: 1, confirmado: 1 },
          setters: [],
          sales: {
            total: 1,
            byStage: [{ stage: "Ventas Confirmadas", count: 1 }],
            rows: [
              {
                nombreContacto: "Cliente",
                pipeline: "oei",
                secuencia: "Lanzamiento I. Pagado OEI - EM",
                calendarioCita: "Equipo Millonario | OEI",
                agendadorCita: "Jose Luis Botto Garcia",
                closerCita: "Amaranta Alfonso Krasnova",
                fase: "Ventas Confirmadas",
                montoTotalAcordado: 1497,
                montoUltimoPago: 597,
                moneda: "USD",
              },
            ],
          },
          detail: {
            rows: [
              {
                nombreContacto: "Cliente",
                agendadorCita: "Jose Luis Botto Garcia",
                createdByUserName: "Jose Luis Botto Garcia",
                closerCita: "Amaranta Alfonso Krasnova",
                montoTotalAcordado: 1497,
              },
            ],
            pagination: { totalRecords: 1, page: 1 },
          },
        },
      });
    };
    const params = new URLSearchParams({
      pipeline: "oei",
      booker: "Jose Luis Botto Garcia",
      closer: "Amaranta Alfonso Krasnova",
      includeDetail: "true",
    });
    const response = await reportApi(
      new Request(`https://local.test/api/reports/vsl-closers?${params}`),
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.availableBookers, ["Jose Luis Botto Garcia"]);
    assert.deepEqual(body.availableClosers, ["Amaranta Alfonso Krasnova"]);
    assert.equal(body.detail[0].agendadorCita, "Jose Luis Botto Garcia");
    assert.equal(body.detail[0].montoTotalAcordado, 1497);
    assert.equal(body.sales.rows[0].montoTotalAcordado, 1497);
  } finally {
    global.fetch = originalFetch;
  }
});

test("el fetcher conserva la ruta y solo envía leadType para VSL", async () => {
  const originalFetch = global.fetch;
  const urls = [];
  try {
    global.fetch = async (url) => {
      urls.push(new URL(url, "https://local.test"));
      return Response.json({});
    };
    const filters = {
      pipeline: "all",
      leadType: "all",
      calendar: "",
      preset: "todos",
      dateFrom: "",
      dateTo: "",
      setter: "",
      estadoAgenda: "",
      vslOrigen: "",
      closer: "",
    };
    const detail = {
      includeDetail: false,
      search: "",
      page: 1,
      pageSize: 25,
      sort: "nombreContacto",
      direction: "asc",
    };
    await getVslClosersReport(filters, detail);
    await getVslClosersReport({ ...filters, pipeline: "vsl", leadType: "all" }, detail);
    await getVslClosersReport({ ...filters, pipeline: "oei", leadType: "all" }, detail);
    assert.ok(urls.every((url) => url.pathname === "/api/reports/vsl-closers"));
    assert.equal(urls[0].searchParams.get("pipeline"), "all");
    assert.equal(urls[0].searchParams.has("leadType"), false);
    assert.equal(urls[1].searchParams.get("leadType"), "all");
    assert.equal(urls[2].searchParams.has("leadType"), false);
  } finally {
    global.fetch = originalFetch;
  }
});
