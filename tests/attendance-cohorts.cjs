const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { createHash } = require("node:crypto");
const harness = fs.readFileSync("tests/apps-script-v2.cjs", "utf8").split("module.exports = { setup };")[0];
const sandbox = { require, module: { exports: {} } };
vm.runInNewContext(harness + "\nmodule.exports = { setup, opportunity, appointment };", sandbox);
const { setup, opportunity, appointment } = sandbox.module.exports;
function fixture(pipeline) {
  const opp = opportunity("o", pipeline, false);
  opp["VSL Origen"] = "Agendado automatico";
  const appts = ["showed", "noshow", "confirmed", "cancelled"].map((state, i) => appointment("a" + i, "o", pipeline, state));
  return { opps: [opp], appts: [...appts, appts[0]] };
}
test("syntax and independent attendance cohorts for every funnel; Calendar remains intact", () => {
  new vm.Script(fs.readFileSync("apps-script/10_API.gs", "utf8"));
  for (const pipeline of ["vsl", "oei", "lig"]) {
    const f = fixture(pipeline);
    const api = setup(f);
    const r = api.report({ pipeline, dateFrom: "2026-10-01", dateTo: "2026-10-10" });
    assert.equal(r.performance.asistenciaPorSetter.reduce((n, x) => n + x.agendamientos, 0), 2, pipeline);
    assert.equal(r.performance.asistenciaPorCloserTodosEmbudos.reduce((n, x) => n + x.agendamientos, 0), 2);
    for (const row of [...r.performance.asistenciaPorSetter, ...r.performance.asistenciaPorCloserTodosEmbudos]) {
      assert.equal(row.citasAsistidas, 1);
      assert.equal(row.asistenciaPct, 50);
      assert.ok(row.citasAsistidas <= row.agendamientos);
    }
    assert.equal(r.performance.diagnostics.citasUnicasActividad, 4);
    assert.equal(r.performance.diagnostics.citasUnicasActividadSetter, 2);
    assert.equal(r.performance.diagnostics.citasUnicasActividadCloser, 2);
    assert.equal(r.businessMetrics.agendamientoPorSetter.reduce((n, x) => n + x.agendamientos, 0), 2);
    assert.equal(r.businessMetrics.agendamientoPorSetter.reduce((n, x) => n + x.agendados, 0), 1);
    assert.equal(r.businessMetrics.agendamientoPorSetter.reduce((n, x) => n + x.noAgendados, 0), 0);
    assert.equal(r.businessMetrics.sesionesEntregadasPorCloser[0].sesiones, 1);
    const states = api.detail({ pipeline, dateFrom: "2026-10-01", dateTo: "2026-10-10" }).rows.map(x => x.estado);
    assert.ok(states.includes("Confirmado"));
    assert.ok(states.includes("Cancelado"));
    const a = f.appts[0];
    a["_Appointment Created At"] = "2026-10-05";
    a["Fecha cita"] = "2026-10-20";
    const dates = setup({ opps: f.opps, appts: [a, a] });
    for (const [dateFrom, dateTo, setter, closer] of [
      ["2026-10-01", "2026-10-10", 1, 0],
      ["2026-10-15", "2026-10-25", 0, 1],
    ]) {
      const period = dates.report({ pipeline, dateFrom, dateTo });
      assert.equal(period.performance.diagnostics.citasUnicasActividadSetter, setter);
      assert.equal(period.performance.diagnostics.citasUnicasActividadCloser, closer);
      assert.equal(period.performance.asistenciaPorSetter.reduce((n, x) => n + x.agendamientos, 0), setter);
      assert.equal(period.performance.asistenciaPorCloserTodosEmbudos.reduce((n, x) => n + x.agendamientos, 0), closer);
    }
  }
});
test("protected seteo and historical sales code is unchanged from the supplied updated API", () => {
  const current = fs.readFileSync("apps-script/10_API.gs", "utf8");
  const hash = (a, b) => createHash("sha256").update(current.slice(current.indexOf(a), current.indexOf(b, current.indexOf(a))).replace(/\r\n/g, "\n")).digest("hex");
  // Fingerprints from the user-supplied updated API, independent of attachment paths.
  assert.equal(hash("  // ATRIBUCION HISTORICA:", "  const conversionPorCloser"), "e0aedbfa2c84534755a6768a9f89690c77bc67026389b22ad648318c44e8ba7d");
  assert.equal(hash("  const leadRegistros =", "  // DATASETS INDEPENDIENTES PARA SETTER"), "283ced0bd1934d987071093cb3b81c51eff72955ae1bf78c6e34a01ac5d32195");
});
test("all combines the three funnels once and preserves pipeline/calendar/booker filters", () => {
  const fixtures = ["vsl", "oei", "lig"].map(fixture);
  fixtures.forEach((f, i) => {
    f.opps[0]["Opportunity ID"] += i;
    new Set(f.appts).forEach(a => {
      a["_Appointment ID"] += i;
      a["_Opportunity ID"] += i;
    });
  });
  const options = {
    opps: fixtures.flatMap(f => f.opps),
    appts: fixtures.flatMap(f => f.appts),
  };
  const allowed = options.appts[0];
  options.appts.push({ ...allowed, "_Appointment ID": "forbidden", "Calendario cita": "Otro calendario" });
  const api = setup(options);
  const general = api.report({ pipeline: "all" });
  assert.equal(general.performance.diagnostics.citasUnicasActividadSetter, 6);
  assert.equal(general.performance.diagnostics.citasUnicasActividadCloser, 6);
  assert.equal(general.performance.diagnostics.citasUnicasActividad, 12);
  const scoped = api.report({ pipeline: "all", calendar: allowed["Calendario cita"] });
  assert.equal(scoped.performance.diagnostics.citasUnicasActividadSetter, 2);
  const person = api.report({ pipeline: "lig", booker: "No pertenece al equipo" });
  assert.equal(person.performance.diagnostics.citasUnicasActividadSetter, 0);
  assert.equal(person.performance.diagnostics.citasUnicasActividadCloser, 0);
});
