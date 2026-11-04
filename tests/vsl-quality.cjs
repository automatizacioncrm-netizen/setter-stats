const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (m, file) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    file,
  );
const {
  qualityReportSchema,
  qualityColumns,
  surveyColumns,
  agendaStates,
  displayReportCell,
} = require("../src/lib/vsl-quality.ts");
const { qualityApi, qualityStatus } = require("../src/server/api/vsl-quality.api.server.ts");
function fixture() {
  return {
    success: true,
    generatedAt: "2026-10-31T09:00:00-05:00",
    timeZone: "America/Lima",
    quality: {
      columns: [...qualityColumns],
      sourceSheet: "VSL_CALIDAD_LEADS",
      truncated: false,
      rows: [["DEL 22 AL 27 DE OCT", ...Array(14).fill(0)]],
    },
    surveys: {
      columns: [...surveyColumns],
      rows: [
        ["2026-10", 100, 0.86, 0.426, 0.493],
        ["2026-09", 80, 0.5, 0.25, 0.4],
      ],
    },
    surveyStatus: {
      columns: [
        "PERIODO / MES",
        "ESTADO DE AGENDA",
        ...Array.from({ length: 12 }, (_, i) => "Pregunta " + i),
      ],
      rows: ["2026-09", "2026-10"].flatMap((month) =>
        ["NO ASISTIÓ", "CANCELADO", "ASISTIÓ", "CONFIRMADO"].map((state, i) => [
          month,
          state,
          ...Array(12).fill(i + 1),
        ]),
      ),
    },
    diagnostics: { available: true, details: {} },
  };
}
test("monthly contract uses five real indicators, preserves API values/order and quality schema", () => {
  const f = fixture();
  const parsed = qualityReportSchema.parse(f);
  assert.equal(parsed.surveys.columns.length, 5);
  assert.deepEqual(parsed.surveys.rows, f.surveys.rows);
  assert.equal(parsed.quality.columns.length, 15);
  assert.deepEqual(parsed.quality.rows, f.quality.rows);
  assert.equal(displayReportCell(0.86, 2, true), "86%");
  assert.equal(displayReportCell(0.426, 3, true), "42.6%");
  assert.equal(displayReportCell(0.493, 4, true), "49.3%");
  assert.equal(displayReportCell(0.426, 3, false), "43%");
  f.surveys.rows[0][1] = "100";
  f.surveys.rows[0][2] = null;
  f.surveys.rows[0][3] = undefined;
  f.surveys.rows[0][4] = NaN;
  assert.deepEqual(qualityReportSchema.parse(f).surveys.rows[0].slice(1), [100, null, null, null]);
  assert.equal(displayReportCell(null, 2, true), "—");
});
test("monthly schema rejects obsolete layouts, incorrect headers, duplicate months and row widths", () => {
  const old = fixture();
  old.surveys.columns = Array(19).fill("ANTERIOR");
  old.surveys.rows = [["2026-10", "ASISTIÓ", ...Array(17).fill(0)]];
  assert.equal(qualityReportSchema.safeParse(old).success, false);
  const f = fixture();
  f.surveys.rows[1].pop();
  const r = qualityReportSchema.safeParse(f);
  assert.equal(r.success, false);
  assert.ok(r.error.issues.some((i) => i.message.includes("se esperaban 5")));
  const g = fixture();
  g.surveys.columns[1] = "ESTADO DE AGENDA";
  assert.equal(qualityReportSchema.safeParse(g).success, false);
  const duplicate = fixture();
  duplicate.surveys.rows.push(["OCTUBRE", 1, 0, 0, 0]);
  assert.equal(qualityReportSchema.safeParse(duplicate).success, false);
  const empty = fixture();
  empty.surveys.rows = [];
  assert.equal(qualityReportSchema.safeParse(empty).success, true);
  const failed = fixture();
  failed.success = false;
  assert.equal(qualityReportSchema.safeParse(failed).success, false);
});

