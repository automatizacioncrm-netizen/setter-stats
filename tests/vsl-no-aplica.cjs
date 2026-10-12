const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const source = fs.readFileSync("apps-script/10_API.gs", "utf8");
const c = vm.createContext({});
vm.runInContext(source, c);
const plain = (value) => JSON.parse(JSON.stringify(value));
const stageFields = (records) => {
  const stages = c.API_OPPORTUNITY_STAGES_(records);
  return plain({ etapasPorEmbudo: stages, vslNoAplica: c.API_VSL_NO_APLICA_(stages) });
};
const exportsTs = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync("src/server/mappers/vsl-no-aplica.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  { exports: exportsTs, require },
);
const phase = "No Aplica(No califica/No desea)";
test("Opportunity phase aggregation is exact, VSL only, normalized, deduplicated and independent of appointment states", () => {
  const result = stageFields([
    { opportunityId: "v1", pipeline: "vsl", fase: phase },
    { opportunityId: "v1", pipeline: "vsl", fase: phase },
    { opportunityId: "v2", pipeline: "vsl", fase: "  NO APLICA ( No califica / No desea )  " },
    { opportunityId: "v3", pipeline: "vsl", fase: "No Aplica(Otro)", estadoCita: phase },
    { opportunityId: "v4", pipeline: "vsl", fase: "Nuevo", estadoCita: phase },
    { opportunityId: "o1", pipeline: "oei", fase: phase },
    { opportunityId: "l1", pipeline: "lig", fase: phase },
  ]);
  assert.equal(result.vslNoAplica.total, 2);
  assert.equal(result.vslNoAplica.porcentaje, 50);
  assert.deepEqual(
    result.vslNoAplica,
    result.etapasPorEmbudo.porEmbudo.vsl.porEtapa.find((r) => r.fase === phase),
  );
  assert.equal(stageFields([]).vslNoAplica.total, 0);
});
test("real response reuses existing seteo phase counts and preserves seteo reconciliation", () => {
  const actual = JSON.parse(fs.readFileSync("docs/vsl-no-aplica-real-response.json", "utf8"));
  const seteo = { ...actual.vslSeteo, porEtapa: actual.etapasPorEmbudo.porEmbudo.vsl.porEtapa };
  const before = JSON.stringify(seteo);
  const result = plain(exportsTs.noAplicaFields({ vslSeteo: seteo }));
  assert.deepEqual(result.vslNoAplica, { fase: phase, total: 5, porcentaje: 3.88 });
  assert.equal(
    result.vslNoAplica.total,
    result.etapasPorEmbudo.porEmbudo.vsl.porEtapa.find((r) => r.fase === phase).total,
  );
  assert.equal(seteo.totalLeadsVsl, seteo.seteados + seteo.faltanSetear);
  assert.equal(JSON.stringify(seteo), before);
  assert.throws(
    () =>
      exportsTs.noAplicaFields({
        ...result,
        vslNoAplica: { fase: phase, total: 6, porcentaje: 3.88 },
      }),
    /no coincide/,
  );
  assert.deepEqual(plain(exportsTs.noAplicaFields({})), {});
});
