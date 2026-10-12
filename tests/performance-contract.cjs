const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const path = require("node:path");
const Module = require("node:module");
require.extensions[".ts"] = require.extensions[".tsx"] = (m, filename) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    filename,
    "commonjs",
  );
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return resolve.call(
    this,
    name.startsWith("@/") ? path.resolve("src", name.slice(2)) : name,
    ...args,
  );
};
const { mapPerformance } = require("../src/server/mappers/performance.mapper.ts");
const { mapVslReportResponse } = require("../src/server/mappers/vsl-response.mapper.ts");
const { ExecutivePerformance } = require("../src/components/reports/ExecutivePerformance.tsx");
const { DashboardFilters } = require("../src/components/reports/DashboardFilters.tsx");
const { renderToStaticMarkup } = require("react-dom/server");
const { createElement } = require("react");
const { getVslClosersReport } = require("../src/services/reports.ts");

const fixture = () => ({
  conversionPorCloser: [
    { closer: "Fiorela Bernales", citasAsistidas: 2, ventas: 2, conversionPct: 100 },
  ],
  asistenciaPorSetter: [
    { setter: "Evelyn", agendamientos: 4, citasAsistidas: 3, asistenciaPct: 75 },
  ],
  asistenciaPorCloserTodosEmbudos: [
    { closer: "Fiorela Bernales", agendamientos: 4, citasAsistidas: 3, asistenciaPct: 75 },
  ],
  alcanceAsistencia: "vsl+oei+lig",
  alcanceConversionCloser: "vsl+oei+lig",
  diagnostics: {
    citasLigIncluidasSoloEnActividad: 0,
    citasUnicasActividad: 4,
    ventasSinCitaAsistida: 1,
    ventasAtribucionAmbigua: 0,
    ventasUnicas: 3,
    citasAsistidasUnicas: 2,
  },
});
const rows = [
  { pipeline: "vsl", opportunityId: "vsl-1" },
  { pipeline: "vsl", opportunityId: "vsl-2" },
  { pipeline: "oei", opportunityId: "oei-1" },
];
const query = {
  pipeline: "all",
  includeDetail: false,
  pageSize: 25,
  sort: "nombreContacto",
  direction: "asc",
};
const mapped = (performance = fixture()) =>
  mapVslReportResponse({ ok: true, data: { sales: { total: 3, rows }, performance } }, query);
const html = (report) => renderToStaticMarkup(createElement(ExecutivePerformance, { report }));

test("closer full join matches normalized names rather than positions, preserves old ratios and both unilateral sources", () => {
  const { joinCloserPerformance } = require("../src/lib/closer-performance.ts");
  const { ratio } = require("../src/lib/executive-metrics.ts");
  const attendance = [{closer:"Fiorela Bernales",agendamientos:117,citasAsistidas:44},
    {closer:"Ezequiel Dario",agendamientos:168,citasAsistidas:82},
    {closer:"Only attendance",agendamientos:10,citasAsistidas:5}];
  const conversion = [{closer:"  EZEQUIEL  DARÍO  ",ventas:4,citasAsistidas:82},
    {closer:"Fiorela Bernales",ventas:6,citasAsistidas:44},
    {closer:"Only conversion",ventas:1,citasAsistidas:2}];
  const before = JSON.stringify({attendance,conversion});
  const result = joinCloserPerformance(attendance,conversion);
  assert.equal(result.length,4);
  for (const original of attendance.slice(0,2)) {
    const row = result.find(r=>r.closer===original.closer);
    assert.equal(row.agendamientos,original.agendamientos);
    assert.equal(row.citasAsistidas,original.citasAsistidas);
    assert.equal(row.asistenciaPct,ratio(original.citasAsistidas,original.agendamientos));
    const source = original.closer.startsWith("Fiorela") ? conversion[1] : conversion[0];
    assert.equal(row.ventas,source.ventas);
    assert.equal(row.conversionPct,ratio(source.ventas,source.citasAsistidas));
  }
  const attendanceOnly = result.find(r=>r.closer==="Only attendance");
  assert.equal(attendanceOnly.ventas,0);
  assert.equal(attendanceOnly.conversionPct,0);
  const conversionOnly = result.find(r=>r.closer==="Only conversion");
  assert.equal(conversionOnly.agendamientos,null);
  assert.equal(conversionOnly.asistenciaPct,null);
  assert.equal(conversionOnly.citasAsistidas,2);
  assert.equal(conversionOnly.ventas,1);
  assert.equal(conversionOnly.conversionPct,50);
  // Different source denominators must not change the existing conversion percentage.
  const inconsistent = joinCloserPerformance([attendance[0]],[{...conversion[1],citasAsistidas:20}])[0];
  assert.equal(inconsistent.citasAsistidas,44);
  assert.equal(inconsistent.conversionPct,30);
  assert.equal(JSON.stringify({attendance,conversion}),before);
});

