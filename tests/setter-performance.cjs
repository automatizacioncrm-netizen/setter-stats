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
    "commonjs",
  );
const { normalizeSetterRows, getCanonicalSetterName } = require("../src/lib/setter-performance.ts");
const { getAppointmentDetail } = require("../src/services/reports.ts");

test("actual VSL names yield six canonical rows and all metrics merge without mutation", () => {
  const source = Object.freeze(
    [
      ["Jose Luis", 313],
      ["Sin setter", 313],
      ["Evelyn", 179],
      ["Jimena", 101],
      ["Cinthia", 85],
      ["Joseph", 51],
      ["Kiara", 4],
      ["Carla", 2],
    ].map(([setter, total]) => Object.freeze({ setter, total })),
  );
  const result = normalizeSetterRows(source);
  assert.equal(result.length, 6);
  assert.deepEqual(
    result.map((row) => row.setter),
    [
      "Jose Luis Botto Garcia",
      "Sin setter",
      "Evelyn Lopez Horna",
      "Claudia Jimena Ocampo Portilla",
      "Cinthia Maquito",
      "Kiara",
    ],
  );
  assert.equal(
    result.reduce((sum, row) => sum + row.total, 0),
    995,
  );
  assert.equal(getCanonicalSetterName("  JOSÉ   LUIS  "), "Jose Luis Botto Garcia");
  for (const name of ["Joseph", "Carla", "constructor", "Otro"])
    assert.equal(getCanonicalSetterName(name), null);
  const keys = [
    "agendadoCRM",
    "confirmado",
    "asistio",
    "cancelado",
    "noShow",
    "pendienteAgenda",
    "reagendado",
    "total",
  ];
  for (const names of [
    ["Alvaro", "Alvaro Jesus Paniura Marin"],
    ["Jose Luis", "Jose Luis Botto Garcia"],
    ["Evelyn", "Evelyn Lopez Horna"],
    ["Cinthia", "Cinthia Maquito"],
    ["Jimena", "Claudia Jimena Ocampo Portilla"],
  ]) {
    const rows = Object.freeze(
      names.map((setter, index) =>
        Object.freeze({
          setter,
          ...Object.fromEntries(keys.map((key) => [key, index === 0 ? 3 : 7])),
        }),
      ),
    );
    const [merged] = normalizeSetterRows(rows);
    assert.equal(normalizeSetterRows(rows).length, 1);
    for (const key of keys) assert.equal(merged[key], 10, key);
    assert.deepEqual(merged.sourceNames, names);
  }
  assert.deepEqual(normalizeSetterRows([]), []);
  assert.deepEqual(normalizeSetterRows([{ setter: "Alvaro", total: 0 }]), []);
});

test("merged exact-name details preserve filters, summaries and pagination across aliases", async (t) => {
  const saved = global.fetch;
  t.after(() => {
    global.fetch = saved;
  });
  const names = ["Jose Luis", "Jose Luis Botto Garcia"];
  for (const pipeline of ["vsl", "oei", "lig", "all"]) {
    const calls = [];
    const signal = new AbortController().signal;
    global.fetch = async (url, options) => {
      const params = new URL(url, "http://local").searchParams;
      calls.push(Object.fromEntries(params));
      const name = params.get(pipeline === "oei" || pipeline === "lig" ? "booker" : "setter");
      assert.ok(names.includes(name));
      for (const [key, value] of Object.entries({
        pipeline,
        closer: "Closer",
        calendar: "Calendar",
        vslOrigin: "No agendado",
        dateFrom: "2026-09-01",
        status: "Asistió",
        search: "correo@example.com",
      }))
        assert.equal(params.get(key), value);
      assert.equal(options.signal, signal);
      assert.equal(params.has("sourceNames"), false);
      const index = names.indexOf(name);
      const total = index === 0 ? 63 : 58;
      const sourcePage = Number(params.get("page"));
      return Response.json({
        rows: Array.from(
          { length: Math.max(0, Math.min(50, total - (sourcePage - 1) * 50)) },
          (_, offset) => ({
            appointmentId: `${index}-${(sourcePage - 1) * 50 + offset}`,
          }),
        ),
        pagination: { page: sourcePage, pageSize: 50, totalRecords: total, totalPages: 2 },
        summary: {
          total,
          confirmado: 1,
          asistio: index === 0 ? 32 : 29,
          cancelado: 2,
          noShow: 3,
          tasaAsistencia: 999,
        },
      });
    };
    const selected = {
      pipeline,
      setter: "Canonical label",
      booker: "",
      closer: "Closer",
      calendar: "Calendar",
      vslOrigin: "No agendado",
      dateFrom: "2026-09-01",
      status: "Asistió",
      search: "correo@example.com",
    };
    const pages = [];
    for (const page of [1, 2, 3])
      pages.push(await getAppointmentDetail(selected, page, signal, [...names, names[0]]));
    assert.deepEqual(
      pages.map((page) => page.rows.length),
      [50, 50, 21],
    );
    const ids = pages.flatMap((page) => page.rows.map((row) => row.appointmentId));
    assert.equal(new Set(ids).size, 121);
    assert.equal(ids[62], "0-62");
    assert.equal(ids[63], "1-0");
    assert.equal(ids[120], "1-57");
    assert.equal(pages[1].pagination.totalRecords, 121);
    assert.equal(pages[1].pagination.page, 2);
    assert.equal(pages[1].pagination.totalPages, 3);
    assert.equal(pages[1].summary.total, 121);
    assert.equal(pages[1].summary.asistio, 61);
    assert.equal(pages[1].summary.tasaAsistencia, 50.41);
    assert.ok(calls.every((call) => Number(call.page) <= 2));
    assert.equal(calls.length, 8);
  }
});

test("single source uses original name and empty or failed merged details remain controlled", async (t) => {
  const saved = global.fetch;
  t.after(() => {
    global.fetch = saved;
  });
  const emptyResponse = {
    rows: [],
    pagination: { page: 1, pageSize: 50, totalRecords: 0, totalPages: 0 },
    summary: { total: 0, confirmado: 0, asistio: 0, cancelado: 0, noShow: 0, tasaAsistencia: 0 },
  };
  global.fetch = async (url) => {
    assert.equal(new URL(url, "http://local").searchParams.get("setter"), "Jose Luis");
    return Response.json(emptyResponse);
  };
  const empty = await getAppointmentDetail(
    { pipeline: "vsl", setter: "Jose Luis Botto Garcia" },
    1,
    undefined,
    ["Jose Luis"],
  );
  assert.equal(empty.rows.length, 0);
  global.fetch = async () => Response.json(emptyResponse);
  const mergedEmpty = await getAppointmentDetail({ pipeline: "vsl" }, 1, undefined, [
    "Jose Luis",
    "Jose Luis Botto Garcia",
  ]);
  assert.equal(mergedEmpty.pagination.totalRecords, 0);
  assert.equal(mergedEmpty.summary.tasaAsistencia, 0);
  global.fetch = async () => Response.json({ ok: false, message: "Detalle no disponible" });
  await assert.rejects(
    getAppointmentDetail({ pipeline: "vsl" }, 1, undefined, [
      "Jose Luis",
      "Jose Luis Botto Garcia",
    ]),
    /Detalle no disponible/,
  );
});