test("status does not request upstream; simultaneous requests share one response; malformed responses fail closed", async () => {
  const oldFetch = global.fetch,
    oldEnv = process.env.APPS_SCRIPT_URL_VSL;
  process.env.APPS_SCRIPT_URL_VSL = "https://script.google.com/macros/s/test/exec";
  let calls = 0;
  try {
    global.fetch = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return Response.json(fixture());
    };
    await qualityStatus();
    assert.equal(calls, 0);
    const results = await Promise.all([qualityApi(), qualityApi()]);
    assert.equal(calls, 1);
    for (const r of results) {
      const body = await r.json();
      assert.equal(body.success, true);
      assert.ok(body.queriedAt);
    }
    global.fetch = async () =>
      Response.json({ success: false, error: "Falta la hoja VSL_CALIDAD_LEADS" });
    assert.equal(
      (await (await qualityApi()).json()).error,
      "Apps Script: Falta la hoja VSL_CALIDAD_LEADS",
    );
    process.env.APPS_SCRIPT_URL_VSL += "?token=private-test-token";
    global.fetch = async () =>
      Response.json({
        success: false,
        error:
          "Token private-test-token inválido https://example.com/private?token=private-test-token",
      });
    assert.doesNotMatch(
      JSON.stringify(await (await qualityApi()).json()),
      /private-test-token|https:\/\//,
    );
    for (const response of [
      new Response("<html>login</html>", { headers: { "content-type": "text/html" } }),
      new Response("", { headers: { "content-type": "application/json" } }),
      Response.json({ success: true }),
      new Response("", { status: 403 }),
    ]) {
      global.fetch = async () => response;
      const r = await qualityApi();
      assert.equal(r.status, 502);
      assert.doesNotMatch(JSON.stringify(await r.json()), /macros\/s\/test/);
      assert.equal((await qualityStatus().json()).available, false);
    }
  } finally {
    global.fetch = oldFetch;
    if (oldEnv === undefined) delete process.env.APPS_SCRIPT_URL_VSL;
    else process.env.APPS_SCRIPT_URL_VSL = oldEnv;
  }
});
const {
  normalizeSurveyMonth,
  formatSurveyMonth,
  groupSurveyRows,
} = require("../src/lib/survey-month.ts");
test("survey month formats extract text without timezone shifts", () => {
  for (const value of [
    "2026-10-01T00:00:00-05:00",
    "2026-10-01T00:00:00Z",
    "2026-10",
    "2026-10-01",
    "OCTUBRE",
    " octubre ",
  ]) {
    assert.equal(normalizeSurveyMonth(value), "2026-10");
    assert.equal(formatSurveyMonth(value), "OCTUBRE");
  }
  assert.equal(formatSurveyMonth("2026-09-01T00:00:00+14:00"), "SEPTIEMBRE");
  for (const value of [null, undefined, "", "  ", 123]) assert.equal(formatSurveyMonth(value), "");
  assert.equal(normalizeSurveyMonth("2026-13"), "2026-13");
});
test("survey groups sort years, months and agenda states without aggregating or mutating rows", () => {
  const row = (month, state, n) => [month, state, n, 0.31, ...Array(15).fill(n)];
  const rows = [
    row("2026-09", "OTRO", 1),
    row("2026-10-01T00:00:00-05:00", "NO ASISTIÓ", 2),
    row("OCTUBRE", "CONFIRMADO", 3),
    row("2027-01", "CONFIRMADO", 4),
    row("2026-10-01", "CANCELADO", 5),
    row("2026-10", "ASISTIÓ", 6),
    row("2026-10", "ASISTIÓ", 7),
    row("2026-09", "CONFIRMADO", 8),
    row(null, "OTRO", 9),
    row("", "CONFIRMADO", 10),
  ];
  const before = JSON.stringify(rows);
  const grouped = groupSurveyRows(rows);
  assert.deepEqual(
    grouped.map((g) => g.row[2]),
    [4, 3, 6, 7, 5, 2, 8, 1, 10, 9],
  );
  assert.deepEqual(
    grouped.map((g) => g.monthLabel),
    ["ENERO", "OCTUBRE", "", "", "", "", "SEPTIEMBRE", "", "", ""],
  );
  assert.deepEqual(
    grouped.map((g) => g.endOfMonth),
    [true, false, false, false, false, true, false, true, false, true],
  );
  assert.equal(JSON.stringify(rows), before);
  assert.equal(grouped.length, rows.length);
  for (const g of grouped) assert.ok(rows.includes(g.row));
});
test("integrated surveys render all questions and four merged KPI cells per month", () => {
  const Module = require("node:module"),
    path = require("node:path");
  const resolve = Module._resolveFilename;
  require.extensions[".tsx"] = (m, file) =>
    m._compile(
      ts.transpileModule(fs.readFileSync(file, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
        },
      }).outputText,
      file,
    );
  Module._resolveFilename = function (name, ...args) {
    return resolve.call(
      this,
      name.startsWith("@/") ? path.resolve("src", name.slice(2)) : name,
      ...args,
    );
  };
  let ReportTable, MonthlySurveyTable;
  try {
    ({ ReportTable } = require("../src/components/reports/VslQualityReport.tsx"));
    ({ MonthlySurveyTable } = require("../src/components/reports/MonthlySurveyTable.tsx"));
  } finally {
    Module._resolveFilename = resolve;
  }
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");

  const f = fixture();
  const before = JSON.stringify(f);
  const html = renderToStaticMarkup(
    React.createElement(MonthlySurveyTable, { table: f.surveys, statusTable: f.surveyStatus }),
  );
  assert.equal((html.match(/<th /g) || []).length, 18);
  assert.equal((html.match(/<td /g) || []).length, 114);
  assert.equal((html.match(/rowspan="4"/gi) || []).length, 10);
  assert.equal((html.match(/>OCTUBRE</g) || []).length, 1);
  assert.ok(html.indexOf("OCTUBRE") < html.indexOf("SEPTIEMBRE"));
  for (const value of ["100", "86%", "42.6%", "49.3%"]) assert.ok(html.includes(value));
  for (const value of ["ASISTIÓ", "CONFIRMADO", "ESTADO DE AGENDA", ...f.surveyStatus.columns])
    assert.ok(html.includes(value));
  assert.equal((html.match(/>100</g) || []).length, 1);
  assert.ok(html.includes("overflow-auto"));
  assert.ok(html.includes("sticky top-0"));
  assert.equal(JSON.stringify(f), before);
  const quality = renderToStaticMarkup(
    React.createElement(ReportTable, { title: "Calidad", table: f.quality, frozen: 1 }),
  );
  assert.ok(quality.includes("DEL 22 AL 27 DE OCT"));
  assert.equal((quality.match(/<td /g) || []).length, 11);
  assert.ok(!quality.includes("CITAS CON MATCH"));
  assert.ok(!quality.includes("CITAS SIN MATCH"));
  assert.ok(!quality.includes("TOTAL DE SETEOS"));
  assert.ok(!quality.includes("NO ASISTIERON"));
  const empty = renderToStaticMarkup(
    React.createElement(MonthlySurveyTable, {
      table: { ...f.surveys, rows: [] },
      statusTable: { ...f.surveyStatus, rows: [] },
    }),
  );
  assert.ok(empty.includes("Sin resultados"));
});
const {
  surveyDetailSchema,
  surveyDetailColumns,
  filterSurveyDetail,
  searchSurveyDetail,
  isDetailCount,
} = require("../src/lib/survey-detail.ts");
const { surveyDetailApi } = require("../src/server/api/vsl-survey-detail.api.server.ts");
function detailFixture(month = "2026-09", status = "ASISTIÓ") {
  const row = [
    month,
    status,
    "Persona de prueba",
    "+51900000000",
    "persona@example.test",
    "2026-09-01T00:00:00-05:00",
    "2026-08-31T23:00:00-05:00",
    "a",
    "c",
    "o",
    "s",
    "Sí, soy empresario",
    "USD 5,000–10,000",
    "Tiempo",
    "Sí",
    "Sí",
  ];
  return {
    success: true,
    columns: surveyDetailColumns,
    rows: [row, [...row]],
    total: 2,
    month,
    status,
  };
}
test("survey audit filters exact yes/no words, preserves duplicate IDs and original dates", () => {
  const f = detailFixture();
  const parsed = surveyDetailSchema.parse(f);
  assert.equal(filterSurveyDetail(parsed.rows, 14).length, 2);
  assert.equal(filterSurveyDetail(parsed.rows, 2).length, 2);
  parsed.rows.push([...parsed.rows[0]]);
  parsed.rows[2][11] = "No soy empresario";
  assert.equal(filterSurveyDetail(parsed.rows, 3).length, 1);
  parsed.rows[2][11] = "siempre";
  assert.equal(filterSurveyDetail(parsed.rows, 2).length, 2);
  assert.equal(parsed.rows[0][5], f.rows[0][5]);
  assert.equal(searchSurveyDetail(parsed.rows, "EXAMPLE.TEST").length, 3);
  assert.equal(searchSurveyDetail(parsed.rows, "900000000").length, 3);
  assert.equal(searchSurveyDetail(parsed.rows, "ausente").length, 0);
  for (const i of [2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 18])
    assert.equal(isDetailCount(0, i), true);
  for (const i of [0, 1, 9, 15, 16, 17]) assert.equal(isDetailCount(1, i), false);
  for (const i of [4, 5, 6, 7, 8, 10, 11, 12, 13, 18])
    assert.throws(() => filterSurveyDetail(parsed.rows, i), /faltan las funciones originales/);
});
test("detail API validates inputs, shares only identical in-flight requests and omits obsolete server tokens", async () => {
  const oldFetch = global.fetch,
    oldEnv = process.env.APPS_SCRIPT_URL_VSL;
  process.env.APPS_SCRIPT_URL_VSL =
    "https://script.google.com/macros/s/test/exec?token=private-test";
  const request = (month = "2026-09", status = "ASISTIÓ") =>
    new Request(
      "https://local.test/api/reports/vsl-calidad-detail?" + new URLSearchParams({ month, status }),
    );
  const calls = [];
  try {
    global.fetch = async (url) => {
      calls.push(new URL(url));
      await new Promise((r) => setTimeout(r, 5));
      return Response.json(
        detailFixture(
          new URL(url).searchParams.get("month"),
          new URL(url).searchParams.get("status"),
        ),
      );
    };
    assert.equal((await surveyDetailApi(request("2026-13"))).status, 400);
    assert.equal((await surveyDetailApi(request("2026-09", "invalid"))).status, 400);
    assert.equal(calls.length, 0);
    const responses = await Promise.all([
      surveyDetailApi(request()),
      surveyDetailApi(request()),
      surveyDetailApi(request("2026-10", "OTRO")),
    ]);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].searchParams.get("action"), "detail");
    assert.equal(calls[0].searchParams.has("token"), false);
    for (const r of responses) {
      assert.equal(r.status, 200);
      assert.equal(r.headers.get("cache-control"), "private, no-store");
      assert.equal((await r.json()).rows.length, 2);
    }
    for (const payload of [
      { success: false, error: "Acción no soportada" },
      fixture(),
      { ...detailFixture(), month: "2026-10" },
    ]) {
      global.fetch = async () => Response.json(payload);
      const r = await surveyDetailApi(request());
      assert.equal(r.status, 502);
      assert.ok((await r.json()).error);
    }
    global.fetch = async () => Response.json({ ...detailFixture(), rows: [], total: 0 });
    assert.equal((await (await surveyDetailApi(request())).json()).total, 0);
  } finally {
    global.fetch = oldFetch;
    if (oldEnv === undefined) delete process.env.APPS_SCRIPT_URL_VSL;
    else process.env.APPS_SCRIPT_URL_VSL = oldEnv;
  }
});
test("confirmed API headings are accepted while header and decimal range validation remain enforced", () => {
  const f = fixture();
  f.surveys.columns = [
    "PERIODO / MES",
    "Leads que completaron la encuesta",
    "% de leads que facturan USD 5,000 o más",
    "% de leads con disposición de inversión de al menos USD 3,000",
    "% leads calificados por encuesta (dispuestos y facturan 5k+ / facturan 5k+)",
  ];
  assert.equal(qualityReportSchema.safeParse(f).success, true);
  f.surveys.rows[0][2] = 86;
  assert.equal(qualityReportSchema.safeParse(f).success, false);
  f.surveys.rows[0][2] = -0.1;
  assert.equal(qualityReportSchema.safeParse(f).success, false);
  f.surveys.rows[0][2] = 1;
  assert.equal(qualityReportSchema.safeParse(f).success, true);
});
const { joinSurveyMonths } = require("../src/lib/join-survey-months.ts");
test("integrated month join uses keys, sorts months, preserves missing data and never sums KPI", () => {
  const f = fixture();
  const before = JSON.stringify(f);
  f.surveys.rows.reverse();
  const groups = joinSurveyMonths(f.surveys, f.surveyStatus);
  assert.deepEqual(
    groups.map((g) => g.month),
    ["2026-10", "2026-09"],
  );
  assert.equal(groups[0].kpis[1], 100);
  assert.equal(groups[1].kpis[1], 80);
  assert.deepEqual(
    groups[0].rows.map((r) => r.state),
    ["CONFIRMADO", "ASISTIÓ", "CANCELADO", "NO ASISTIÓ"],
  );
  assert.equal(groups[0].rows[0].values[2], 4);
  f.surveys.rows.reverse();
  assert.equal(JSON.stringify(f), before);
  f.surveys.rows.push(["2027-01", 9, 0.733, 0.422, 0.484]);
  f.surveyStatus.rows.push(["2026-08", "ASISTIÓ", ...Array(12).fill(1)]);
  const partial = joinSurveyMonths(f.surveys, f.surveyStatus);
  assert.equal(partial[0].month, "2027-01");
  assert.equal(partial[0].kpis[2], 0.733);
  assert.ok(partial[0].rows.every((r) => r.values === undefined));
  assert.equal(partial.at(-1).kpis, undefined);
  const missing = fixture();
  delete missing.surveyStatus;
  assert.equal(qualityReportSchema.safeParse(missing).success, false);
  const duplicate = fixture();
  duplicate.surveyStatus.rows.push(duplicate.surveyStatus.rows[0]);
  assert.equal(qualityReportSchema.safeParse(duplicate).success, false);
});

