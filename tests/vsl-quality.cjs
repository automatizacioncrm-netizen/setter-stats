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
      rows: agendaStates.map((s) => ["2026-10", s, ...Array(17).fill(0)]),
    },
    diagnostics: { available: true, details: {} },
  };
}
test("real arrays, alternate headers, accents, OTRO and optional diagnostic warnings are accepted", () => {
  const f = fixture();
  assert.equal(f.quality.columns.length, 15);
  assert.equal(f.surveys.columns.length, 19);
  f.quality.columns[0] = " embudo vsl / closer ";
  f.surveys.columns[2] = "SI SOY EMPRESARIO";
  f.quality.rows[0][3] = 0.31;
  f.surveys.rows[0][15] = 0.5;
  f.surveys.rows[0][18] = 7;
  f.surveys.rows[0][9] = "  Cuello original  ";
  f.surveys.rows[0][3] = "";
  f.surveys.rows[0][4] = null;
  f.surveys.rows[0][5] = "12";
  const parsed = qualityReportSchema.parse(f);
  assert.equal(parsed.quality.rows[0][3], 0.31);
  assert.equal(parsed.surveys.rows[0][5], 12);
  assert.equal(parsed.surveys.rows[0][9], "  Cuello original  ");
  assert.equal(parsed.surveys.rows[4][1], "OTRO");
  assert.equal(parsed.surveys.rows[0][0], "2026-10");
  assert.equal(displayReportCell(0.31, 3, false), "31%");
  assert.equal(displayReportCell(0.31, 15, true), "31%");
  assert.equal(displayReportCell(7, 18, true), "7");
  assert.equal(displayReportCell(null, 4, true), "—");
  assert.match(displayReportCell("2026-10", 0, true), /OCTUBRE/);
  f.surveys.rows.pop();
  assert.equal(qualityReportSchema.safeParse(f).success, true);
});
test("incorrect row width identifies table and row; objects and wrong header widths rejected", () => {
  const f = fixture();
  f.surveys.rows[1].pop();
  let r = qualityReportSchema.safeParse(f);
  assert.equal(r.success, false);
  assert.deepEqual(r.error.issues[0].path, ["surveys", "rows", 1]);
  assert.match(r.error.issues[0].message, /Fila 2.*19.*18/);
  const g = fixture();
  g.quality.rows = [{ period: "JULIO" }];
  assert.equal(qualityReportSchema.safeParse(g).success, false);
  const h = fixture();
  h.quality.columns.pop();
  assert.equal(qualityReportSchema.safeParse(h).success, false);
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
test("rendered surveys show month once, blank following cells and monthly dividers; quality stays unchanged", () => {
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
  let ReportTable;
  try {
    ({ ReportTable } = require("../src/components/reports/VslQualityReport.tsx"));
  } finally {
    Module._resolveFilename = resolve;
  }
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  const f = fixture();
  f.surveys.rows.forEach((r) => (r[0] = "2026-10-01T00:00:00-05:00"));
  const html = renderToStaticMarkup(
    React.createElement(ReportTable, { title: "Encuestas", table: f.surveys, frozen: 2 }),
  );
  assert.equal((html.match(/>OCTUBRE</g) || []).length, 1);
  assert.ok(!html.includes("2026-10-01"));
  assert.equal((html.match(/<\/td>/g) || []).length, 5 * 17 + 1);
  assert.equal((html.match(/rowspan="5"/gi) || []).length, 1);
  assert.ok(html.includes("OTRO"));
  const quality = renderToStaticMarkup(
    React.createElement(ReportTable, { title: "Calidad", table: f.quality, frozen: 1 }),
  );
  assert.ok(quality.includes("DEL 22 AL 27 DE OCT"));
  assert.ok(!quality.includes("CITAS CON MATCH"));
  assert.ok(!quality.includes("CITAS SIN MATCH"));
  assert.equal((quality.match(/<\/td>/g) || []).length, 13);
  const four = { ...f.surveys, rows: f.surveys.rows.slice(0, 4) };
  const fourHtml = renderToStaticMarkup(
    React.createElement(ReportTable, { title: "Encuestas", table: four, frozen: 2 }),
  );
  assert.ok(/rowspan="4"/i.test(fourHtml));
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
test("detail API validates inputs, shares only identical in-flight requests and preserves server token", async () => {
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
    assert.equal(calls[0].searchParams.get("token"), "private-test");
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
