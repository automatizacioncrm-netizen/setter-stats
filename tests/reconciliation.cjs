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
const { reconciliationApi } = require("../src/server/api/reconciliation.api.server.ts");

test("global reconciliation uses the exact action and maps the observed nested response", async () => {
  const previous = {
    fetch: global.fetch,
    info: console.info,
    error: console.error,
    url: process.env.APPS_SCRIPT_URL,
    secret: process.env.APPS_SCRIPT_SECRET,
  };
  const logs = [];
  process.env.APPS_SCRIPT_URL = "https://example.com/exec";
  process.env.APPS_SCRIPT_SECRET = "test-private-secret";
  console.info = (...args) => logs.push(args);
  console.error = (...args) => logs.push(args);
  const request = () =>
    new Request("https://local.test/api/reports/vsl-closers/reconcile", {
      method: "POST",
      headers: { "x-report-request": "1" },
    });
  try {
    global.fetch = async (url, options) => {
      assert.equal(url.searchParams.get("action"), "reconcile_all");
      assert.equal(url.searchParams.get("key"), process.env.APPS_SCRIPT_SECRET);
      assert.equal(options.method, "POST");
      assert.equal(options.body, undefined);
      return Response.json({
        ok: true,
        resultado: {
          success: true,
          opportunities: { vsl: { actualizadas: 1 }, oei: { actualizadas: 5 } },
          calendar: { actualizadas: 2 },
          errors: [],
          seconds: 28.761,
        },
      });
    };
    const response = await reconciliationApi(request());
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.updated, 8);
    assert.equal(body.durationSeconds, 28.761);
    assert.equal(body.ok, true);

    global.fetch = async () =>
      Response.json({ ok: false, error: "Unauthorized test-private-secret" });
    const rejected = await reconciliationApi(request());
    assert.equal(rejected.status, 502);
    assert.match((await rejected.json()).message, /Unauthorized \[REDACTED\]/);

    global.fetch = async () => new Response("upstream unavailable", { status: 503 });
    assert.equal((await reconciliationApi(request())).status, 502);
    assert.ok(
      logs.some((entry) => entry[1].status === 503 && entry[1].body === "upstream unavailable"),
    );

    global.fetch = async () => new Response("<html>login</html>");
    assert.match((await (await reconciliationApi(request())).json()).message, /no JSON/);

    global.fetch = async () => {
      throw new TypeError("fetch failed test-private-secret", {
        cause: new Error("connection reset"),
      });
    };
    assert.equal((await reconciliationApi(request())).status, 502);
    assert.ok(logs.some((entry) => entry[1].cause?.includes("connection reset")));
    assert.ok(!JSON.stringify(logs).includes("test-private-secret"));
  } finally {
    global.fetch = previous.fetch;
    console.info = previous.info;
    console.error = previous.error;
    for (const [key, value] of [
      ["APPS_SCRIPT_URL", previous.url],
      ["APPS_SCRIPT_SECRET", previous.secret],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
