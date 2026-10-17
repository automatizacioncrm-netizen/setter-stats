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
const { triggerVslReconciliation } = require("../src/services/reconciliation.service.ts");
const { RECONCILIATION_PIPELINES } = require("../src/types/reconciliation.types.ts");

test("pipeline mapping and sequential checkpoints ignore nextAction", async (t) => {
  const savedFetch = global.fetch;
  t.after(() => {
    global.fetch = savedFetch;
  });
  for (const pipeline of ["vsl", "oei", "lig", "organico", "gira", "all"]) {
    assert.equal(RECONCILIATION_PIPELINES[pipeline], pipeline);
    let calls = 0;
    let active = false;
    global.fetch = async (url, options) => {
      assert.equal(active, false);
      active = true;
      const params = new URL(url, "https://local.test").searchParams;
      assert.equal(params.get("action"), "reconcile_all");
      assert.equal(params.get("pipeline"), pipeline);
      assert.equal(options.method, "POST");
      await Promise.resolve();
      active = false;
      return Response.json({ ok: true, completed: ++calls === 3, nextAction: "IGNORED" });
    };
    assert.equal((await triggerVslReconciliation("reconcile_all", pipeline)).completed, true);
    assert.equal(calls, 3);
  }
});

test("reconciliation stops on invalid responses and limits pending checkpoints", async (t) => {
  const savedFetch = global.fetch;
  t.after(() => {
    global.fetch = savedFetch;
  });
  for (const response of [
    () => Response.json({ ok: false, completed: false }),
    () => Response.json({ ok: true }),
    () => Response.json(null),
    () => new Response("invalid JSON"),
    () => new Response("failed", { status: 503 }),
    () => {
      throw new TypeError("network failed");
    },
  ]) {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      return response();
    };
    await assert.rejects(triggerVslReconciliation("reconcile_all", "lig"));
    assert.equal(calls, 1);
  }
  let calls = 0;
  global.fetch = async () => {
    calls++;
    return Response.json({ ok: true, completed: false });
  };
  await assert.rejects(triggerVslReconciliation(), /checkpoint/);
  assert.equal(calls, 100);
});

test("staged actions pass through the proxy and browser follows checkpoints", async (t) => {
  const saved = {
    fetch: global.fetch,
    url: process.env.APPS_SCRIPT_URL,
    secret: process.env.APPS_SCRIPT_SECRET,
  };
  process.env.APPS_SCRIPT_URL = "https://example.com/exec";
  process.env.APPS_SCRIPT_SECRET = "test-secret";
  t.after(() => {
    global.fetch = saved.fetch;
    for (const [key, value] of [
      ["APPS_SCRIPT_URL", saved.url],
      ["APPS_SCRIPT_SECRET", saved.secret],
    ])
      value === undefined ? delete process.env[key] : (process.env[key] = value);
  });
  for (const action of ["reconcile_all", "reconcile_opportunities", "reconcile_appointments"]) {
    let calls = 0;
    const upstream = async (url, options) => {
      assert.equal(url.searchParams.get("action"), action);
      assert.equal(url.searchParams.get("pipeline"), "lig");
      assert.equal(url.searchParams.get("secret"), "test-secret");
      assert.equal(options.method, "POST");
      const completed = ++calls > 1;
      return Response.json({
        ok: true,
        success: true,
        completed,
        stage: completed ? "COMPLETED" : "MISSING",
        nextAction: completed ? null : action,
        timestamp: "2026-10-12T12:00:00Z",
        resultado: { success: true, completed, result: { MISSING: { nuevas: 2 } } },
      });
    };
    global.fetch = upstream;
    const response = await reconciliationApi(
      new Request(
        `https://local.test/api/reports/vsl-closers/reconcile?action=${action}&pipeline=lig`,
        {
          method: "POST",
          headers: { "x-report-request": "1" },
        },
      ),
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.completed, false);
    assert.equal(body.nextAction, action);
    calls = 0;
    const wrapper = async (url, options) => {
      const request = new Request(new URL(url, "https://local.test"), options);
      global.fetch = upstream;
      try {
        return await reconciliationApi(request);
      } finally {
        global.fetch = wrapper;
      }
    };
    global.fetch = wrapper;
    const result = await triggerVslReconciliation(action, "lig");
    assert.equal(result.completed, true);
    assert.equal(calls, 2);
  }
});

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