test("one closer performance table renders all six sortable columns and attribution diagnostics across funnels",()=>{
  for(const pipeline of ["vsl","oei","lig","all"]) {
    const r = mapped();
    r.filters.pipeline = pipeline;
    const scope = pipeline==="all" ? "vsl+oei+lig" : pipeline;
    r.performance.alcanceAsistencia = scope;
    r.performance.alcanceConversionCloser = scope;
    const output = html(r);
    assert.match(output,/Desempeño comercial por closer/);
    assert.doesNotMatch(output,/Conversión de ventas por closer|Agendamientos y asistencia por closer/);
    const section = output.match(/aria-labelledby="closer-performance-heading"([\s\S]*?)<\/section>/)[1];
    const labels=[...section.matchAll(/<button[^>]*>([^<]+)<svg/g)].map(m=>m[1]);
    assert.deepEqual(labels,["Closer","Citas asignadas","Citas asistidas","% Asistencia","Ventas verificadas","% Conversión"]);
    assert.equal((section.match(/<table /g)||[]).length,1);
    assert.match(section,/overflow-x-auto/);
    assert.match(section,/<details[\s\S]*Diagnóstico de atribución y alcance/);
    assert.match(section,/ventas sin atribución verificable, conservadas en el total/);
  }
});

test("proxy preserves all actual performance properties and commercial sales without LIG", () => {
  const report = mapped();
  assert.deepEqual(report.performance, fixture());
  assert.equal(report.sales.total, 3);
  assert.ok(report.sales.rows.every((r) => r.pipeline !== "lig"));
});
test("all accepts LIG commercial sales and preserves businessMetrics", () => {
  const report = mapVslReportResponse(
    {
      ok: true,
      data: {
        sales: { total: 4, rows: [...rows, { pipeline: "lig" }] },
        businessMetrics: {
          conversionPorEmbudo: [{ pipeline: "lig", leads: 1, ventas: 1, conversionPct: 100 }],
        },
        performance: fixture(),
      },
    },
    query,
  );
  assert.equal(report.sales.rows.at(-1).pipeline, "lig");
  assert.equal(report.businessMetrics.conversionPorEmbudo[0].ventas, 1);
});
test("activity includes LIG but commercial conversion uses its separate denominator", () => {
  const report = mapped();
  const output = html(report);
  assert.equal(report.performance.asistenciaPorSetter[0].agendamientos, 4);
  assert.equal(report.performance.asistenciaPorCloserTodosEmbudos[0].citasAsistidas, 3);
  assert.equal(report.performance.conversionPorCloser[0].citasAsistidas, 2);
  assert.match(output, /100.00 %/);
  assert.match(output, /75.00 %/);
  assert.match(output, /Vista general: incluye citas de VSL, OEI y LIG/);
});
test("unattributed sales remain in commercial totals and separate diagnostics", () => {
  const report = mapped();
  const p = report.performance;
  assert.equal(
    p.conversionPorCloser.reduce((n, r) => n + r.ventas, 0) +
      p.diagnostics.ventasSinCitaAsistida +
      p.diagnostics.ventasAtribucionAmbigua,
    report.sales.total,
  );
  assert.match(html(report), /1 ventas sin atribución verificable/);
});
test("ambiguous closer attribution is preserved without arbitrary reassignment", () => {
  const p = fixture();
  p.diagnostics.ventasSinCitaAsistida = 0;
  p.diagnostics.ventasAtribucionAmbigua = 1;
  const report = mapped(p);
  assert.equal(report.performance.conversionPorCloser[0].ventas, 2);
  assert.match(html(report), /Atribución ambigua: 1/);
});
test("incomplete and invalid performance never become zero counts or perpetual loading", () => {
  for (const p of [undefined, {}, { ...fixture(), asistenciaPorSetter: undefined }]) {
    const result = mapPerformance(p);
    assert.equal(result.performance, undefined);
    assert.ok(result.performanceError);
    const output = html({ filters: { pipeline: "all" }, ...result });
    assert.match(output, /role="alert"/);
    assert.doesNotMatch(output, /Cargando el conjunto completo/);
  }
});
test("empty but complete aggregates render a real empty state", () => {
  const p = {
    ...fixture(),
    conversionPorCloser: [],
    asistenciaPorSetter: [],
    asistenciaPorCloserTodosEmbudos: [],
    diagnostics: {
      citasUnicasActividad: 0,
      ventasUnicas: 0,
      ventasSinCitaAsistida: 0,
      ventasAtribucionAmbigua: 0,
    },
  };
  const parsed = mapPerformance(p);
  assert.ok(parsed.performance);
  const output = html({ filters: { pipeline: "all" }, ...parsed });
  assert.doesNotMatch(output, /Alvaro Jesus Paniura Marin/);
  assert.match(output, /No hay agendamientos para estos filtros/);
});
test("attendance invariant rejects attended greater than assigned", () => {
  const p = fixture();
  p.asistenciaPorSetter[0].citasAsistidas = 5;
  assert.ok(mapPerformance(p).performanceError);
});
test("sales invariant and activity totals reject mismatched aggregates", () => {
  const p = fixture();
  p.diagnostics.ventasUnicas = 99;
  assert.ok(mapPerformance(p).performanceError);
  const next = fixture();
  next.diagnostics.citasUnicasActividad = 99;
  assert.ok(mapPerformance(next).performanceError);
});
test("zero denominators and unknown metrics do not produce misleading rates", () => {
  const p = fixture();
  p.conversionPorCloser[0].citasAsistidas = 0;
  assert.match(html(mapped(p)), /No aplicable/);
});
test("selected funnel scopes cannot accidentally render global activity or LIG conversion", () => {
  for (const pipeline of ["vsl", "oei"]) {
    const report = mapped();
    report.filters.pipeline = pipeline;
    assert.match(html(report), /El alcance recibido no corresponde/);
    report.performance.alcanceAsistencia = pipeline;
    report.performance.alcanceConversionCloser = pipeline;
    assert.doesNotMatch(html(report), /El alcance recibido no corresponde|Vista general: incluye/);
  }
});
test("commercial selector offers all, vsl, oei and lig", () => {
  const output = renderToStaticMarkup(
    createElement(DashboardFilters, {
      filters: { pipeline: "all", preset: "todos", leadType: "all" },
      setters: [],
      bookers: [],
      closers: [],
      origins: [],
      calendars: [],
      statuses: [],
      onChange() {},
      onPreset() {},
      onClear() {},
    }),
  );
  const selector = output.match(/<select aria-label="Embudo"[\s\S]*?<\/select>/)[0];
  assert.deepEqual(
    [...selector.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]),
    ["all", "vsl", "oei", "lig"],
  );
  assert.match(selector, /Todos \(VSL \+ OEI \+ LIG\)/);
});
test("filter changes and combined filters use the same report request, without extra detail downloads", async (t) => {
  const saved = global.fetch;
  t.after(() => (global.fetch = saved));
  let calls = 0;
  for (const pipeline of ["all", "vsl", "oei"]) {
    global.fetch = async (url) => {
      calls++;
      const p = new URL(url, "http://local").searchParams;
      assert.equal(p.get("pipeline"), pipeline);
      assert.equal(p.get("closer"), "Fiorela Bernales");
      assert.equal(p.get("dateFrom"), "2026-09-01");
      assert.equal(p.get("action"), null);
      return Response.json(mapped());
    };
    const report = await getVslClosersReport(
      {
        pipeline,
        closer: "Fiorela Bernales",
        dateFrom: "2026-09-01",
        dateTo: "2026-09-30",
        setter: "",
        booker: "Evelyn",
      },
      { includeDetail: false },
    );
    html(report);
  }
  assert.equal(calls, 3);
});
test("technical formulas stay in tooltips and attribution diagnostics, not loading text", () => {
  const output = html(mapped());
  assert.match(output, /title="Ventas atribuibles/);
  assert.match(output, /Diagnóstico de atribución y alcance/);
  assert.doesNotMatch(
    output,
    /Atribución efectiva del reporte|Citas únicas por Appointment ID|Cargando el conjunto completo/,
  );
});

test("consolidated closer table keeps present team members while setter rows come from current API activity", () => {
  const p = fixture();
  p.conversionPorCloser.push({
    closer: "Cinthia Maquito",
    citasAsistidas: 1,
    ventas: 1,
    conversionPct: 100,
  });
  p.diagnostics.ventasSinCitaAsistida = 0;
  p.asistenciaPorSetter.push({
    setter: "Joseph",
    agendamientos: 2,
    citasAsistidas: 1,
    asistenciaPct: 50,
  });
  p.diagnostics.citasUnicasActividad = 6;
  const report = mapped(p);
  const output = html(report);
  const bodies = [...output.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)].map((m) => m[1]);
  assert.deepEqual(
    bodies.map((body) => (body.match(/<tr /g) || []).length),
    [1, 1],
  );
  assert.doesNotMatch(output, />Joseph</);
  assert.match(output, /Ventas de otros responsables: 1/);
  assert.match(output, /Citas fuera del equipo de setters: 2/);
  assert.equal(report.sales.total, 3);
  assert.equal(report.performance.diagnostics.citasUnicasActividad, 6);
});