test("real ISO month periods are validated and joined without timezone conversion or mutating originals", () => {
  const f = fixture();
  f.surveys.rows[0][0] = "2026-10-01T00:00:00-05:00";
  f.surveyStatus.rows
    .filter((r) => r[0] === "2026-10")
    .forEach((r) => (r[0] = "2026-10-01T00:00:00-05:00"));
  const data = qualityReportSchema.parse(f);
  const joined = joinSurveyMonths(data.surveys, data.surveyStatus);
  assert.equal(joined[0].month, "2026-10");
  assert.equal(joined[0].kpis[1], 100);
  assert.ok(joined[0].rows.every((r) => r.values));
  assert.equal(data.surveys.rows[0][0], f.surveys.rows[0][0]);
});
const dates = require("../src/lib/vsl-date-range.ts");
const { syncLabel } = require("../src/lib/vsl-sync.ts");
const { vslSyncStartApi, vslSyncStatusApi } = require("../src/server/api/vsl-sync.api.server.ts");
test("date presets use Lima, inclusive Monday-Sunday weeks, leap dates and year transitions", () => {
  const now = new Date("2026-11-02T12:00:00Z");
  assert.deepEqual(dates.today(now), { startDate: "2026-11-02", endDate: "2026-11-02" });
  assert.deepEqual(dates.yesterday(now), { startDate: "2026-11-01", endDate: "2026-11-01" });
  assert.deepEqual(dates.thisWeek(now), { startDate: "2026-11-02", endDate: "2026-11-08" });
  assert.deepEqual(dates.lastWeek(now), { startDate: "2026-10-26", endDate: "2026-11-01" });
  assert.deepEqual(dates.thisMonth(now), { startDate: "2026-11-01", endDate: "2026-11-30" });
  assert.deepEqual(dates.lastMonth(now), { startDate: "2026-10-01", endDate: "2026-10-31" });
  assert.deepEqual(dates.monthOfYear(2026, 10), { startDate: "2026-10-01", endDate: "2026-10-31" });
  assert.deepEqual(dates.lastMonth(new Date("2027-01-03T12:00:00Z")), {
    startDate: "2026-12-01",
    endDate: "2026-12-31",
  });
  assert.deepEqual(dates.thisWeek(new Date("2027-01-01T12:00:00Z")), {
    startDate: "2026-12-28",
    endDate: "2027-01-03",
  });
  assert.equal(dates.limaDay(new Date("2026-11-02T02:00:00Z")), "2026-11-01");
  assert.equal(dates.rangeForPreset("all", undefined, now), undefined);
  assert.deepEqual(dates.rangeForPreset("month:10", undefined, now), dates.monthOfYear(2026, 10));
  assert.equal(dates.rangeLabel(dates.monthOfYear(2026, 10)), "OCTUBRE 2026");
  assert.equal(
    dates.rangeLabel({ startDate: "2026-10-10", endDate: "2026-10-20" }),
    "10 AL 20 DE OCTUBRE DE 2026",
  );
  for (const range of [
    { startDate: "", endDate: "" },
    { startDate: "2026-02-30", endDate: "2026-03-01" },
    { startDate: "2026-11-02", endDate: "2026-11-01" },
    { startDate: "2026-01-01", endDate: "2027-01-02" },
  ])
    assert.throws(() => dates.customRange(range.startDate, range.endDate));
  assert.deepEqual(dates.customRange("2024-01-01", "2024-12-31"), {
    startDate: "2024-01-01",
    endDate: "2024-12-31",
  });
});
function filteredFixture(startDate = "2026-10-01", endDate = "2026-10-31") {
  const f = fixture(),
    period = startDate + " / " + endDate;
  f.filter = { startDate, endDate, inclusive: true };
  f.quality.rows = [[period, ...Array(14).fill(1)]];
  f.surveys.rows = [[period, 100, 0.733, 0.422, 0.484]];
  f.surveyStatus.rows = ["CONFIRMADO", "ASISTIÓ", "CANCELADO", "NO ASISTIÓ"].map((state) => [
    period,
    state,
    ...Array(12).fill(1),
  ]);
  return f;
}
test("filtered contract keeps one interval and four states, preserves KPI and rejects historical substitutes", () => {
  const f = filteredFixture(),
    parsed = qualityReportSchema.parse(f);
  assert.equal(parsed.quality.columns.length, 15);
  assert.equal(parsed.quality.rows.length, 1);
  const groups = joinSurveyMonths(parsed.surveys, parsed.surveyStatus);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].rows.length, 4);
  assert.equal(groups[0].kpis[2], 0.733);
  assert.equal(displayReportCell(f.quality.rows[0][0], 0, false), "OCTUBRE 2026");
  const custom = filteredFixture("2026-10-10", "2026-10-20");
  assert.equal(qualityReportSchema.safeParse(custom).success, true);
  assert.equal(
    displayReportCell(custom.surveys.rows[0][0], 0, true),
    "10 AL 20 DE OCTUBRE DE 2026",
  );
  const cross = filteredFixture("2026-10-26", "2026-11-01");
  assert.equal(qualityReportSchema.safeParse(cross).success, true);
  assert.equal(joinSurveyMonths(cross.surveys, cross.surveyStatus).length, 1);
  f.quality.rows.push(f.quality.rows[0]);
  assert.equal(qualityReportSchema.safeParse(f).success, false);
  const wrong = filteredFixture();
  wrong.surveys.rows[0][0] = "2026-09";
  assert.equal(qualityReportSchema.safeParse(wrong).success, false);
});
test("report route forwards only validated ranges, isolates concurrent ranges, and never synchronizes on filters", async () => {
  const previous = global.fetch,
    previousEnv = process.env.APPS_SCRIPT_URL_VSL;
  process.env.APPS_SCRIPT_URL_VSL = "https://script.google.com/macros/s/test/exec";
  const calls = [];
  const request = (range) =>
    new Request(
      "https://local.test/api/reports/vsl-calidad" +
        (range ? "?" + new URLSearchParams(range) : ""),
    );
  try {
    global.fetch = async (input) => {
      const url = new URL(input);
      calls.push(url);
      await new Promise((r) => setTimeout(r, 5));
      return Response.json(
        url.searchParams.has("startDate")
          ? filteredFixture(url.searchParams.get("startDate"), url.searchParams.get("endDate"))
          : fixture(),
      );
    };
    const october = dates.monthOfYear(2026, 10),
      november = dates.monthOfYear(2026, 11);
    const [a, b, c] = await Promise.all([
      qualityApi(request(october)),
      qualityApi(request(october)),
      qualityApi(request(november)),
    ]);
    assert.equal(calls.length, 2);
    assert.equal((await a.json()).filter.startDate, "2026-10-01");
    assert.equal((await b.json()).filter.endDate, "2026-10-31");
    assert.equal((await c.json()).filter.startDate, "2026-11-01");
    const all = await (await qualityApi(request())).json();
    assert.equal(all.filter, undefined);
    assert.equal(all.quality.rows.length, fixture().quality.rows.length);
    assert.equal(all.surveys.rows.length, fixture().surveys.rows.length);
    assert.ok(calls.every((url) => url.searchParams.get("action") === "report"));
    assert.equal(calls.at(-1).searchParams.has("startDate"), false);
    const n = calls.length;
    assert.equal((await qualityApi(request({ startDate: "2026-10-01" }))).status, 400);
    assert.equal(calls.length, n);
    global.fetch = async () => Response.json(fixture());
    assert.equal((await qualityApi(request(october))).status, 502);
  } finally {
    global.fetch = previous;
    if (previousEnv === undefined) delete process.env.APPS_SCRIPT_URL_VSL;
    else process.env.APPS_SCRIPT_URL_VSL = previousEnv;
  }
});
test("token-free sync parses the deployed job envelope, rejects cross-origin POST and shares starts", async () => {
  const previous = global.fetch,
    previousEnv = process.env.APPS_SCRIPT_URL_VSL,
    previousToken = process.env.VSL_REFRESH_TOKEN;
  delete process.env.VSL_REFRESH_TOKEN;
  process.env.APPS_SCRIPT_URL_VSL =
    "https://script.google.com/macros/s/test/exec?token=obsolete&refreshToken=obsolete";
  let phase = "IDLE";
  const calls = [];
  const request = (origin = "https://local.test") =>
    new Request("https://local.test/api/reports/vsl-calidad-sync", {
      method: "POST",
      headers: { Origin: origin },
    });
  const state = () => ({
    id: phase === "IDLE" ? null : "job-test",
    status: phase,
    stage: phase === "RUNNING" ? "appointments" : null,
    completedStages:
      phase === "COMPLETED"
        ? ["leads", "appointments", "surveys", "reports"]
        : phase === "RUNNING"
          ? ["leads"]
          : [],
    warning: "Advertencia de cobertura",
    error: phase === "ERROR" ? "Error remoto" : null,
  });
  try {
    global.fetch = async (input, options) => {
      const url = new URL(input);
      calls.push({ url, options });
      await new Promise((resolve) => setTimeout(resolve, 5));
      assert.equal(url.searchParams.has("token"), false);
      assert.equal(url.searchParams.has("refreshToken"), false);
      if (options.method === "POST") {
        assert.deepEqual(JSON.parse(options.body), { action: "refresh" });
        phase = "QUEUED";
        return Response.json({ success: true, job: state() });
      }
      assert.equal(url.searchParams.get("action"), "syncstatus");
      return Response.json({ success: true, job: state() });
    };
    assert.equal((await vslSyncStartApi(request("https://other.test"))).status, 403);
    assert.equal(calls.length, 0);
    const responses = await Promise.all([vslSyncStartApi(request()), vslSyncStartApi(request())]);
    assert.equal(calls.filter((call) => call.options.method === "POST").length, 1);
    for (const response of responses) {
      const body = await response.json();
      assert.equal(body.status, "QUEUED");
      assert.equal(body.id, "job-test");
      assert.ok(!("job" in body));
    }
    await vslSyncStartApi(request());
    assert.equal(calls.filter((call) => call.options.method === "POST").length, 1);
    phase = "RUNNING";
    const running = await (await vslSyncStatusApi()).json();
    assert.equal(syncLabel(running), "Sincronizando agendamientos");
    assert.deepEqual(running.completedStages, ["leads"]);
    phase = "COMPLETED";
    const complete = await (await vslSyncStatusApi()).json();
    assert.equal(syncLabel(complete), "Actualización completada");
    assert.deepEqual(complete.completedStages, ["leads", "appointments", "surveys", "reports"]);
    phase = "ERROR";
    assert.equal((await (await vslSyncStatusApi()).json()).error, "Error remoto");
    global.fetch = async () => Response.json({ success: true, job: { status: "INVALID" } });
    assert.equal((await vslSyncStatusApi()).status, 502);
  } finally {
    global.fetch = previous;
    if (previousEnv === undefined) delete process.env.APPS_SCRIPT_URL_VSL;
    else process.env.APPS_SCRIPT_URL_VSL = previousEnv;
    if (previousToken === undefined) delete process.env.VSL_REFRESH_TOKEN;
    else process.env.VSL_REFRESH_TOKEN = previousToken;
  }
});
const {
  appointmentsByFunnelSchema,
  validateAppointmentsByFunnel,
  funnelAppointmentColumns,
  displayFunnelCell,
} = require("../src/lib/appointments-by-funnel.ts");
function funnelFixture(period = "2026-09-01 / 2026-09-30") {
  return {
    columns: [...funnelAppointmentColumns],
    rows: [
      "ORGÁNICO EQUIPO + ORGÁNICO CÍRCULO",
      "VSL PAGO CÍRCULO + VSL PAGO EQUIPO",
      "LIG CÍRCULO + LIG EQUIPO",
    ].map((funnel) => [funnel, period, 13, 9, 9 / 13, 4, 4 / 13, 1, 1, 2, 1]),
    sourceSheet: "VSL_APPOINTMENTS",
    truncated: false,
    skippedWithoutDate: 0,
    percentColumns: [4, 6],
  };
}
test("funnel table validates eleven positional columns, preserves metrics and only formats ratio indices", () => {
  const raw = funnelFixture(),
    before = JSON.stringify(raw),
    data = appointmentsByFunnelSchema.parse(raw);
  assert.equal(data.columns.length, 11);
  assert.deepEqual(data.rows, raw.rows);
  assert.equal(JSON.stringify(raw), before);
  assert.equal(displayFunnelCell(0.6923, 4), "69%");
  assert.equal(displayFunnelCell(0.3, 6), "30%");
  assert.equal(displayFunnelCell(0, 4), "0%");
  assert.equal(displayFunnelCell(0, 10), "0");
  for (const value of [NaN, Infinity, -1]) {
    const bad = funnelFixture();
    bad.rows[0][4] = value;
    assert.equal(appointmentsByFunnelSchema.safeParse(bad).success, false);
  }
  const duplicate = funnelFixture();
  duplicate.rows.push(duplicate.rows[0]);
  assert.equal(appointmentsByFunnelSchema.safeParse(duplicate).success, false);
  const narrow = funnelFixture();
  narrow.rows[0].pop();
  assert.equal(appointmentsByFunnelSchema.safeParse(narrow).success, false);
  const invalidHeaders = funnelFixture();
  invalidHeaders.columns[5] = "CANCELADOS";
  assert.equal(appointmentsByFunnelSchema.safeParse(invalidHeaders).success, false);
  assert.equal(validateAppointmentsByFunnel(undefined).data, undefined);
  assert.ok(
    validateAppointmentsByFunnel(raw, { startDate: "2026-10-01", endDate: "2026-10-31" }).error,
  );
});
test("funnel render handles real labels, eleven columns, percentages, empty/missing/error/truncation", () => {
  const Module = require("node:module"),
    path = require("node:path"),
    resolve = Module._resolveFilename;
  Module._resolveFilename = function (name, ...args) {
    return resolve.call(
      this,
      name.startsWith("@/") ? path.resolve("src", name.slice(2)) : name,
      ...args,
    );
  };
  let AppointmentsByFunnelTable;
  try {
    ({
      AppointmentsByFunnelTable,
    } = require("../src/components/reports/AppointmentsByFunnelTable.tsx"));
  } finally {
    Module._resolveFilename = resolve;
  }
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  const render = (table, error) =>
    renderToStaticMarkup(React.createElement(AppointmentsByFunnelTable, { table, error }));
  const data = funnelFixture(),
    html = render(data);
  assert.equal((html.match(/<th /g) || []).length, 18);
  assert.equal((html.match(/<table /g) || []).length, 3);
  assert.equal((html.match(/<td /g) || []).length, 18);
  for (const body of html.match(/<tbody>[\s\S]*?<\/tbody>/g) || []) {
    assert.ok(!body.includes("ORGÁNICO"));
    assert.ok(!body.includes("VSL PAGO"));
    assert.ok(!body.includes("LIG"));
  }
  assert.ok(html.includes("CANCELADOS"));
  assert.ok(!html.includes("CANCELADOS REALES"));
  assert.ok(html.includes("#FDECEC"));
  assert.ok(html.includes("69%"));
  for (const heading of [
    "NO ASISTIDOS / RESTANTES",
    "% NO ASISTIDOS / RESTANTES",
    "NO SHOW",
    "CONFIRMADOS",
    "OTROS",
  ])
    assert.ok(!html.includes(heading));
  assert.ok(html.includes("SEPTIEMBRE"));
  assert.ok(html.includes("ORGÁNICO"));
  assert.ok(html.includes("VSL PAGO"));
  assert.ok(html.includes("LIG"));
  assert.ok(html.includes("overflow-auto"));
  assert.ok(
    render({ ...data, rows: [] }).includes("No hay agendamientos para el período seleccionado"),
  );
  assert.ok(render(undefined).includes("La API todavía no entrega appointmentsByFunnel"));
  assert.ok(render(undefined, "Contrato incompatible").includes("Contrato incompatible"));
  assert.ok(render({ ...data, truncated: true }).includes("pueden estar incompletos"));
  assert.ok(!html.includes("NaN"));
  assert.ok(!html.includes("Infinity"));
  assert.ok(!html.includes("undefined"));
});
test("shared report carries funnel data for each global range without extra fetches or breaking tables 1/2", async () => {
  const previous = global.fetch,
    previousEnv = process.env.APPS_SCRIPT_URL_VSL;
  process.env.APPS_SCRIPT_URL_VSL = "https://script.google.com/macros/s/test/exec";
  let calls = 0;
  const request = (startDate, endDate) =>
    new Request(
      "https://local.test/api/reports/vsl-calidad?" + new URLSearchParams({ startDate, endDate }),
    );
  try {
    global.fetch = async (input) => {
      calls++;
      const url = new URL(input),
        start = url.searchParams.get("startDate"),
        end = url.searchParams.get("endDate");
      const raw = filteredFixture(start, end);
      raw.appointmentsByFunnel = funnelFixture(start + " / " + end);
      return Response.json(raw);
    };
    for (const [start, end] of [
      ["2026-09-01", "2026-09-30"],
      ["2026-10-22", "2026-10-27"],
    ]) {
      const response = await qualityApi(request(start, end)),
        body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.appointmentsByFunnel.rows.length, 3);
      assert.equal(body.appointmentsByFunnel.rows[0][1], start + " / " + end);
      assert.equal(body.quality.rows.length, 1);
      assert.equal(body.surveyStatus.rows.length, 4);
      assert.equal(body.surveys.rows.length, 1);
    }
    assert.equal(calls, 2);
    global.fetch = async () => Response.json(filteredFixture("2026-09-01", "2026-09-30"));
    let body = await (await qualityApi(request("2026-09-01", "2026-09-30"))).json();
    assert.ok(body.quality);
    assert.equal(body.appointmentsByFunnel, undefined);
    global.fetch = async () => {
      const raw = filteredFixture("2026-09-01", "2026-09-30");
      raw.appointmentsByFunnel = funnelFixture("2026-10-01 / 2026-10-31");
      return Response.json(raw);
    };
    body = await (await qualityApi(request("2026-09-01", "2026-09-30"))).json();
    assert.ok(body.quality);
    assert.ok(body.surveys);
    assert.equal(body.appointmentsByFunnel, undefined);
    assert.ok(body.appointmentsByFunnelError.includes("intervalo solicitado"));
    global.fetch = async () => {
      const raw = filteredFixture("2026-09-01", "2026-09-30");
      raw.appointmentsByFunnel = { columns: [], rows: [] };
      return Response.json(raw);
    };
    body = await (await qualityApi(request("2026-09-01", "2026-09-30"))).json();
    assert.ok(body.appointmentsByFunnelError.includes("datos incompatibles"));
    assert.ok(body.quality);
  } finally {
    global.fetch = previous;
    if (previousEnv === undefined) delete process.env.APPS_SCRIPT_URL_VSL;
    else process.env.APPS_SCRIPT_URL_VSL = previousEnv;
  }
});

