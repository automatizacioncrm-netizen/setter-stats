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
  EMPTY_REPORT_FILTERS,
  changeReportFilters,
  rangeForPreset,
} = require("../src/lib/report-filter-state.ts");
const {
  getVslClosersReport,
  appointmentDetailFilters,
  getAppointmentDetail,
} = require("../src/services/reports.ts");
const { reportApi } = require("../src/server/api/report.api.server.ts");
const { getPipelineCardMetrics } = require("../src/lib/pipeline-summary.ts");
const { getEffectiveSetter } = require("../src/lib/report-record.ts");
const { triggerVslReconciliation } = require("../src/services/reconciliation.service.ts");

for (const pipeline of ["organico", "gira"]) {
  test(`${pipeline}: month, report, modal and refresh retain pipeline through API`, async (t) => {
    const savedFetch = global.fetch;
    const savedEnv = { ...process.env };
    t.after(() => {
      global.fetch = savedFetch;
      for (const key of ["APPS_SCRIPT_URL", "APPS_SCRIPT_SECRET"])
        savedEnv[key] === undefined ? delete process.env[key] : (process.env[key] = savedEnv[key]);
    });
    process.env.APPS_SCRIPT_URL = "https://script.google.com/macros/s/test/exec";
    process.env.APPS_SCRIPT_SECRET = "test-secret";
    const october = rangeForPreset("mesPasado", new Date("2026-11-15T12:00:00Z"));
    assert.deepEqual(october, { dateFrom: "2026-10-01", dateTo: "2026-10-31" });
    let filters = changeReportFilters(
      { ...EMPTY_REPORT_FILTERS, setter: "Persona", preset: "mesPasado", ...october },
      { pipeline },
    );
    assert.equal(filters.booker, "Persona");
    assert.equal(filters.setter, "");
    filters = changeReportFilters(filters, {
      ...rangeForPreset("mesPasado", new Date("2026-12-15T12:00:00Z")),
    });
    assert.equal(filters.pipeline, pipeline);
    filters = changeReportFilters(filters, october);
    assert.equal(
      changeReportFilters(filters, { pipeline: pipeline === "gira" ? "organico" : "gira" })
        .dateFrom,
      october.dateFrom,
    );
    assert.equal(
      changeReportFilters(filters, { preset: "todos", dateFrom: "", dateTo: "" }).pipeline,
      pipeline,
    );
    const stage = { totalLeads: 10, porEtapa: [{ fase: "Nuevo", total: 10 }] };
    const payload = {
      ok: true,
      data: {
        report: "Reporte",
        kpis: { total: 2, asistio: 1 },
        pipelineSummary: {
          [pipeline]: { totalLeads: 10, conCitaCalendar: 2, estados: { asistio: 1 } },
        },
        etapasPorEmbudo: { porEmbudo: { [pipeline]: stage } },
        detail: { rows: [{ pipeline, setterAsignado: "Asignado", agendadorCita: "Persona" }] },
      },
    };
    let upstreamCalls = 0;
    global.fetch = async (input) => {
      const url = new URL(input, "https://local.test");
      assert.equal(url.searchParams.get("pipeline"), pipeline);
      assert.equal(url.searchParams.get("dateFrom"), october.dateFrom);
      assert.equal(url.searchParams.get("dateTo"), october.dateTo);
      assert.equal(url.searchParams.has("leadType"), false);
      if (url.hostname === "script.google.com") {
        upstreamCalls++;
        return Response.json(payload);
      }
      return reportApi(new Request(url));
    };
    const report = await getVslClosersReport(filters, {
      page: 1,
      pageSize: 50,
      search: "",
      sort: "nombreContacto",
      direction: "asc",
      includeDetail: true,
    });
    assert.equal(upstreamCalls, 1);
    assert.equal(report.filters.pipeline, pipeline);
    assert.deepEqual(report.etapasPorEmbudo.porEmbudo[pipeline], stage);
    assert.equal(getPipelineCardMetrics(report.pipelineSummary, pipeline).totalLeads, 10);
    assert.equal(report.detail[0].pipeline, pipeline);
    assert.equal(getEffectiveSetter(report.detail[0]), "Persona");
    const modal = appointmentDetailFilters(filters, "Persona");
    assert.equal(modal.booker, "Persona");
    assert.equal(modal.bookingMode, "");
    global.fetch = async (input) => {
      const url = new URL(input, "https://local.test");
      assert.equal(url.searchParams.get("pipeline"), pipeline);
      assert.equal(url.searchParams.get("dateFrom"), october.dateFrom);
      assert.equal(url.searchParams.get("dateTo"), october.dateTo);
      return Response.json({
        rows: [],
        pagination: { page: 1, pageSize: 50, totalRecords: 0, totalPages: 1 },
      });
    };
    await getAppointmentDetail(modal);
    let checkpoints = 0;
    global.fetch = async (input) => {
      assert.equal(new URL(input, "https://local.test").searchParams.get("pipeline"), pipeline);
      return Response.json({ ok: true, completed: ++checkpoints === 3 });
    };
    assert.equal((await triggerVslReconciliation("reconcile_all", pipeline)).completed, true);
    assert.equal(checkpoints, 3);
  });
}
test("all aggregates every supplied pipeline and supports older summaries", () => {
  const section = { totalLeads: 10, conCitaCalendar: 2, estados: { asistio: 1 } };
  const all = Object.fromEntries(
    ["vsl", "oei", "lig", "organico", "gira"].map((p) => [p, section]),
  );
  assert.equal(getPipelineCardMetrics(all, "all").totalLeads, 50);
  assert.equal(getPipelineCardMetrics({ vsl: section, oei: section }, "all").totalLeads, 20);
});