test("setter table dynamically shows only positive bookings for each result, including future funnels", () => {
  const names = [
    "Alvaro Jesus Paniura Marin",
    "Jose Luis Botto Garcia",
    "Claudia Jimena Ocampo Portilla",
  ];
  const aliases = ["Alvaro", "Jose Luis", "Jimena"];
  for (const [pipeline, counts] of [
    ["vsl", [25, 0, 0]],
    ["oei", [0, 0, 14]],
    ["lig", [0, 8, 0]],
    ["all", [25, 8, 14]],
    ["future-funnel", [0, "3", 0]],
    ["empty-funnel", [0, 0, 0]],
  ]) {
    const report = mapped();
    report.filters.pipeline = pipeline;
    const scope = pipeline === "all" ? "vsl+oei+lig" : pipeline;
    report.performance.alcanceAsistencia = scope;
    report.performance.alcanceConversionCloser = scope;
    report.performance.asistenciaPorSetter = counts.map((agendamientos, index) => ({
      setter: aliases[index],
      agendamientos,
      citasAsistidas: 0,
      asistenciaPct: 0,
    }));
    report.performance.asistenciaPorSetter.push({
      setter: "Kiara Villadolid Huamantumba",
      agendamientos: -1,
      citasAsistidas: 0,
      asistenciaPct: 0,
    });
    for (const setter of [
      "Amaranta Alfonso Krasnova",
      "Sin setter identificado",
      "Otro responsable",
    ]) {
      report.performance.asistenciaPorSetter.push({
        setter,
        agendamientos: 7,
        citasAsistidas: 1,
        asistenciaPct: 14.29,
      });
    }
    const before = JSON.stringify(report);
    const output = renderToStaticMarkup(
      createElement(ExecutivePerformance, { report, selectedSetter: "Setter ausente" }),
    );
    const section = output.match(
      /aria-labelledby="setter-attendance-heading"([\s\S]*?)<\/section>/,
    )[1];
    counts.forEach((count, index) => {
      const pattern = new RegExp(`>${names[index]}<`);
      Number(count) > 0 ? assert.match(section, pattern) : assert.doesNotMatch(section, pattern);
    });
    assert.doesNotMatch(
      section,
      />Kiara Villadolid Huamantumba<|>Amaranta Alfonso Krasnova<|>Sin setter identificado<|>Otro responsable</,
    );
    if (counts.every((count) => Number(count) <= 0))
      assert.match(section, /No hay agendamientos para estos filtros/);
    assert.equal(JSON.stringify(report), before);
  }
});
test("confirmed aliases merge into canonical IDs and unknown IDs never map to team", () => {
  const {
    REPORT_SETTERS,
    resolveTeamMember,
    teamPerformanceRows,
  } = require("../src/lib/report-team.ts");
  for (const [alias, id] of [
    [" ÁLVARO ", "alvaro"],
    ["José", "jose"],
    ["Claudia   Jimena", "claudia"],
    ["Evelyn Lopez", "evelyn"],
    ["Kiara", "kiara"],
  ]) {
    assert.equal(resolveTeamMember(alias, REPORT_SETTERS).id, id);
  }
  for (const name of ["Joseph", "Jose otro", "Sin setter", "Jh1LDdbfRP024sF6O65a", "constructor"]) {
    assert.equal(resolveTeamMember(name, REPORT_SETTERS), null);
  }
  const rows = teamPerformanceRows(
    [
      { setter: "Jose", agendamientos: 2, citasAsistidas: 1 },
      { setter: "Jose Luis", agendamientos: 3, citasAsistidas: 2 },
    ],
    REPORT_SETTERS,
    (r) => r.setter,
    (r) => r.agendamientos,
  );
  assert.equal(rows.length, 6);
  assert.equal(rows[1].count, 5);
  assert.equal(rows[1].citasAsistidas, 3);
  assert.equal(rows[0].count, 0);
});