test("Table 3 period labels distinguish historical cuts without changing quantities", () => {
  const { displayFunnelPeriod } = require("../src/lib/appointments-by-funnel.ts");
  for (const period of ["2026-10", "2026-10-01T00:00:00-05:00", "2026-10-01 / 2026-10-31"])
    assert.equal(displayFunnelPeriod(period), "OCTUBRE");
  assert.equal(displayFunnelPeriod("DEL 21 AL 27 DE OCT"), "OCTUBRE DEL 21 AL 27");
  assert.equal(displayFunnelPeriod("1 AL 20 OCT"), "OCTUBRE DEL 01 AL 20");
  assert.equal(displayFunnelPeriod("2026-10-22 / 2026-10-27"), "OCTUBRE");
  assert.equal(displayFunnelPeriod("SEPTIEMBRE"), "SEPTIEMBRE");
  assert.equal(displayFunnelPeriod("AGOSTO"), "AGOSTO");
  assert.equal(displayFunnelPeriod("2026-11-01 / 2026-11-30"), "NOVIEMBRE");
  assert.equal(
    displayFunnelPeriod("2026-10-26 / 2026-11-01"),
    "26 DE OCTUBRE DE 2026 AL 01 DE NOVIEMBRE DE 2026",
  );
  const rows = funnelFixture("DEL 21 AL 27 DE OCT").rows,
    before = JSON.stringify(rows);
  rows.forEach((row) => displayFunnelPeriod(row[1]));
  assert.equal(JSON.stringify(rows), before);
});
test("Table 3 separates groups, sorts historical periods and retains overlapping intervals without aggregation", () => {
  const {
    presentFunnelGroups,
    displayFunnelPeriod,
  } = require("../src/lib/appointments-by-funnel.ts");
  const base = funnelFixture(),
    rows = base.rows.flatMap((row) =>
      ["AGOSTO", "1 AL 20 OCT", "SEPTIEMBRE", "DEL 21 AL 27 DE OCT", "JULIO"].map(
        (period, index) => {
          const copy = [...row];
          copy[1] = period;
          copy[2] = index + 10;
          return copy;
        },
      ),
    );
  const before = JSON.stringify(rows),
    groups = presentFunnelGroups(rows);
  assert.equal(groups.length, 3);
  for (const group of groups) {
    assert.equal(group.rows.length, 5);
    assert.ok(group.rows.every((row) => row[0] === group.name));
    assert.deepEqual(
      group.rows.map((row) => displayFunnelPeriod(row[1])),
      ["OCTUBRE DEL 21 AL 27", "OCTUBRE DEL 01 AL 20", "SEPTIEMBRE", "AGOSTO", "JULIO"],
    );
    assert.deepEqual(
      group.rows.map((row) => row[2]),
      [13, 11, 12, 10, 14],
    );
  }
  assert.equal(JSON.stringify(rows), before);
  const month = presentFunnelGroups(funnelFixture("2026-10-01 / 2026-10-31").rows);
  assert.ok(
    month.every(
      (group) => group.rows.length === 1 && displayFunnelPeriod(group.rows[0][1]) === "OCTUBRE",
    ),
  );
  const partial = presentFunnelGroups(funnelFixture("2026-10-22 / 2026-10-27").rows);
  assert.ok(
    partial.every(
      (group) => group.rows.length === 1 && displayFunnelPeriod(group.rows[0][1]) === "OCTUBRE",
    ),
  );
  const zero = funnelFixture().rows[2];
  zero.splice(2, 9, ...Array(9).fill(0));
  const zeros = presentFunnelGroups([zero]);
  assert.equal(zeros[2].rows.length, 1);
  assert.equal(zeros[2].rows[0][2], 0);
  assert.equal(zeros[0].rows.length, 0);
});
test("monthly funnel validation never sums historical cuts, overlapping ranges or multi-month totals", () => {
  const raw = funnelFixture("1 AL 20 OCT");
  raw.rows.push(...funnelFixture("DEL 21 AL 27 DE OCT").rows);
  const before = JSON.stringify(raw);
  assert.match(validateAppointmentsByFunnel(raw).error, /agregación mensual/);
  assert.equal(JSON.stringify(raw), before);
  const overlap = funnelFixture("2026-10-01 / 2026-10-20");
  overlap.rows.push(...funnelFixture("2026-10-15 / 2026-10-31").rows);
  assert.ok(
    validateAppointmentsByFunnel(overlap, { startDate: "2026-10-01", endDate: "2026-10-31" }).error,
  );
  assert.match(
    validateAppointmentsByFunnel(funnelFixture("2026-10-22 / 2026-11-05"), {
      startDate: "2026-10-22",
      endDate: "2026-11-05",
    }).error,
    /cruza meses/,
  );
  const duplicateMonth = funnelFixture("2026-10");
  duplicateMonth.rows.push(...funnelFixture("OCTUBRE").rows);
  assert.match(
    validateAppointmentsByFunnel(duplicateMonth).error,
    /más de una fila|Fila duplicada/,
  );
  const badPercent = funnelFixture();
  badPercent.rows[0][4] = 0.9;
  assert.match(validateAppointmentsByFunnel(badPercent).error, /porcentajes/);
});
test("backend monthly aggregates and clipped month segments retain counts and percentages without recalculation", () => {
  const full = funnelFixture("2026-10"),
    before = JSON.stringify(full);
  assert.ok(validateAppointmentsByFunnel(full).data);
  assert.equal(JSON.stringify(full), before);
  const filter = { startDate: "2026-10-22", endDate: "2026-11-05" };
  const monthly = funnelFixture("2026-10-22 / 2026-10-31");
  monthly.rows.push(...funnelFixture("2026-11-01 / 2026-11-05").rows);
  const result = validateAppointmentsByFunnel(monthly, filter);
  assert.ok(result.data);
  assert.equal(result.data.rows.length, 6);
  assert.deepEqual(result.data.rows, monthly.rows);
  const groups = require("../src/lib/appointments-by-funnel.ts").presentFunnelGroups(
    result.data.rows,
  );
  assert.ok(groups.every((group) => group.rows.length === 2));
  assert.equal(
    require("../src/lib/appointments-by-funnel.ts").displayFunnelPeriod(monthly.rows[0][1]),
    "OCTUBRE",
  );
  assert.equal(
    require("../src/lib/appointments-by-funnel.ts").displayFunnelPeriod(monthly.rows[3][1]),
    "NOVIEMBRE",
  );
  const outside = funnelFixture("2026-10-01 / 2026-10-31");
  assert.ok(validateAppointmentsByFunnel(outside, filter).error);
});
test("deployed month-and-year labels preserve distinct calendar years, monthly rows and percentages", () => {
  const {
    funnelMonthKey,
    presentFunnelGroups,
    displayFunnelPeriod,
  } = require("../src/lib/appointments-by-funnel.ts");
  assert.equal(funnelMonthKey("OCTUBRE 2026"), "2026-10");
  assert.equal(funnelMonthKey("ENERO 2027"), "2027-01");
  assert.equal(funnelMonthKey("DICIEMBRE 2025"), "2025-12");
  const table = funnelFixture("OCTUBRE 2026");
  table.rows.push(...funnelFixture("SEPTIEMBRE 2026").rows, ...funnelFixture("ENERO 2027").rows);
  const before = JSON.stringify(table),
    parsed = validateAppointmentsByFunnel(table);
  assert.ok(parsed.data);
  assert.equal(JSON.stringify(table), before);
  assert.deepEqual(
    presentFunnelGroups(parsed.data.rows)[0].rows.map((row) => row[1]),
    ["ENERO 2027", "OCTUBRE 2026", "SEPTIEMBRE 2026"],
  );
  assert.equal(displayFunnelPeriod("OCTUBRE 2026"), "OCTUBRE");
  const filter = { startDate: "2026-10-22", endDate: "2026-11-05" },
    cross = funnelFixture("OCTUBRE 2026");
  cross.rows.push(...funnelFixture("NOVIEMBRE 2026").rows);
  const result = validateAppointmentsByFunnel(cross, filter);
  assert.ok(result.data);
  assert.ok(presentFunnelGroups(result.data.rows).every((group) => group.rows.length === 2));
  const duplicate = funnelFixture("OCTUBRE 2026");
  duplicate.rows.push(...funnelFixture("2026-10").rows);
  assert.ok(validateAppointmentsByFunnel(duplicate).error);
});
test("monthly funnel totals exclude informative cancellations and retain valid zero months", () => {
  const bad = funnelFixture("OCTUBRE 2026");
  bad.rows[0][10] += 1;
  assert.match(validateAppointmentsByFunnel(bad).error, /estados inconsistentes/);
  const zero = funnelFixture("OCTUBRE 2026");
  zero.rows.forEach((row) => row.splice(2, 9, ...Array(9).fill(0)));
  assert.ok(validateAppointmentsByFunnel(zero).data);
  const valid = funnelFixture("OCTUBRE 2026"),
    before = JSON.stringify(valid);
  assert.ok(validateAppointmentsByFunnel(valid).data);
  assert.equal(JSON.stringify(valid), before);
  valid.rows[0][7] = 99;
  assert.ok(validateAppointmentsByFunnel(valid).data);
  zero.rows[0][7] = 7;
  assert.ok(validateAppointmentsByFunnel(zero).data);
  const obsolete = funnelFixture("OCTUBRE 2026");
  obsolete.rows[0][2] += obsolete.rows[0][7];
  assert.match(validateAppointmentsByFunnel(obsolete).error, /estados inconsistentes/);
});

