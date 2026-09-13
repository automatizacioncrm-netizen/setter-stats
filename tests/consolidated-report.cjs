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

const vslCalendars = [
  "Llamada de Claridad CM [A]",
  "Sesión Equipo Millonario (A)",
  "Llamada de Claridad CM [ORG]",
  "Sesión Equipo Millonario (ORG)",
];
const oeiCalendar = "Equipo Millonario | OEI";

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