test("repeated API buckets are rejected instead of doubling canonical counts", () => {
  const p = fixture();
  p.conversionPorCloser.push({ ...p.conversionPorCloser[0] });
  assert.match(mapPerformance(p).performanceError, /filas repetidas/);
});
test("record-level fallback follows VSL assigned and OEI/LIG creator priority", () => {
  const { getEffectiveSetter } = require("../src/lib/report-record.ts");
  const record = { setterAsignado: "Assigned", agendadorCita: "Creator" };
  assert.equal(getEffectiveSetter({ ...record, pipeline: "vsl" }), "Assigned");
  assert.equal(getEffectiveSetter({ pipeline: "vsl", agendadorCita: "Creator" }), "Creator");
  for (const pipeline of ["oei", "lig"]) {
    assert.equal(getEffectiveSetter({ ...record, pipeline }), "Creator");
    assert.equal(getEffectiveSetter({ setterAsignado: "Assigned", pipeline }), "Assigned");
  }
});

const { ExecutiveSummary } = require("../src/components/reports/ExecutiveSummary.tsx");
const {
  LeadsWithoutAppointmentSection,
} = require("../src/components/reports/LeadsWithoutAppointmentSection.tsx");
const {
  mapLeadsWithoutAppointment,
} = require("../src/server/mappers/leads-without-appointment.mapper.ts");
const { EMPTY_REPORT_FILTERS, changeReportFilters } = require("../src/lib/report-filter-state.ts");
const { hasSelectedSetter } = require("../src/lib/executive-presentation.ts");
const unbookedFixture = () => ({
  totalLeads: 3,
  leadsConCita: 2,
  leadsSinCita: 1,
  porcentajeSinCita: 33.33,
  porcentajeConCita: 66.67,
  detalleSinCita: [
    {
      opportunityId: "unbooked-1",
      nombreContacto: "Contacto",
      fechaCreacion: "2026-10-03",
      setter: "",
      pipeline: "vsl",
    },
  ],
});
const integrated = () =>
  mapVslReportResponse(
    {
      ok: true,
      data: {
        kpis: { total: 1, asistio: 0 },
        leadTypeKpis: { totalLeads: 3 },
        sales: { total: 3, rows },
        performance: fixture(),
        leadsVslSinCita: unbookedFixture(),
        leadsSinCitaPorEmbudo: {
          vsl: unbookedFixture(),
          oei: {
            totalLeads: 2,
            leadsConCita: 2,
            leadsSinCita: 0,
            porcentajeSinCita: 0,
            porcentajeConCita: 100,
            detalleSinCita: [],
          },
        },
      },
    },
    query,
  );
const summary = (report, filters) =>
  renderToStaticMarkup(createElement(ExecutiveSummary, { report, filters }));