test("cancellation presentation handles zero, one and multiple cancellations without rounding inputs", () => {
  const { formatCancellationPercent } = require("../src/lib/appointments-by-funnel.ts");
  assert.equal(formatCancellationPercent(0, 0), "0%");
  assert.equal(formatCancellationPercent(1, 3), "33.33%");
  assert.equal(formatCancellationPercent(7, 49), "14.29%");
});
test("bottleneck details start collapsed, preserve text and toggle independently", () => {
  const React = require("react");
  const originalState = React.useState,
    originalId = React.useId;
  const states = new Map();
  let cell = "first";
  React.useId = () => cell;
  React.useState = (initial) => [
    states.get(cell) ?? initial,
    (update) => {
      const key = cell;
      states.set(key, typeof update === "function" ? update(states.get(key) ?? initial) : update);
    },
  ];
  try {
    const { BottleneckDetail } = require("../src/components/reports/BottleneckDetail.tsx");
    const text = "Equipo (12) | Procesos (8)\nTiempo (3)";
    let tree = BottleneckDetail({ value: text });
    assert.equal(tree.props.children[0].props["aria-expanded"], false);
    assert.equal(tree.props.children[1].props.children.props.children.props.children, text);
    tree.props.children[0].props.onClick();
    assert.equal(BottleneckDetail({ value: text }).props.children[0].props["aria-expanded"], true);
    cell = "second";
    assert.equal(
      BottleneckDetail({ value: "Otro (2)" }).props.children[0].props["aria-expanded"],
      false,
    );
    cell = "first";
    tree = BottleneckDetail({ value: text });
    tree.props.children[0].props.onClick();
    assert.equal(BottleneckDetail({ value: text }).props.children[0].props["aria-expanded"], false);
    assert.equal(BottleneckDetail({ value: " " }).props.children, "—");
  } finally {
    React.useState = originalState;
    React.useId = originalId;
  }
});
