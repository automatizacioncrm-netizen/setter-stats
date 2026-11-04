const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  ts = require("typescript");
require.extensions[".ts"] = (m, p) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(p, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    p,
  );
const { consultantsSchema, consultantMonths } = require("../src/lib/consultants-report.ts");
const { consultantsApi } = require("../src/server/api/consultants.api.server.ts");
function fixture() {
  return {
    success: true,
    porArea: [{ MES: "NOVIEMBRE", RRHH: 1.5, MKTG: 2, FINANZAS: 3, "COMERCIAL/EMPRESARIAL": 4 }],
    porEmpresario: [
      {
        NOMBRE: "Empresa",
        ...Object.fromEntries(consultantMonths.map((month, i) => [month, i])),
        TOTAL: 55,
      },
    ],
  };
}
test("consultant contract preserves both tables, decimals, zeros and rejects incomplete or nonnumeric data", () => {
  const data = fixture();
  assert.deepEqual(consultantsSchema.parse(data), data);
  assert.equal(consultantsSchema.safeParse({ ...data, success: false }).success, false);
  assert.equal(
    consultantsSchema.safeParse({ ...data, porArea: [{ ...data.porArea[0], RRHH: "1" }] }).success,
    false,
  );
  const incomplete = fixture();
  delete incomplete.porEmpresario[0].Noviembre;
  assert.equal(consultantsSchema.safeParse(incomplete).success, false);
  assert.equal(
    consultantsSchema.safeParse({ success: true, porArea: [], porEmpresario: [] }).success,
    true,
  );
});
test("consultants GET uses only its environment URL, shares active requests and handles upstream failures", async () => {
  const oldFetch = global.fetch,
    oldUrl = process.env.APPS_SCRIPT_CONSULTORES_URL;
  const endpoint = "https://script.google.com/macros/s/consultants-test/exec";
  process.env.APPS_SCRIPT_CONSULTORES_URL = endpoint;
  let calls = 0;
  global.fetch = async (url, options) => {
    calls++;
    assert.equal(url, endpoint);
    assert.equal(options.method, "GET");
    assert.equal(options.headers, undefined);
    assert.equal(options.body, undefined);
    assert.ok(options.signal);
    await new Promise((resolve) => setTimeout(resolve, 5));
    return Response.json(fixture());
  };
  try {
    const responses = await Promise.all([consultantsApi(), consultantsApi()]);
    assert.equal(calls, 1);
    for (const response of responses) {
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), fixture());
    }
    const cases = [
      () => Response.json({ success: false }),
      () => new Response("oops", { status: 503 }),
      () => new Response("bad json"),
      () => new Response(""),
      () => Response.json({ ...fixture(), porArea: [{ MES: "MES" }] }),
      () => {
        throw new DOMException("timeout", "TimeoutError");
      },
    ];
    for (const make of cases) {
      global.fetch = async () => make();
      const response = await consultantsApi();
      assert.equal(response.status, 502);
      const body = await response.json();
      assert.ok(body.error);
      assert.ok(!body.porArea);
      assert.ok(!body.error.includes(endpoint));
    }
  } finally {
    global.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.APPS_SCRIPT_CONSULTORES_URL;
    else process.env.APPS_SCRIPT_CONSULTORES_URL = oldUrl;
  }
});
test("consultant tables render precisely the two independent source arrays and their required columns", () => {
  const Module = require("node:module"),
    path = require("node:path"),
    resolve = Module._resolveFilename;
  require.extensions[".tsx"] = (m, p) =>
    m._compile(
      ts.transpileModule(fs.readFileSync(p, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
        },
      }).outputText,
      p,
    );
  Module._resolveFilename = function (name, ...args) {
    return resolve.call(
      this,
      name.startsWith("@/") ? path.resolve("src", name.slice(2)) : name,
      ...args,
    );
  };
  let ConsultantsTables;
  try {
    ({ ConsultantsTables } = require("../src/components/reports/ConsultantsDashboard.tsx"));
  } finally {
    Module._resolveFilename = resolve;
  }
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  const original = fixture(),
    before = JSON.stringify(original);
  const html = renderToStaticMarkup(
    React.createElement(ConsultantsTables, { data: consultantsSchema.parse(original) }),
  );
  assert.equal((html.match(/<table /g) || []).length, 2);
  assert.equal((html.match(/<th /g) || []).length, 18);
  assert.equal((html.match(/<td /g) || []).length, 18);
  assert.ok(html.includes("REPORTE DE CALENDARIOS POR CONSULTOR"));
  assert.ok(html.includes("N° de sesiones que cada empresario recibe"));
  assert.ok(html.includes("NOVIEMBRE"));
  assert.ok(html.includes("1.5"));
  assert.ok(html.includes("Empresa"));
  assert.ok(html.includes(">Septiembre</th>"));
  assert.ok(!html.includes("Setiembre"));
  assert.equal(JSON.stringify(original), before);
});

test("Septiembre key validates the definitive contract and preserves fractional hours", () => {
  const raw = {
    success: true,
    porArea: [
      { MES: "OCTUBRE", RRHH: 76, MKTG: 16, FINANZAS: 23, "COMERCIAL/EMPRESARIAL": 124.16 },
    ],
    porEmpresario: [
      {
        NOMBRE: "CM001 - AYALA",
        Enero: 0,
        Febrero: 1,
        Marzo: 1,
        Abril: 0,
        Mayo: 2.67,
        Junio: 1.67,
        Julio: 0,
        Agosto: 4,
        Septiembre: 0,
        Octubre: 0,
        Noviembre: 0,
        TOTAL: 11.33,
      },
    ],
  };
  const parsed = consultantsSchema.parse(raw);
  assert.deepEqual(parsed, raw);
  assert.equal(consultantMonths[8], "Septiembre");
  assert.equal(parsed.porEmpresario[0][consultantMonths[8]], 0);
  assert.equal(parsed.porEmpresario[0].Mayo, 2.67);
  assert.equal(parsed.porEmpresario[0].Junio, 1.67);
  assert.equal(parsed.porEmpresario[0].TOTAL, 11.33);
  const invalid = structuredClone(raw);
  delete invalid.porEmpresario[0].Septiembre;
  invalid.porEmpresario[0].Setiembre = 2;
  assert.equal(consultantsSchema.safeParse(invalid).success, false);
});