test("VSL executive order and labels preserve original values, hints and accent indicators", () => {
  const { executiveCards } = require("../src/lib/executive-presentation.ts");
  const { KpiCard } = require("../src/components/reports/KpiCard.tsx");
  const r = integrated();
  r.vslSeteo = { seteados: 773, faltanSetear: 552, seteadosPct: 58.34, faltanSetearPct: 41.66 };
  r.vslNoAplica = { fase: "No Aplica(No califica/No desea)", total: 139, porcentaje: 10.49 };
  r.kpis.asistio = 466;
  r.kpis.tasaAsistencia = 40.77;
  r.sales.total = 45;
  r.leadTypeKpis.totalLeads = 1325;
  const before = JSON.stringify(r);
  const baseline = executiveCards(r, false);
  const output = summary(r, { ...EMPTY_REPORT_FILTERS, pipeline: "vsl" });
  const labels = ["Total de leads", "Leads seteados", "Leads asistidos", "Total de ventas", "No calificados", "Leads pendientes de seteo"];
  for (let index = 1; index < labels.length; index++)
    assert.ok(output.indexOf(labels[index - 1]) < output.indexOf(labels[index]));
  for (const card of baseline.filter(card => card.label !== "Total de agendamientos")) {
    const expected = { ...card, label: card.label === "Asistió" ? "Leads asistidos" : card.label };
    assert.ok(output.includes(renderToStaticMarkup(createElement(KpiCard, expected))));
  }
  for (const props of [{label:"Leads seteados",value:773,hint:"58.34% de los leads VSL"},
    {label:"Leads pendientes de seteo",value:552,hint:"41.66% de los leads VSL"},
    {label:"No calificados",value:139,hint:"10.49% de los leads VSL"}])
    assert.ok(output.includes(renderToStaticMarkup(createElement(KpiCard,props))));
  for (const pipeline of ["oei", "lig", "all"]) {
    const other = summary(r, { ...EMPTY_REPORT_FILTERS, pipeline });
    for (const card of baseline)
      assert.ok(other.includes(renderToStaticMarkup(createElement(KpiCard,card))));
    assert.doesNotMatch(other,/Leads asistidos|No calificados/);
  }
  assert.equal(JSON.stringify(r), before);
});

test("No calificados follows sales in VSL only, remains safe when missing and refreshed from API", () => {
  const r = integrated();
  r.vslNoAplica = { fase: "No Aplica(No califica/No desea)", total: 5, porcentaje: 3.88 };
  const output = summary(r, { ...EMPTY_REPORT_FILTERS, pipeline: "vsl" });
  assert.match(output, /Leads asistidos[\s\S]*Total de ventas[\s\S]*No calificados[\s\S]*Leads pendientes de seteo/);
  assert.match(output, /No calificados[\s\S]*?>5<.*?3.88% de los leads VSL/);
  for (const pipeline of ["oei", "lig", "all"])
    assert.doesNotMatch(summary(r, {...EMPTY_REPORT_FILTERS,pipeline}), /No calificados|Leads asistidos/);
  delete r.vslNoAplica;
  assert.match(summary(r, {...EMPTY_REPORT_FILTERS,pipeline:"vsl"}), /No calificados[\s\S]*?>—</);
  const direct = { fase: "No Aplica(No califica/No desea)", total: 1, porcentaje: 25 };
  const fresh = mapVslReportResponse({ok:true,data:{vslNoAplica:direct}}, {...query,pipeline:"vsl",setter:"Evelyn Lopez Horna",dateFrom:"2026-09-01",dateTo:"2026-09-30"});
  assert.deepEqual(fresh.vslNoAplica,direct);
  assert.match(summary(fresh,{...EMPTY_REPORT_FILTERS,pipeline:"vsl",setter:"Evelyn Lopez Horna"}),/No calificados[\s\S]*?>1<.*?25.00%/);
  const { mergeFilteredReports } = require("../src/lib/merge-filtered-reports.ts");
  assert.equal(mergeFilteredReports([fresh,fresh],EMPTY_REPORT_FILTERS).vslNoAplica,undefined);
});

test("VSL replaces only bookings using API seteo counts and percentages; other funnels keep cards", () => {
  const seteo = {
    aplicaSoloA: "vsl",
    totalLeadsVsl: 129,
    seteados: 79,
    faltanSetear: 50,
    seteadosPct: 61.24,
    faltanSetearPct: 38.76,
    porEtapa: [{ fase: "Lead Pendiente de Agenda", total: 50 }, { fase: "Lead Seteado/Reageanda", total: 79 }],
    seteadosRows: [],
  };
  const r = integrated();
  const mappedSeteo = mapVslReportResponse({ ok: true, data: { vslSeteo: seteo } }, query);
  assert.deepEqual(mappedSeteo.vslSeteo, seteo);
  r.vslSeteo = mappedSeteo.vslSeteo;
  const before = JSON.stringify(r);
  const output = summary(r, { ...EMPTY_REPORT_FILTERS, pipeline: "vsl" });
  assert.equal((output.match(/text-3xl/g) || []).length, 6);
  assert.match(output, /2xl:grid-cols-6/);
  assert.doesNotMatch(output, /Total de agendamientos/);
  assert.match(output, /Leads seteados[\s\S]*?>79<.*?61.24% de los leads VSL/);
  assert.match(output, /Leads pendientes de seteo[\s\S]*?>50<.*?38.76% de los leads VSL/);
  assert.match(output, /Total de leads[\s\S]*?>3</);
  assert.match(output, /Leads asistidos[\s\S]*?>0</);
  assert.match(output, /Total de ventas[\s\S]*?>3</);
  for (const pipeline of ["oei", "lig", "all", "future-funnel"]) {
    const other = summary(r, { ...EMPTY_REPORT_FILTERS, pipeline });
    assert.equal((other.match(/text-3xl/g) || []).length, 4);
    assert.match(other, /Total de agendamientos/);
    assert.doesNotMatch(other, /Leads seteados|Leads pendientes de seteo/);
  }
  r.vslSeteo = {
    ...seteo,
    seteados: 7,
    faltanSetear: 5,
    seteadosPct: 12.34,
    faltanSetearPct: 56.78,
  };
  const refreshed = summary(r, {
    ...EMPTY_REPORT_FILTERS,
    pipeline: "vsl",
    dateFrom: "2026-10-01",
    dateTo: "2026-10-31",
  });
  assert.match(refreshed, /Leads seteados[\s\S]*?>7<.*?12.34%/);
  assert.match(refreshed, /Leads pendientes de seteo[\s\S]*?>5<.*?56.78%/);
  // Percentages above deliberately disagree with the counts: frontend must not recompute them.
  r.vslSeteo = seteo;
  assert.equal(JSON.stringify(r), before);
});

