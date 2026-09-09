const ts = require("typescript");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { test } = require("node:test");
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename,
  );
const {
  CALENDARS,
  appointmentDate,
  normalizeAppointments,
  aggregateAppointments,
  appointmentsPayload,
} = require("../src/lib/appointments.ts");
const all = { month: "", closer: "", calendar: "" };
const row = (id, overrides = {}) => ({
  "Id. de cita": id,
  "FECHA CITA": "2026-08-01",
  "_Calendar ID": CALENDARS[0].id,
  "CLOSER ASIGNADO": "Daniela",
  Resultado: " SHOWED ",
  ...overrides,
});

test("appointment dates preserve Lima day and validate calendar dates", () => {
  assert.equal(appointmentDate("2026-08-01"), "2026-08-01");
  assert.equal(appointmentDate("2026-08-01T02:00:00Z"), "2026-07-31");
  assert.equal(appointmentDate("2026-08-01T00:30:00-05:00"), "2026-08-01");
  assert.equal(appointmentDate("2026-08-01T00:30:00"), "2026-08-01");
  assert.equal(appointmentDate("2/8/2026"), "2026-08-02");
  assert.equal(appointmentDate("2026-02-30"), null);
  assert.equal(appointmentDate("31/02/2026"), null);
  assert.equal(appointmentDate(""), null);
});

test("deduplication precedes filtering; newest update wins across months/status/calendars", () => {
  const { appointments } = normalizeAppointments([
    row("a", {
      "_Updated At": "2026-08-03T12:00:00Z",
      Resultado: "cancelled",
      "FECHA CITA": "2026-09-01",
      "_Calendar ID": CALENDARS[1].id,
    }),
    row("a", { "_Updated At": "2026-08-01T12:00:00Z" }),
  ]);
  assert.equal(appointments.length, 1);
  assert.equal(aggregateAppointments(appointments, { ...all, month: "2026-08" }).total, 0);
  assert.equal(aggregateAppointments(appointments, all).effective, 0);
});

test("combined filters, showed-only metrics, four categories and grand total agree", () => {
  const { appointments } = normalizeAppointments([
    row("a"),
    row("a"),
    row("b", { Resultado: "confirmed" }),
    row("c", { Resultado: "noshow" }),
    row("d", { Resultado: "cancelled" }),
    row("e", { "_Calendar ID": CALENDARS[1].id }),
    row("f", { "CLOSER ASIGNADO": "Amaranta" }),
    row("g", { "FECHA CITA": "2026-09-01" }),
    row("h", { "CLOSER ASIGNADO": " " }),
  ]);
  const report = aggregateAppointments(appointments, {
    month: "2026-08",
    closer: "Daniela",
    calendar: CALENDARS[0].id,
  });
  assert.equal(report.total, 4);
  assert.equal(report.effective, 1);
  assert.equal(report.attendance, 25);
  assert.deepEqual(report.table[0].counts, [1, 0, 0, 0]);
  assert.equal(report.days.length, 31);
  assert.equal(report.days[9].date, "2026-08-10");
  for (const filters of [
    all,
    { ...all, month: "2026-08" },
    { ...all, closer: "Sin closer asignado" },
    { ...all, calendar: CALENDARS[1].id },
  ]) {
    const result = aggregateAppointments(appointments, filters);
    assert.equal(
      result.table.reduce((sum, r) => sum + r.total, 0),
      result.effective,
    );
    assert.equal(
      result.days.reduce((sum, d) => sum + d.effective, 0),
      result.effective,
    );
    assert.equal(
      result.days.reduce((sum, d) => sum + d.appointments, 0),
      result.total,
    );
    assert.ok(result.table.every((r) => r.counts.length === 4));
  }
  const empty = aggregateAppointments(appointments, { ...all, closer: "Missing" });
  assert.equal(empty.total, 0);
  assert.equal(empty.attendance, 0);
});

test("ID takes precedence; fallback tolerates accents; invalid data is reported", () => {
  const result = normalizeAppointments([
    row("a", { "_Calendar ID": "", Calendario: " sesion  equipo millonario (a) " }),
    row("b", { "_Calendar ID": "unknown", Calendario: CALENDARS[0].name }),
    row("c", { "FECHA CITA": "", "Hora solicitada": "2026-08-03T02:00:00Z" }),
    row("d", { "FECHA CITA": "invalid" }),
    row(""),
  ]);
  assert.equal(result.appointments.length, 2);
  assert.equal(result.appointments[0].calendarId, CALENDARS[2].id);
  assert.equal(result.appointments[1].date, "2026-08-02");
  assert.equal(result.invalid, 2);
  assert.equal(appointmentsPayload.safeParse({ ok: false, rows: [] }).success, false);
  assert.equal(appointmentsPayload.safeParse({ ok: true, rows: "invalid" }).success, false);
});