test("missing VSL seteo uses dashes and never invents zero; API zero remains zero", () => {
  const r = integrated();
  const missing = summary(r, { ...EMPTY_REPORT_FILTERS, pipeline: "vsl" });
  assert.match(missing, /Leads seteados[\s\S]*?>—</);
  assert.match(missing, /Leads pendientes de seteo[\s\S]*?>—</);
  assert.doesNotMatch(missing, /% de los leads VSL/);
  r.vslSeteo = { seteados: 0, faltanSetear: 0, seteadosPct: 0, faltanSetearPct: 0 };
  assert.match(
    summary(r, { ...EMPTY_REPORT_FILTERS, pipeline: "vsl" }),
    /Leads seteados[\s\S]*?>0<.*?0% de los leads VSL/,
  );
});

test("missing seteo warns only for VSL and merged sources do not reuse one source's classification", () => {
  const exports = {};
  const warnings = [];
  const code = ts.transpileModule(
    fs.readFileSync("src/components/reports/ExecutiveSummary.tsx", "utf8"),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    },
  ).outputText;
  require("node:vm").runInNewContext(code, {
    exports,
    console: { warn: (...args) => warnings.push(args) },
    require: (name) =>
      name === "react"
        ? { ...require("react"), useEffect: (fn) => fn() }
        : name === "./KpiCard"
          ? require("../src/components/reports/KpiCard.tsx")
          : require(name),
  });
  const report = integrated();
  for (const pipeline of ["oei", "lig", "all"])
    exports.ExecutiveSummary({ report, filters: { ...EMPTY_REPORT_FILTERS, pipeline } });
  assert.equal(warnings.length, 0);
  exports.ExecutiveSummary({ report, filters: { ...EMPTY_REPORT_FILTERS, pipeline: "vsl" } });
  assert.equal(warnings.length, 2);
  assert.ok(warnings.some(([message]) => /data.vslSeteo/.test(message)));
  assert.ok(warnings.some(([message]) => /data.vslNoAplica/.test(message)));
  report.vslSeteo = { seteados: 7, faltanSetear: 5 };
  report.vslNoAplica = { fase: "No Aplica(No califica/No desea)", total: 2, porcentaje: 16.67 };
  exports.ExecutiveSummary({ report, filters: { ...EMPTY_REPORT_FILTERS, pipeline: "vsl" } });
  assert.equal(warnings.length, 2);
  const { mergeFilteredReports } = require("../src/lib/merge-filtered-reports.ts");
  assert.deepEqual(mergeFilteredReports([report], EMPTY_REPORT_FILTERS).vslSeteo, report.vslSeteo);
  assert.equal(mergeFilteredReports([report, report], EMPTY_REPORT_FILTERS).vslSeteo, undefined);
});

test("all setters show four cards and VSL historical lead summary from actual contract", () => {
  const r = integrated();
  const output = summary(r, EMPTY_REPORT_FILTERS);
  assert.equal((output.match(/text-3xl/g) || []).length, 4);
  assert.match(output, /Total de leads/);
  assert.match(output, /lg:grid-cols-4/);
  const section = renderToStaticMarkup(
    createElement(LeadsWithoutAppointmentSection, { report: r }),
  );
  assert.match(section, /Leads VSL sin cita creada/);
  assert.match(section, /33.33 %/);
  assert.match(section, /unbooked-1/);
  assert.equal(r.leadsSinCitaPorEmbudo.vsl.totalLeads, 3);
  assert.equal(r.kpis.total, 1);
});
test("setter selections preserve existing cards with the VSL booking replacement", () => {
  const r = integrated();
  for (const pipeline of ["all", "vsl", "oei"])
    for (const name of ["Alvaro Jesus Paniura Marin", "Cinthia Maquito"]) {
      const filters = {
        ...EMPTY_REPORT_FILTERS,
        pipeline,
        dateFrom: "2026-10-01",
        dateTo: "2026-10-10",
        closer: "Ezequiel Dario",
        ...(pipeline === "oei" ? { booker: name } : { setter: name }),
      };
      const output = summary(r, filters);
      assert.equal((output.match(/text-3xl/g) || []).length, pipeline === "vsl" ? 5 : 3);
      assert.doesNotMatch(output, /Total de leads/);
      assert.match(output, pipeline === "vsl" ? /2xl:grid-cols-5/ : /sm:grid-cols-3/);
      assert.match(output, /Total de ventas/);
      assert.equal(
        renderToStaticMarkup(
          createElement(LeadsWithoutAppointmentSection, { report: { ...r, filters } }),
        ),
        "",
      );
      const executive = renderToStaticMarkup(
        createElement(ExecutivePerformance, {
          report: r,
          setterSelected: hasSelectedSetter(filters),
        }),
      );
      assert.doesNotMatch(executive, /sin cita creada|Detalle de disponibilidad/);
      assert.match(executive, /Conversion de Asistencia por Setter/);
      assert.equal(filters.dateFrom, "2026-10-01");
      assert.equal(filters.closer, "Ezequiel Dario");
    }
});
test("clearing VSL setter restores six cards and unbooked, preserving period and closer", () => {
  const filters = {
    ...EMPTY_REPORT_FILTERS,
    pipeline: "vsl",
    dateFrom: "2026-10-01",
    dateTo: "2026-10-10",
    closer: "Ezequiel Dario",
  };
  const selected = changeReportFilters(filters, { setter: "Cinthia Maquito" });
  assert.equal(selected.dateTo, filters.dateTo);
  assert.equal(selected.closer, filters.closer);
  assert.ok(hasSelectedSetter(selected));
  const cleared = changeReportFilters(selected, { setter: "", booker: "" });
  assert.equal(hasSelectedSetter(cleared), false);
  assert.equal((summary(integrated(), cleared).match(/text-3xl/g) || []).length, 6);
  assert.match(
    renderToStaticMarkup(
      createElement(LeadsWithoutAppointmentSection, {
        report: { ...integrated(), filters: cleared },
      }),
    ),
    /Leads VSL/,
  );
});
test("OEI uses only verified OEI summary and absent contract shows availability, not false zeros", () => {
  const r = integrated();
  r.filters.pipeline = "oei";
  const output = renderToStaticMarkup(createElement(LeadsWithoutAppointmentSection, { report: r }));
  assert.match(output, /Leads OEI sin cita creada/);
  assert.match(output, /100.00 %/);
  assert.doesNotMatch(output, /unbooked-1/);
  delete r.leadsSinCitaPorEmbudo;
  assert.match(
    renderToStaticMarkup(createElement(LeadsWithoutAppointmentSection, { report: r })),
    /La API no entrega este indicador/,
  );
});
test("unbooked contract rejects malformed and repeated records and inconsistent percentages", () => {
  assert.ok(mapLeadsWithoutAppointment(undefined).error);
  assert.ok(mapLeadsWithoutAppointment({}).error);
  assert.ok(mapLeadsWithoutAppointment({ ...unbookedFixture(), totalLeads: 9 }).error);
  assert.ok(mapLeadsWithoutAppointment({ ...unbookedFixture(), porcentajeSinCita: 99 }).error);
  assert.ok(
    mapLeadsWithoutAppointment({
      ...unbookedFixture(),
      detalleSinCita: [unbookedFixture().detalleSinCita[0], unbookedFixture().detalleSinCita[0]],
    }).error,
  );
  assert.equal(
    mapLeadsWithoutAppointment({
      totalLeads: 0,
      leadsConCita: 0,
      leadsSinCita: 0,
      detalleSinCita: [],
    }).data.totalLeads,
    0,
  );
});
test("historical sale remains attributed by API despite meeting outside reporting month", () => {
  const p = fixture();
  p.conversionPorCloser[0].closer = "Ezequiel Dario";
  const r = mapVslReportResponse(
    {
      ok: true,
      data: {
        sales: {
          total: 3,
          rows: [
            {
              pipeline: "vsl",
              nombreContacto: "Veronica",
              closerCita: "Ezequiel Dario",
              fechaVenta: "2026-10-05",
              fechaReunion: "2026-09-11",
            },
            ...rows.slice(1),
          ],
        },
        performance: p,
      },
    },
    { ...query, dateFrom: "2026-10-01", dateTo: "2026-10-10" },
  );
  assert.equal(r.sales.rows[0].fechaVenta, "2026-10-05");
  assert.equal(r.sales.rows[0].fechaReunion, "2026-09-11");
  assert.equal(r.performance.conversionPorCloser[0].ventas, 2);
  assert.match(html(r), /Ezequiel Dario<\/td><td[^>]*>—<\/td><td[^>]*>2<\/td><td[^>]*>No aplicable<\/td><td[^>]*>2/);
});

test("missing executive metrics are unavailable rather than fabricated zero counts", () => {
  const r = mapVslReportResponse({ ok: true, data: {} }, query);
  const output = summary(r, EMPTY_REPORT_FILTERS);
  assert.equal((output.match(/>No disponible</g) || []).length, 4);
  assert.doesNotMatch(output, /0% de asistencia/);
});
test("unbooked details cannot mix VSL, OEI or LIG and partial details preserve API totals", () => {
  assert.ok(
    mapLeadsWithoutAppointment({
      ...unbookedFixture(),
      detalleSinCita: [{ ...unbookedFixture().detalleSinCita[0], pipeline: "oei" }],
    }).error,
  );
  const partial = { ...unbookedFixture(), detalleSinCita: [] };
  assert.equal(mapLeadsWithoutAppointment(partial).data.leadsSinCita, 1);
});

const { calendarPresentation } = require("../src/lib/calendar-presentation.ts");
const { getVisibleSetterRows, getSetterChartRows } = require("../src/lib/setter-performance.ts");
const calendarFixture = () => ({
  ...integrated(),
  filters: { ...EMPTY_REPORT_FILTERS, pipeline: "all" },
  kpis: {
    total: 147,
    confirmado: 32,
    asistio: 75,
    cancelado: 21,
    noShow: 19,
    agendadoCRM: 0,
    pendienteAgenda: 0,
    reagendado: 0,
    tasaAsistencia: 51.02,
    tasaNoShow: 12.93,
    totalLeads: 99,
    conEstadoAgenda: 147,
  },
  setters: [
    {
      setter: "Cinthia Maquito",
      total: 131,
      confirmado: 28,
      asistio: 66,
      cancelado: 20,
      noShow: 17,
      agendadoCRM: 0,
      pendienteAgenda: 0,
      reagendado: 0,
    },
    {
      setter: "Jose Luis Botto Garcia",
      total: 16,
      confirmado: 4,
      asistio: 9,
      cancelado: 1,
      noShow: 2,
      agendadoCRM: 0,
      pendienteAgenda: 0,
      reagendado: 0,
    },
  ],
  performance: {
    ...fixture(),
    asistenciaPorSetter: [
      { setter: "Cinthia Maquito", agendamientos: 131, citasAsistidas: 66, asistenciaPct: 50.38 },
      {
        setter: "Jose Luis Botto Garcia",
        agendamientos: 16,
        citasAsistidas: 9,
        asistenciaPct: 56.25,
      },
    ],
    diagnostics: { citasUnicasActividad: 147 },
  },
});
test("Cinthia presentation uses only her effective API states with denominator 131, leaving commercial cards 147", () => {
  const r = calendarFixture();
  const view = calendarPresentation(r, "Cinthia Maquito");
  assert.equal(view.error, undefined);
  assert.equal(view.rows.length, 1);
  assert.equal(view.rows[0].setter, "Cinthia Maquito");
  assert.equal(view.kpis.total, 131);
  assert.equal(view.kpis.asistio, 66);
  assert.equal(view.kpis.confirmado, 28);
  assert.equal(view.kpis.cancelado, 20);
  assert.equal(view.kpis.noShow, 17);
  assert.equal(r.kpis.total, 147);
  assert.ok(Math.abs(view.kpis.tasaAsistencia - 50.381679389) < 0.0001);
  const output = renderToStaticMarkup(
    createElement(ExecutivePerformance, {
      report: r,
      selectedSetter: "Cinthia Maquito",
      setterSelected: true,
    }),
  );
  const setterSection = output.match(
    /aria-labelledby="setter-attendance-heading"([\s\S]*?)<\/section>/,
  )[1];
  assert.equal((setterSection.match(/<tbody>[\s\S]*?<\/tbody>/)[0].match(/<tr /g) || []).length, 2);
  assert.match(setterSection, /Cinthia Maquito/);
  assert.match(setterSection, /Jose Luis Botto Garcia/);
  assert.doesNotMatch(setterSection, /Alvaro Jesus/);
});
test("clearing and switching setter restore six rows and never reuse prior person's states", () => {
  const r = calendarFixture();
  assert.equal(calendarPresentation(r).rows.length, 6);
  const jose = calendarPresentation(r, "Jose Luis Botto Garcia");
  assert.equal(jose.rows.length, 1);
  assert.equal(jose.kpis.total, 16);
  assert.equal(jose.kpis.asistio, 9);
  for (const name of ["Cinthia", "Cinthia Maquito"]) {
    assert.equal(getVisibleSetterRows(r.setters, name).length, 1);
    assert.equal(getSetterChartRows(r.setters, name)[0].total, 131);
  }
  assert.equal(getVisibleSetterRows(r.setters, "Cinthia otra").length, 0);
});
test("missing LIG or unresolved effective setter states never become invented distributions", () => {
  const r = calendarFixture();
  r.performance.diagnostics.citasUnicasActividad = 237;
  assert.match(calendarPresentation(r).error, /237.*147/);
  r.performance.asistenciaPorSetter.push({
    setter: "Alvaro Jesus Paniura Marin",
    agendamientos: 48,
    citasAsistidas: 8,
    asistenciaPct: 16.67,
  });
  assert.match(calendarPresentation(r, "Alvaro Jesus Paniura Marin").error, /48.*0/);
  assert.equal(r.setters.length, 2);
});
test("selected Alvaro uses existing effective attribution without borrowing another person's counts", () => {
  const r = calendarFixture();
  r.setters.push({
    setter: "Alvaro",
    setterEfectivo: "Alvaro Jesus Paniura Marin",
    total: 1,
    confirmado: 1,
    asistio: 0,
    cancelado: 0,
    noShow: 0,
    agendadoCRM: 0,
    pendienteAgenda: 0,
    reagendado: 0,
  });
  r.performance.asistenciaPorSetter.push({
    setter: "Alvaro Jesus Paniura Marin",
    agendamientos: 1,
    citasAsistidas: 0,
    asistenciaPct: 0,
  });
  const view = calendarPresentation(r, "Alvaro Jesus Paniura Marin");
  assert.equal(view.error, undefined);
  assert.equal(view.rows.length, 1);
  assert.equal(view.kpis.total, 1);
  assert.equal(view.kpis.confirmado, 1);
  assert.equal(view.kpis.asistio, 0);
});
