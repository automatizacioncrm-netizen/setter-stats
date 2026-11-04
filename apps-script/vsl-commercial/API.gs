/**
 * API.gs - REPORTES VSL UNIFICADOS
 * Incluye el reporte original de calidad de leads y el nuevo reporte de encuestas.
 * Orígenes: VSL DATA, APPOINTMENTS_MASTER, VSL_SURVEYS_MASTER.
 * No llama a la API remota: usa datos ya sincronizados en Google Sheets.
 * Función principal: VSL_REPORTES_GENERAR_TODOS().
 * También se pueden ejecutar individualmente:
 *   VSL_CALIDAD_LEADS_GENERAR()
 *   VSL_REPORTE_ENCUESTAS_2026()
 */

/**
 * 16_VSL_CALIDAD_LEADS_REPORTE.gs
 * Lee VSL DATA y APPOINTMENTS_MASTER. Solo escribe VSL_CALIDAD_LEADS.
 * Las métricas de leads son cohortes por Creado el; las de citas por Fecha cita.
 * Requiere que ambas hojas de origen estén sincronizadas previamente.
 */
const VSL_KPI_CFG = Object.freeze({
  spreadsheetId: '1h4zBoUfJqhc40GLegkOl1vIInGBPJHY5tQjsCQwax-0',
  leadsSheet: 'VSL DATA',
  appointmentsSheet: 'APPOINTMENTS_MASTER',
  reportSheet: 'VSL_CALIDAD_LEADS',
  pipeline: 'VSL | Closers',
  calendarIds: ['pMZfD4DFxhQCJHC9zoK0', '2stEL9p5aBxmHO5N7D8m'],
  timeZone: 'America/Lima',
  periods: [
    {label: 'OCTUBRE', from: '2026-10-01', to: '2026-10-31'},
    {label: 'SEPTIEMBRE', from: '2026-09-01', to: '2026-09-30'},
    {label: 'AGOSTO', from: '2026-08-01', to: '2026-08-31'},
    {label: 'JULIO', from: '2026-07-01', to: '2026-07-31'}
  ]
});

// Solo estas fases cuentan como seteo; se usan los nombres presentes en tu data.
const VSL_KPI_SETEO_STAGES = [
  'Lead Seteado / Agendado',
  'No Asiste a la sesión',
  'Seguimiento para cierre (10 días)',
  'Compromiso de Pago',
  'Venta Confirmada / Reserva',
  'Venta Confirmada/Reserva',
  'Venta no concretada (Sin respuesta 11 días)',
  'Lead no calificado'
];

function VSL_KPI_NORMAL_(value) {
  return String(value === null || value === undefined ? '' : value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}
function VSL_KPI_DATE_(value) {
  if (value === null || value === undefined || value === '') return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return isNaN(value.getTime()) ? '' : Utilities.formatDate(value, VSL_KPI_CFG.timeZone, 'yyyy-MM-dd');
  }
  const str = String(value).trim();
  // ISO con offset o Z: respetar día calendario en Lima.
  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(str)) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? '' : Utilities.formatDate(d, VSL_KPI_CFG.timeZone, 'yyyy-MM-dd');
  }
  const iso = str.match(/^(\d{4}-\d{2}-\d{2})(?:[ T]|$)/);
  if (iso) return iso[1];
  const latam = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (latam) return latam[3] + '-' + latam[2].padStart(2, '0') + '-' + latam[1].padStart(2, '0');
  return '';
}
function VSL_KPI_IN_(date, period) { return !!date && date >= period.from && date <= period.to; }
function VSL_KPI_READ_(spreadsheet, name, required) {
  const sheet = spreadsheet.getSheetByName(name);
  if (!sheet) throw new Error('No existe la hoja de origen: ' + name);
  if (sheet.getLastRow() < 1) throw new Error('No hay encabezados en ' + name);
  const data = sheet.getDataRange().getValues();
  const headers = data.shift().map(x => String(x).trim());
  const positions = {};
  headers.forEach((h, i) => { if (h) positions[h] = i; });
  required.forEach(h => { if (positions[h] === undefined) throw new Error('Falta columna "' + h + '" en ' + name); });
  return {rows: data, col: positions, name: name};
}
function VSL_KPI_CELL_(row, source, header) {
  return source.col[header] === undefined ? '' : row[source.col[header]];
}
function VSL_KPI_STATUS_(value) {
  const s = VSL_KPI_NORMAL_(value);
  if (['asistio', 'asistido', 'showed', 'show', 'attended'].indexOf(s) >= 0) return 'ASISTIO';
  if (['no show', 'noshow', 'no asistio', 'no asiste', 'no asistido'].indexOf(s) >= 0) return 'NO_SHOW';
  return 'OTRO';
}
function VSL_KPI_RATIO_(num, den) { return den ? num / den : 0; }
function VSL_KPI_INDEX_(source) {
  const stages = new Set(VSL_KPI_SETEO_STAGES.map(VSL_KPI_NORMAL_));
  const byPeriod = VSL_KPI_CFG.periods.map(() => ({
    leads: new Set(), automatic: new Set(), pending: new Set(),
    seteos: new Set(), unqualified: new Set(), emptyOrigin: new Set()
  }));
  const latestById = new Map();
  let duplicateRows = 0, missingDate = 0;
  // Una oportunidad, una clasificación. Se elige la versión más reciente
  // según GHL Updated At, sin modificar la hoja VSL DATA.
  source.rows.forEach((row, index) => {
    if (VSL_KPI_NORMAL_(VSL_KPI_CELL_(row, source, 'Secuencia')) !== VSL_KPI_NORMAL_(VSL_KPI_CFG.pipeline)) return;
    const id = String(VSL_KPI_CELL_(row, source, 'Opportunity ID') || '').trim();
    if (!id) return;
    const updated = String(VSL_KPI_CELL_(row, source, 'GHL Updated At') || '').trim();
    const old = latestById.get(id);
    if (old) duplicateRows++;
    if (!old || updated > old.updated || (updated === old.updated && index > old.index)) {
      latestById.set(id, {row: row, updated: updated, index: index});
    }
  });
  const knownOpportunityIds = new Set(latestById.keys());
  latestById.forEach(({row}, id) => {
    const date = VSL_KPI_DATE_(VSL_KPI_CELL_(row, source, 'Creado el'));
    if (!date) { missingDate++; return; }
    const stage = VSL_KPI_NORMAL_(VSL_KPI_CELL_(row, source, 'Fase'));
    const origin = VSL_KPI_NORMAL_(VSL_KPI_CELL_(row, source, 'VSL Origen'));
    VSL_KPI_CFG.periods.forEach((period, i) => {
      if (!VSL_KPI_IN_(date, period)) return;
      const x = byPeriod[i];
      // No contabilizar oportunidades sin VSL Origen en ninguno de los tres KPI.
      // Se conservan únicamente en el diagnóstico de registros excluidos.
      if (!origin) {
        x.emptyOrigin.add(id);
      } else if (origin === 'agendado automatico') {
        x.automatic.add(id);
        x.leads.add(id);
      } else {
        x.pending.add(id);
        x.leads.add(id);
      }
      if (stages.has(stage)) x.seteos.add(id);
      if (stage === 'lead no calificado') x.unqualified.add(id);
    });
  });
  return {byPeriod, knownOpportunityIds, missingDate, duplicateRows};
}
function VSL_KPI_APPOINTMENTS_(source, knownOpportunityIds) {
  const periods = VSL_KPI_CFG.periods.map(() => ({
    total: new Set(), attended: new Set(), noShow: new Set(),
    matched: new Set(), unmatched: new Set()
  }));
  const seen = new Set();
  const allowed = new Set(VSL_KPI_CFG.calendarIds);
  let skippedWithoutId = 0, skippedWithoutDate = 0, skippedDeleted = 0, skippedCalendar = 0;
  source.rows.forEach(row => {
    const calendar = String(VSL_KPI_CELL_(row, source, '_Calendar ID') || '').trim();
    if (!allowed.has(calendar)) { skippedCalendar++; return; }
    const id = String(VSL_KPI_CELL_(row, source, '_Appointment ID') || '').trim();
    if (!id) { skippedWithoutId++; return; }
    if (seen.has(id)) return;
    seen.add(id);
    if (VSL_KPI_NORMAL_(VSL_KPI_CELL_(row, source, '_Deleted')) === 'true') { skippedDeleted++; return; }
    const date = VSL_KPI_DATE_(VSL_KPI_CELL_(row, source, 'Fecha cita'));
    if (!date) { skippedWithoutDate++; return; }
    const status = VSL_KPI_STATUS_(VSL_KPI_CELL_(row, source, 'Estado cita'));
    const oppId = String(VSL_KPI_CELL_(row, source, '_Opportunity ID') || '').trim();
    const matchStatus = VSL_KPI_NORMAL_(VSL_KPI_CELL_(row, source, '_Match Status'));
    VSL_KPI_CFG.periods.forEach((p, i) => {
      if (!VSL_KPI_IN_(date, p)) return;
      const x = periods[i];
      x.total.add(id);
      if (status === 'ASISTIO') x.attended.add(id);
      if (status === 'NO_SHOW') x.noShow.add(id);
      if (matchStatus === 'ok' && knownOpportunityIds.has(oppId)) x.matched.add(id);
      else x.unmatched.add(id);
    });
  });
  return {periods, skippedWithoutId, skippedWithoutDate, skippedDeleted, skippedCalendar};
}

function VSL_CALIDAD_LEADS_GENERAR() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Ya hay otra ejecución del reporte en curso.');
  try {
    const ss = SpreadsheetApp.openById(VSL_KPI_CFG.spreadsheetId);
    const leads = VSL_KPI_READ_(ss, VSL_KPI_CFG.leadsSheet,
      ['Opportunity ID', 'Secuencia', 'Fase', 'Creado el', 'VSL Origen', 'Estado de agenda']);
    const appointments = VSL_KPI_READ_(ss, VSL_KPI_CFG.appointmentsSheet,
      ['_Appointment ID', '_Opportunity ID', '_Calendar ID', 'Estado cita', 'Fecha cita', '_Deleted', '_Match Status']);
    const indexed = VSL_KPI_INDEX_(leads);
    const calendar = VSL_KPI_APPOINTMENTS_(appointments, indexed.knownOpportunityIds);
    indexed.byPeriod.forEach((p, i) => {
      if (p.automatic.size + p.pending.size !== p.leads.size) throw new Error('Descuadre de clasificación: ' + VSL_KPI_CFG.periods[i].label);
    });
    const headings = [
      'EMBUDO VSL/CLOSER', 'LEADS CAPTADOS', 'AGENDADOS AUTOMÁTICO',
      '% AGENDADOS AUTOMÁTICO', 'SIN AGENDAMIENTO AUTOMÁTICO',
      '% SIN AGENDAMIENTO AUTOMÁTICO', 'TOTAL DE AGENDAMIENTOS',
      'ASISTENCIA A CITAS', '% ASISTENCIA A CITAS',
      'LEADS NO CALIFICADOS', '% LEADS NO CALIFICADOS', 'TOTAL DE SETEOS',
      'NO ASISTIERON', 'CITAS CON MATCH', 'CITAS SIN MATCH'
    ];
    const output = VSL_KPI_CFG.periods.map((period, i) => {
      const l = indexed.byPeriod[i], a = calendar.periods[i];
      const leadsCount = l.leads.size;
      const setCount = l.seteos.size;
      return [period.label, leadsCount, l.automatic.size,
        VSL_KPI_RATIO_(l.automatic.size, leadsCount), l.pending.size,
        VSL_KPI_RATIO_(l.pending.size, leadsCount), a.total.size,
        a.attended.size, VSL_KPI_RATIO_(a.attended.size, a.total.size),
        l.unqualified.size, VSL_KPI_RATIO_(l.unqualified.size, leadsCount),
        setCount, a.noShow.size, a.matched.size, a.unmatched.size];
    });
    let sheet = ss.getSheetByName(VSL_KPI_CFG.reportSheet);
    if (!sheet) sheet = ss.insertSheet(VSL_KPI_CFG.reportSheet);
    // Solo esta hoja se reconstruye; las hojas de origen permanecen intactas.
    sheet.clear();
    if (sheet.getMaxColumns() < headings.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), headings.length - sheet.getMaxColumns());
    sheet.getRange(1, 1, 1, headings.length).merge()
      .setValue('ANÁLISIS DE CALIDAD DE LEADS DEL EMBUDO VSL | CLOSER')
      .setBackground('#374151').setFontColor('#ffffff').setFontWeight('bold')
      .setHorizontalAlignment('center');
    sheet.getRange(2, 1, 1, headings.length).setValues([headings])
      .setBackground('#e5e7eb').setFontWeight('bold').setWrap(true)
      .setHorizontalAlignment('center');
    if (output.length) sheet.getRange(3, 1, output.length, headings.length).setValues(output);
    [4, 6, 9, 11].forEach(c => sheet.getRange(3, c, Math.max(1, output.length), 1).setNumberFormat('0%'));
    sheet.setFrozenRows(2);
    sheet.setRowHeight(2, 64);
    sheet.setColumnWidth(1, 235);
    for (let c = 2; c <= headings.length; c++) sheet.setColumnWidth(c, 155);
    sheet.getRange(2, 1, output.length + 1, headings.length).setBorder(true, true, true, true, true, true);
    const noteRow = output.length + 5;
    sheet.getRange(noteRow, 1).setValue('CRITERIOS Y ADVERTENCIAS').setFontWeight('bold');
    const notes = [
      'Leads captados, agendados automáticos, pendientes, seteos y no calificados: cohorte por fecha de creación de la oportunidad (hora Lima), usando el estado ACTUAL de cada oportunidad.',
      'Leads captados = agendados automáticos + sin agendamiento automático, únicamente con VSL Origen informado. Origen vacío: excluido de los tres KPI y reportado por separado en el registro de ejecución.',
      'Total de agendamientos y asistencia: fecha de la cita, únicamente calendarios VSL PAGADO EQUIPO y CÍRCULO; una cita por Appointment ID; excluye _Deleted=TRUE.',
      '% asistencia = Asistió / Total de agendamientos del periodo. El denominador incluye todas las citas válidas de los calendarios configurados, aunque no tengan resultado definitivo.',
      'Total de seteos = suma de oportunidades únicas en las 8 denominaciones exactas configuradas. No cuenta las demás etapas.',
      '% leads no calificados = oportunidades actualmente en Lead no calificado / leads captados de la cohorte (con VSL Origen informado). El conteo de no calificados se mantiene según la fase actual.',
      'Las citas sin match también cuentan en total y asistencia; revisar Citas sin match antes de usar KPI atribuibles a oportunidades.',
      'El reporte refleja los datos disponibles en ambas hojas en el momento de ejecución. No representa historial de cambios de etapas ni valida completitud de la API.'
    ];
    sheet.getRange(noteRow + 1, 1, notes.length, 1).setValues(notes.map(n => [n]));
    sheet.getRange(noteRow + 1, 1, notes.length, 1).setWrap(true);
    const summary = {
      success: true, periods: VSL_KPI_CFG.periods.length, sourceLeadRows: leads.rows.length,
      sourceAppointmentRows: appointments.rows.length,
      duplicateOpportunityRows: indexed.duplicateRows,
      excludedEmptyOriginByPeriod: indexed.byPeriod.map((p, i) => ({period: VSL_KPI_CFG.periods[i].label, count: p.emptyOrigin.size})),
      leadsWithoutValidCreationDate: indexed.missingDate,
      appointmentsWithoutId: calendar.skippedWithoutId,
      appointmentsWithoutDate: calendar.skippedWithoutDate,
      deletedAppointmentsExcluded: calendar.skippedDeleted,
      otherCalendarsExcluded: calendar.skippedCalendar,
      reportSheet: VSL_KPI_CFG.reportSheet,
      rows: output.map((r, i) => ({period: VSL_KPI_CFG.periods[i].label, leads: r[1], automatic: r[2], pending: r[4], appointments: r[6], attended: r[7], seteos: r[11], unqualified: r[9], unmatchedAppointments: r[14]}))
    };
    console.log(JSON.stringify(summary, null, 2));
    return summary;
  } finally { lock.releaseLock(); }
}

// Validación de origen sin escribir ninguna hoja.
function VSL_CALIDAD_LEADS_VERIFICAR() {
  const ss = SpreadsheetApp.openById(VSL_KPI_CFG.spreadsheetId);
  const a = VSL_KPI_READ_(ss, VSL_KPI_CFG.leadsSheet,
    ['Opportunity ID', 'Secuencia', 'Fase', 'Creado el', 'VSL Origen', 'Estado de agenda']);
  const b = VSL_KPI_READ_(ss, VSL_KPI_CFG.appointmentsSheet,
    ['_Appointment ID', '_Opportunity ID', '_Calendar ID', 'Estado cita', 'Fecha cita', '_Deleted', '_Match Status']);
  const result = {valid: true, leadRows: a.rows.length, appointmentRows: b.rows.length,
    periods: VSL_KPI_CFG.periods, configuredSeteoStages: VSL_KPI_SETEO_STAGES};
  console.log(JSON.stringify(result, null, 2));
  return result;
}


// ===== REPORTE ENCUESTAS VSL CLOSERS =====

/**
 * 20_VSL_REPORTE_ENCUESTAS_CLOSERS.gs
 * Resumen de encuestas por MES DE RESPUESTA, una fila por mes y contacto único.
 * FUENTES SOLO LECTURA: VSL_SURVEYS_MASTER, VSL DATA, APPOINTMENTS_MASTER.
 * SALIDAS: VSL_REPORTE_ENCUESTAS y VSL_REPORTE_DIAGNOSTICO.
 * No llama a GHL: sincronizar las tres fuentes antes de ejecutar.
 */
const VSL20 = Object.freeze({
  spreadsheetId:'1h4zBoUfJqhc40GLegkOl1vIInGBPJHY5tQjsCQwax-0',
  surveys:'VSL_SURVEYS_MASTER',opps:'VSL DATA',appointments:'APPOINTMENTS_MASTER',
  output:'VSL_REPORTE_ENCUESTAS',statusOutput:'VSL_REPORTE_ENCUESTAS_ESTADOS',detail:'VSL_DETALLE_ENCUESTAS',diagnostics:'VSL_REPORTE_DIAGNOSTICO',
  calendars:['pMZfD4DFxhQCJHC9zoK0','2stEL9p5aBxmHO5N7D8m'],
  pipeline:'VSL | Closers',year:2026,timezone:'America/Lima'
});
function VSL20_N_(s){return String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');}
function VSL20_read_(ss,name,required){
  const sh=ss.getSheetByName(name);if(!sh)throw Error('No existe la hoja '+name);
  const rows=sh.getDataRange().getValues();if(!rows.length)throw Error('Hoja vacía: '+name);
  const h=rows.shift().map(VSL20_N_),ix={};
  required.forEach(k=>{const i=h.indexOf(VSL20_N_(k));if(i<0)throw Error('Falta columna '+k+' en '+name);ix[k]=i;});
  return {rows,ix,get:(r,k)=>r[ix[k]]};
}
function VSL20_date_(v){
  if(v instanceof Date)return isNaN(v.getTime())?null:v;
  if(v===null||v==='')return null;
  const d=new Date(String(v).trim());return isNaN(d.getTime())?null:d;
}
function VSL20_month_(d){return Utilities.formatDate(d,VSL20.timezone,'yyyy-MM');}
function VSL20_status_(v){
  const x=VSL20_N_(v).replace(/[_-]/g,' ');
  if(/no.?show|no asist|no se present|not showed/.test(x))return 'NO ASISTIÓ';
  if(/cancel|invalid/.test(x))return 'CANCELADO';
  if(/showed|asist|completed/.test(x))return 'ASISTIÓ';
  if(/confirm|booked|new|agend|scheduled/.test(x))return 'CONFIRMADO';
  return 'OTRO';
}
function VSL20_income_(v){
  const x=VSL20_N_(v);
  if(/menos de 5|menos de 5000/.test(x))return 0;
  if(/entre 5[.,]?000 y 10[.,]?000|entre 5000 y 10000/.test(x))return 1;
  if(/entre 10[.,]?000 y 20[.,]?000|entre 10000 y 20000/.test(x))return 2;
  if(/entre 20[.,]?000 y 50[.,]?000|entre 20000 y 50000/.test(x))return 3;
  if(/mas de 50[.,]?000|mas de 50000/.test(x))return 4;
  return -1;
}
function VSL20_invest_(v){
  const x=VSL20_N_(v);
  if(!x)return '';
  if(/no cuento|no tengo|no dispongo|no puedo|no estoy dispuesto/.test(x))return 'NO';
  if(/si,? estoy dispuesto|si estoy dispuesto|dispuesto a invertir/.test(x))return 'SI';
  return 'OTRO';
}
function VSL20_yes_(v){const x=VSL20_N_(v);return /^(si\b|si,)/.test(x);}
function VSL20_no_(v){const x=VSL20_N_(v);return /^no\b/.test(x);}
function VSL20_new_(){return {ids:new Set(),yes:0,no:0,income:[0,0,0,0,0],unknownIncome:0,investYes:0,investNo:0,callYes:0,callNo:0,bottlenecks:new Map()};}
function VSL20_add_(o,s){
  o.ids.add(String(s.id));
  if(VSL20_yes_(s.entrepreneur))o.yes++;else if(VSL20_no_(s.entrepreneur))o.no++;
  const i=VSL20_income_(s.income);if(i>=0)o.income[i]++;else o.unknownIncome++;
  const iv=VSL20_invest_(s.invest);if(iv==='SI')o.investYes++;if(iv==='NO')o.investNo++;
  if(VSL20_yes_(s.call))o.callYes++;else if(VSL20_no_(s.call))o.callNo++;
  String(s.bottleneck||'').split(/\s*,\s*(?![^\[]*\])/).filter(Boolean).forEach(v=>o.bottlenecks.set(v,(o.bottlenecks.get(v)||0)+1));
}
function VSL20_report_(from,to){
  const lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw Error('Otro reporte se está ejecutando');
  try{
    const ss=SpreadsheetApp.openById(VSL20.spreadsheetId);
    const surveys=VSL20_read_(ss,VSL20.surveys,['_Submission ID','Fecha respuesta','_Contact ID','_Opportunity ID','¿Es empresario?','Ingreso promedio 3 meses','Cuello de botella','Disposición a invertir USD 3,000','Confirmación de contacto','Nombre (encuesta)','WhatsApp (encuesta)','Correo (encuesta)']);
    const opps=VSL20_read_(ss,VSL20.opps,['Opportunity ID','Contact ID','Secuencia']);
    const appointments=VSL20_read_(ss,VSL20.appointments,['_Appointment ID','_Opportunity ID','_Contact ID','_Calendar ID','Estado cita','Fecha cita','_Deleted']);
    const oppMap=new Map(),byContact=new Map();
    for(const r of opps.rows){
      if(VSL20_N_(opps.get(r,'Secuencia'))!==VSL20_N_(VSL20.pipeline))continue;
      const id=String(opps.get(r,'Opportunity ID')||'').trim(),cid=String(opps.get(r,'Contact ID')||'').trim();
      if(!id)continue;oppMap.set(id,cid);
      if(cid){if(!byContact.has(cid))byContact.set(cid,new Set());byContact.get(cid).add(id);}
    }
    // Una encuesta por contacto para cada cita: última respuesta hasta el momento de la cita.
    // Si la encuesta se completó después de la cita, no se usa para atribuir esa cita.
    const surveyByContact=new Map(),surveyByOpp=new Map(),surveyIds=new Set(),monthlySurveys=new Map();let invalidSurveyDates=0;
    for(const r of surveys.rows){
      const id=String(surveys.get(r,'_Submission ID')||'').trim();if(!id||surveyIds.has(id))continue;surveyIds.add(id);
      const d=VSL20_date_(surveys.get(r,'Fecha respuesta'));if(!d){invalidSurveyDates++;continue;}
      const obj={id,date:d,entrepreneur:surveys.get(r,'¿Es empresario?'),income:surveys.get(r,'Ingreso promedio 3 meses'),bottleneck:surveys.get(r,'Cuello de botella'),invest:surveys.get(r,'Disposición a invertir USD 3,000'),call:surveys.get(r,'Confirmación de contacto'),name:surveys.get(r,'Nombre (encuesta)'),phone:surveys.get(r,'WhatsApp (encuesta)'),email:surveys.get(r,'Correo (encuesta)')};
      const cid=String(surveys.get(r,'_Contact ID')||'').trim(),oid=String(surveys.get(r,'_Opportunity ID')||'').trim();
       // Resumen mensual: última encuesta por contacto y mes de respuesta, tenga o no cita.
       const month=VSL20_month_(d);
       const identity=cid ? 'C:'+cid : (oid ? 'O:'+oid : 'S:'+id);
       if(!monthlySurveys.has(month))monthlySurveys.set(month,new Map());
       const monthMap=monthlySurveys.get(month),previous=monthMap.get(identity);
       if(!previous||d>previous.date)monthMap.set(identity,obj);
      if(cid){if(!surveyByContact.has(cid))surveyByContact.set(cid,[]);surveyByContact.get(cid).push(obj);}
      if(oid&&oppMap.has(oid)){if(!surveyByOpp.has(oid))surveyByOpp.set(oid,[]);surveyByOpp.get(oid).push(obj);}
    }
    for(const arr of [...surveyByContact.values(),...surveyByOpp.values()])arr.sort((a,b)=>a.date-b.date);
    const selected=new Map(),seen=new Set(),stats={totalCitas:0,fueraPeriodo:0,sinEncuesta:0,sinOportunidad:0,sinFecha:0,duplicadas:0,estadosOtros:0,conEncuesta:0};
    const allowed=new Set(VSL20.calendars),order=['CONFIRMADO','ASISTIÓ','CANCELADO','NO ASISTIÓ','OTRO'];
    const start=new Date(from+'T00:00:00-05:00'),end=new Date(to+'T23:59:59.999-05:00');
    if(isNaN(start)||isNaN(end)||start>end)throw Error('Fechas inválidas');
    for(const r of appointments.rows){
      if(!allowed.has(String(appointments.get(r,'_Calendar ID')||'').trim()))continue;
      if(['true','1','yes','si'].includes(VSL20_N_(appointments.get(r,'_Deleted'))))continue;
      const id=String(appointments.get(r,'_Appointment ID')||'').trim();if(!id)continue;
      if(seen.has(id)){stats.duplicadas++;continue;}seen.add(id);
      const d=VSL20_date_(appointments.get(r,'Fecha cita'));if(!d){stats.sinFecha++;continue;}
      if(d<start||d>end){stats.fueraPeriodo++;continue;}
      stats.totalCitas++;
      const oid=String(appointments.get(r,'_Opportunity ID')||'').trim();
      if(!oppMap.has(oid)){stats.sinOportunidad++;continue;}
      const cid=String(appointments.get(r,'_Contact ID')||oppMap.get(oid)||'').trim();
      const candidates=[...(surveyByOpp.get(oid)||[]),...(surveyByContact.get(cid)||[])];
      const eligible=candidates.filter(s=>s.date<=d).sort((a,b)=>b.date-a.date);
      if(!eligible.length){stats.sinEncuesta++;continue;}
      const s=eligible[0],month=VSL20_month_(d),status=VSL20_status_(appointments.get(r,'Estado cita'));
      if(status==='OTRO')stats.estadosOtros++;
      const key=month+'|'+status;
      if(!selected.has(key))selected.set(key,new Map());
      // Deduplicar contacto dentro de mes/estado: si tiene varias citas, contar una vez.
      const identity=cid||oid;const map=selected.get(key);
      const old=map.get(identity);if(!old||s.date>old.survey.date)map.set(identity,{survey:s,appointmentId:id,appointmentDate:d,contactId:cid,opportunityId:oid,identity:identity,month:month,status:status});
      stats.conEncuesta++;
    }
    const months=[];let cursor=new Date(from+'T12:00:00-05:00');cursor.setDate(1);
    const endMonth=to.slice(0,7);while(VSL20_month_(cursor)<=endMonth){months.push(VSL20_month_(cursor));cursor.setMonth(cursor.getMonth()+1);if(months.length>240)throw Error('Rango demasiado amplio');}
    // UNA fila por mes; se calcula sobre encuestas únicas del MASTER, no sobre citas.
    const headers=['PERIODO / MES','Leads que completaron la encuesta',
      '% de leads que facturan USD 5,000 o más',
      '% de leads con disposición de inversión de al menos USD 3,000',
      '% leads calificados por encuesta (dispuestos y facturan 5k+ / facturan 5k+)'];
    const output=[headers];
    for(const month of months.reverse()){
      const entries=[...(monthlySurveys.get(month)||new Map()).values()];
      const total=entries.length;
      const high=entries.filter(s=>VSL20_income_(s.income)>=1).length;
      const willing=entries.filter(s=>VSL20_invest_(s.invest)==='SI').length;
      const qualified=entries.filter(s=>VSL20_income_(s.income)>=1&&VSL20_invest_(s.invest)==='SI').length;
      output.push([month,total,total?high/total:0,total?willing/total:0,high?qualified/high:0]);
    }
    // Preguntas originales por MES DE CITA y ESTADO DE AGENDA.
    // Es una salida INDEPENDIENTE del resumen mensual de encuestas por fecha de respuesta.
    // Las personas sin cita asociada no se asignan a un estado artificial.
    const statusHeaders=[
      'PERIODO / MES','ESTADO DE AGENDA',
      '# Leads que dijeron "Sí, soy empresario"',
      '# Leads que dijeron "No, saldré de esta página de inmediato"',
      'Leads que facturan menos de USD 5,000 / mes',
      'Leads que facturan entre USD 5,000 y 10,000 / mes',
      'Leads que facturan entre USD 10,000 y 20,000 / mes',
      'Leads que facturan entre USD 20,000 y 50,000 / mes',
      'Leads que facturan más de USD 50,000 / mes',
      '3 principales cuellos de botella para escalar',
      '# Leads dispuestos a invertir al menos USD 3,000',
      '# Leads que no cuentan con ese presupuesto',
      '# Leads que confirmaron que contestarán la llamada',
      '# Leads que dijeron que no contestarán la llamada'
    ];
    const statusRows=[statusHeaders];
    const orderedStatuses=['CONFIRMADO','ASISTIÓ','CANCELADO','NO ASISTIÓ'];
    // `months` ya está en orden descendente después de reverse().
    for(const month of months){
      for(const status of orderedStatuses){
        const persons=selected.get(month+'|'+status)||new Map();
        const agg=VSL20_new_();
        for(const item of persons.values())VSL20_add_(agg,item.survey);
        const topBottlenecks=[...agg.bottlenecks.entries()]
          .sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))
          .slice(0,3).map(([name,count])=>name+' ('+count+')').join(' | ');
        statusRows.push([month,status,agg.yes,agg.no,...agg.income,
          topBottlenecks,agg.investYes,agg.investNo,agg.callYes,agg.callNo]);
      }
    }
    const statusSheet=ss.getSheetByName(VSL20.statusOutput)||ss.insertSheet(VSL20.statusOutput);
    statusSheet.clearContents();
    if(statusSheet.getMaxRows()<statusRows.length)statusSheet.insertRowsAfter(statusSheet.getMaxRows(),statusRows.length-statusSheet.getMaxRows());
    if(statusSheet.getMaxColumns()<statusHeaders.length)statusSheet.insertColumnsAfter(statusSheet.getMaxColumns(),statusHeaders.length-statusSheet.getMaxColumns());
    statusSheet.getRange(1,1,statusRows.length,statusHeaders.length).setValues(statusRows);
    statusSheet.getRange(1,1,1,statusHeaders.length).setBackground('#263b53').setFontColor('#ffffff').setFontWeight('bold').setWrap(true);
    statusSheet.setFrozenRows(1);
    statusSheet.setColumnWidth(1,135);statusSheet.setColumnWidth(2,140);
    for(let c=3;c<=statusHeaders.length;c++)statusSheet.setColumnWidth(c,c===10?330:165);
    // Detalle auditable: mismas personas seleccionadas y mismas cifras que el resumen.
    const detailHeaders=['PERIODO / MES','ESTADO DE AGENDA','NOMBRE','WHATSAPP','CORREO','FECHA DE REUNIÓN','FECHA DE RESPUESTA','_Appointment ID','_Contact ID','_Opportunity ID','_Submission ID','¿Es empresario?','Ingreso promedio 3 meses','Cuello de botella','Disposición a invertir USD 3,000','Confirmación de contacto'];
    const detailRows=[];
    for(const [key,persons] of selected.entries())for(const x of persons.values()){
      const s=x.survey;
      detailRows.push([x.month,x.status,s.name,s.phone,s.email,Utilities.formatDate(x.appointmentDate,VSL20.timezone,'yyyy-MM-dd HH:mm'),Utilities.formatDate(s.date,VSL20.timezone,'yyyy-MM-dd HH:mm'),x.appointmentId,x.contactId,x.opportunityId,s.id,s.entrepreneur,s.income,s.bottleneck,s.invest,s.call]);
    }
    detailRows.sort((a,b)=>String(b[0]).localeCompare(String(a[0]))||String(a[1]).localeCompare(String(b[1]))||String(a[2]).localeCompare(String(b[2])));
    const detailSheet=ss.getSheetByName(VSL20.detail)||ss.insertSheet(VSL20.detail);
    detailSheet.clearContents();
    if(detailSheet.getMaxRows()<detailRows.length+1)detailSheet.insertRowsAfter(detailSheet.getMaxRows(),detailRows.length+1-detailSheet.getMaxRows());
    if(detailSheet.getMaxColumns()<detailHeaders.length)detailSheet.insertColumnsAfter(detailSheet.getMaxColumns(),detailHeaders.length-detailSheet.getMaxColumns());
    detailSheet.getRange(1,1,1,detailHeaders.length).setValues([detailHeaders]).setFontWeight('bold').setBackground('#263b53').setFontColor('#ffffff');
    if(detailRows.length)detailSheet.getRange(2,1,detailRows.length,detailHeaders.length).setValues(detailRows);
    detailSheet.setFrozenRows(1);
    const sh=ss.getSheetByName(VSL20.output)||ss.insertSheet(VSL20.output);
    sh.clearContents();if(sh.getMaxRows()<output.length)sh.insertRowsAfter(sh.getMaxRows(),output.length-sh.getMaxRows());
    if(sh.getMaxColumns()<headers.length)sh.insertColumnsAfter(sh.getMaxColumns(),headers.length-sh.getMaxColumns());
    sh.getRange(1,1,output.length,headers.length).setValues(output);
    sh.setFrozenRows(1);sh.getRange(1,1,1,headers.length).setFontWeight('bold').setBackground('#263b53').setFontColor('#ffffff').setWrap(true);
    if(output.length>1)sh.getRange(2,3,output.length-1,3).setNumberFormat('0.0%');
    sh.setColumnWidth(1,150);sh.setColumnWidth(2,220);sh.setColumnWidth(3,230);sh.setColumnWidth(4,260);sh.setColumnWidth(5,300);
    const diag=ss.getSheetByName(VSL20.diagnostics)||ss.insertSheet(VSL20.diagnostics);
    const drows=[['Indicador','Valor'],['Fecha de actualización',new Date()],['Desde',from],['Hasta',to],['Encuestas únicas en MASTER',surveyIds.size],['Citas válidas en calendarios y rango',stats.totalCitas],['Citas con encuesta previa asociada',stats.conEncuesta],['Citas sin encuesta previa',stats.sinEncuesta],['Citas sin oportunidad VSL Closers',stats.sinOportunidad],['Citas sin fecha',stats.sinFecha],['Citas duplicadas por Appointment ID',stats.duplicadas],['Citas con estado no reconocido',stats.estadosOtros],['Encuestas con fecha inválida',invalidSurveyDates],['Nota','Resumen mensual por fecha de respuesta, incluye encuestas con y sin cita. Una encuesta por contacto y mes (la última). Porcentajes sobre total de encuestados; calificados sobre quienes facturan 5k o más.'],['Nota 2','El detalle de citas mantiene la última encuesta previa a la reunión y la deduplicación por mes/estado; es independiente del nuevo resumen mensual.'],['Nota 3','No se inventan citas ni estados para encuestas que no estén relacionadas con APPOINTMENTS_MASTER.']];
    diag.clearContents();diag.getRange(1,1,drows.length,2).setValues(drows);diag.getRange(1,1,1,2).setFontWeight('bold');diag.autoResizeColumns(1,2);
    Logger.log('REPORTE COMPLETADO: '+JSON.stringify(stats));return stats;
  }finally{lock.releaseLock();}
}
function VSL_REPORTE_ENCUESTAS_2026(){return VSL20_report_('2026-01-01','2026-10-31');}
function VSL_REPORTE_ENCUESTAS_POR_FECHAS(inicio,fin){return VSL20_report_(inicio,fin);}
function VSL_REPORTE_ENCUESTAS_EJEMPLO(){return VSL20_report_('2026-10-01','2026-10-31');}


/** Ejecuta ambos reportes de forma secuencial. */
function VSL_REPORTES_GENERAR_TODOS() {
  const calidad = VSL_CALIDAD_LEADS_GENERAR();
  const encuestas = VSL_REPORTE_ENCUESTAS_2026();
  const embudos = VSL_CALIDAD_LEADS_EMBUDOS_GENERAR_TODOS();
  Logger.log('Ambos reportes finalizados.');
  return {calidad: calidad, encuestas: encuestas, embudos: embudos};
}

/**
 * ENDPOINT HTTP DE SOLO LECTURA PARA EL DASHBOARD VSL.
 * Desplegar como Aplicación web, ejecutada como propietario.
 * GET <URL>/exec -> JSON con las dos tablas ya calculadas.
 * GET <URL>/exec?action=health -> comprueba acceso a hojas.
 * Acceso público sin token por solicitud del administrador.
 * Genera reportes una sola vez si faltan; no sincroniza GoHighLevel.
 */
const VSL_HTTP_CFG = Object.freeze({
  spreadsheetId: VSL_KPI_CFG.spreadsheetId,
  qualitySheet: VSL_KPI_CFG.reportSheet,
  surveysSheet: VSL20.output,
  surveyDetailSheet: VSL20.detail,
  surveyStatusSheet: VSL20.statusOutput,
  diagnosticsSheet: VSL20.diagnostics,
  timezone: 'America/Lima',
  maxRows: 1000,
  maxColumns: 40
});

function VSL_HTTP_JSON_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function VSL_HTTP_VALUE_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, VSL_HTTP_CFG.timezone, "yyyy-MM-dd'T'HH:mm:ssXXX");
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' && !isFinite(v)) return null;
  return v;
}

function VSL_HTTP_TABLE_(ss, sheetName, headerRow, firstDataRow, rowLimit) {
  const sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('No existe la hoja de reporte: ' + sheetName + '. Ejecuta primero los generadores.');
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < headerRow || lastCol < 1) throw new Error('La hoja ' + sheetName + ' no tiene encabezados.');
  const width = Math.min(lastCol, VSL_HTTP_CFG.maxColumns);
  const head = sh.getRange(headerRow, 1, 1, width).getDisplayValues()[0];
  let end = head.length;
  while (end > 0 && !String(head[end - 1]).trim()) end--;
  if (!end) throw new Error('Encabezados vacíos en ' + sheetName);
  const columns = head.slice(0, end);
  const count = Math.min(Math.max(0, lastRow - firstDataRow + 1), rowLimit || VSL_HTTP_CFG.maxRows);
  const rows = count ? sh.getRange(firstDataRow, 1, count, end).getValues()
    .filter(r => r.some(v => v !== '' && v !== null))
    .map(r => r.map(VSL_HTTP_VALUE_)) : [];
  return {columns: columns, rows: rows, sourceSheet: sheetName, truncated: !rowLimit && lastRow - firstDataRow + 1 > VSL_HTTP_CFG.maxRows};
}

function VSL_HTTP_DIAGNOSTICS_(ss) {
  const sh = ss.getSheetByName(VSL_HTTP_CFG.diagnosticsSheet);
  if (!sh || sh.getLastRow() < 2) return {available: false};
  const n = Math.min(sh.getLastRow() - 1, 100);
  const pairs = sh.getRange(2, 1, n, 2).getValues();
  const details = {};
  pairs.forEach(r => {
    const key = String(r[0] == null ? '' : r[0]).trim();
    if (key) details[key] = VSL_HTTP_VALUE_(r[1]);
  });
  return {available: true, details: details};
}

/** Ejecuta manualmente en Apps Script para probar el contrato sin desplegar. */
function VSL_HTTP_PROBAR() {
  const response = VSL_HTTP_BUILD_();
  Logger.log(JSON.stringify({success: response.success,
    qualityRows: response.quality.rows.length,
    qualityColumns: response.quality.columns.length,
    surveyRows: response.surveys.rows.length,
    surveyColumns: response.surveys.columns.length,
    surveyStatusRows: response.surveyStatus.rows.length,
    surveyStatusColumns: response.surveyStatus.columns.length,
    truncated: [response.quality.truncated, response.surveys.truncated]
  }));
  return response;
}

function VSL_HTTP_BUILD_() {
  const ss = SpreadsheetApp.openById(VSL_HTTP_CFG.spreadsheetId);
  // VSL_CALIDAD_LEADS: título fila 1, encabezados fila 2, datos fila 3.
  // VSL_REPORTE_ENCUESTAS: encabezados fila 1, datos fila 2.
  const quality = VSL_HTTP_TABLE_(ss, VSL_HTTP_CFG.qualitySheet, 2, 3, VSL_KPI_CFG.periods.length);
  const surveys = VSL_HTTP_TABLE_(ss, VSL_HTTP_CFG.surveysSheet, 1, 2);
  const surveyStatus = VSL_HTTP_TABLE_(ss, VSL_HTTP_CFG.surveyStatusSheet, 1, 2);
  const qualityOrganico = VSL_HTTP_TABLE_(ss, VSL_EMBUDOS_LIST_[0].reportSheet, 2, 3, VSL_EMBUDOS_CFG.periods.length);
  const qualityLIG = VSL_HTTP_TABLE_(ss, VSL_EMBUDOS_LIST_[1].reportSheet, 2, 3, VSL_EMBUDOS_CFG.periods.length);
  // El detalle se consulta por separado con action=detail para no aumentar el JSON principal.
  return {
    success: true,
    generatedAt: Utilities.formatDate(new Date(), VSL_HTTP_CFG.timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    timeZone: VSL_HTTP_CFG.timezone,
    quality: quality,
    surveys: surveys,
    surveyStatus: surveyStatus,
    qualityOrganico: qualityOrganico,
    qualityLIG: qualityLIG,
    appointmentsByFunnel: VSL_FUNNEL_REPORT_(VSL_FUNNEL_FULL_MONTH_PERIODS_(VSL_KPI_CFG.periods)),
    diagnostics: VSL_HTTP_DIAGNOSTICS_(ss)
  };
}

/**
 * Ejecutar UNA VEZ en el editor después de pegar este archivo.
 * Usa las tres hojas fuente y crea las dos hojas de reporte y el diagnóstico.
 */
function VSL_REPORTES_PREPARAR_API() {
  const ss = SpreadsheetApp.openById(VSL_HTTP_CFG.spreadsheetId);
  const required = [VSL_KPI_CFG.leadsSheet, VSL_KPI_CFG.appointmentsSheet, VSL20.surveys];
  const missing = required.filter(name => !ss.getSheetByName(name));
  if (missing.length) throw new Error('Faltan hojas fuente: ' + missing.join(', ') + '. Hojas disponibles: ' + ss.getSheets().map(s => s.getName()).join(', '));
  const result = VSL_REPORTES_GENERAR_TODOS();
  SpreadsheetApp.flush();
  const check = VSL_HTTP_BUILD_();
  if (check.quality.columns.length !== 15 || check.surveys.columns.length !== 5 || check.surveyStatus.columns.length !== 14) {
    throw new Error('Contrato inesperado: quality=' + check.quality.columns.length + ' columnas; surveys=' + check.surveys.columns.length + ' columnas; surveyStatus=' + check.surveyStatus.columns.length + ' columnas');
  }
  Logger.log(JSON.stringify({ok:true, qualityRows:check.quality.rows.length, surveyRows:check.surveys.rows.length, surveyStatusRows:check.surveyStatus.rows.length, sourceSheets:required, result:result}));
  return {ok:true, qualityRows:check.quality.rows.length, surveyRows:check.surveys.rows.length, surveyStatusRows:check.surveyStatus.rows.length};
}

/** Diagnóstico que no escribe ni altera ninguna hoja. */
function VSL_HTTP_DIAGNOSTICAR() {
  const ss = SpreadsheetApp.openById(VSL_HTTP_CFG.spreadsheetId);
  const names = [VSL_KPI_CFG.leadsSheet, VSL_KPI_CFG.appointmentsSheet, VSL20.surveys,
    VSL_HTTP_CFG.qualitySheet, VSL_HTTP_CFG.surveysSheet, VSL_HTTP_CFG.surveyDetailSheet, VSL_HTTP_CFG.surveyStatusSheet];
  const result = names.map(name => {
    const sh = ss.getSheetByName(name);
    return {sheet:name, exists:!!sh, rows:sh?sh.getLastRow():0, columns:sh?sh.getLastColumn():0};
  });
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/** Crea los reportes solamente si faltan; nunca sincroniza GHL. */
function VSL_HTTP_ENSURE_REPORTS_() {
  const ss = SpreadsheetApp.openById(VSL_HTTP_CFG.spreadsheetId);
  const quality = ss.getSheetByName(VSL_HTTP_CFG.qualitySheet);
  const surveys = ss.getSheetByName(VSL_HTTP_CFG.surveysSheet);
  const details = ss.getSheetByName(VSL_HTTP_CFG.surveyDetailSheet);
  const status = ss.getSheetByName(VSL_HTTP_CFG.surveyStatusSheet);
  const organico = ss.getSheetByName(VSL_EMBUDOS_LIST_[0].reportSheet);
  const lig = ss.getSheetByName(VSL_EMBUDOS_LIST_[1].reportSheet);
  if (quality && quality.getLastRow() >= 2 && surveys && surveys.getLastRow() >= 1 && details && details.getLastRow() >= 1 && status && status.getLastRow() >= 1 && organico && organico.getLastRow() >= 2 && lig && lig.getLastRow() >= 2) return;
  // No ejecutar dos veces si dos visitantes entran al mismo tiempo.
  // Los generadores ya gestionan sus propios locks.
  VSL_REPORTES_GENERAR_TODOS();
  SpreadsheetApp.flush();
}

function VSL_HTTP_SAFE_ERROR_(err) {
  const message = String(err && err.message || err || 'Error desconocido');
  // Mostrar errores de configuración legibles, pero no exponer trazas ni datos de usuarios.
  if (/^(No existe la hoja|Falta columna|Hoja vacía|No hay encabezados|Faltan hojas fuente|Encabezados vacíos|La hoja |Otro reporte|Ya hay otra ejecución)/i.test(message)) {
    return message.slice(0, 350);
  }
  return 'Error interno en Apps Script. Ejecuta VSL_REPORTES_PREPARAR_API y revisa Ejecuciones. ' + message.replace(/https?:\/\/\S+/g, '[URL]').slice(0, 160);
}

/** Punto de entrada HTTP. Publicar nueva versión de la aplicación web. */
function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const action = String(params.action || 'report').toLowerCase();
    if (action === 'commercial_trends') {
      return VSL_HTTP_JSON_(COM_TRENDS_RESPONSE_(String(params.from||'').trim(),String(params.to||'').trim()));
    }
    if (action === 'commercial') {
      const month = String(params.month || Utilities.formatDate(new Date(), 'America/Lima', 'yyyy-MM')).trim();
      return VSL_HTTP_JSON_(COM_API_RESPONSE_(month));
    }

    if (action === 'syncstatus') {
      return VSL_HTTP_JSON_(VSL_REFRESH_PUBLIC_(VSL_REFRESH_READ_()));
    }
    if (action === 'health') {
      const ss = SpreadsheetApp.openById(VSL_HTTP_CFG.spreadsheetId);
      const q = ss.getSheetByName(VSL_HTTP_CFG.qualitySheet);
      const s = ss.getSheetByName(VSL_HTTP_CFG.surveysSheet);
      const d = ss.getSheetByName(VSL_HTTP_CFG.surveyDetailSheet);
      const st = ss.getSheetByName(VSL_HTTP_CFG.surveyStatusSheet);
      return VSL_HTTP_JSON_({success:true, service:'vsl-reports',
        qualityReady:!!q && q.getLastRow() >= 2,
        surveysReady:!!s && s.getLastRow() >= 1,
        surveyDetailsReady:!!d && d.getLastRow() >= 1,
        surveyStatusReady:!!st && st.getLastRow() >= 1,
        sources:[VSL_KPI_CFG.leadsSheet,VSL_KPI_CFG.appointmentsSheet,VSL20.surveys].map(name => ({name:name,exists:!!ss.getSheetByName(name)}))});
    }
    if (action === 'detail') {
      VSL_HTTP_ENSURE_REPORTS_();
      const month=String(params.month||'').trim(),status=String(params.status||'').trim();
      if(month && !/^\d{4}-\d{2}$/.test(month))return VSL_HTTP_JSON_({success:false,error:'month debe ser YYYY-MM'});
      const ss=SpreadsheetApp.openById(VSL_HTTP_CFG.spreadsheetId);
      const detail=VSL_HTTP_TABLE_(ss,VSL_HTTP_CFG.surveyDetailSheet,1,2,5000);
      const rows=detail.rows.filter(r=>(!month||r[0]===month)&&(!status||VSL20_N_(r[1])===VSL20_N_(status)));
      return VSL_HTTP_JSON_({success:true,columns:detail.columns,rows:rows,total:rows.length,month:month,status:status,sourceSheet:VSL_HTTP_CFG.surveyDetailSheet});
    }
    if (action !== 'report') return VSL_HTTP_JSON_({success:false, error:'Acción no soportada', code:'INVALID_ACTION'});
    if (params.startDate || params.endDate) {
      if (!params.startDate || !params.endDate) return VSL_HTTP_JSON_({success:false,code:'INVALID_DATE_RANGE',error:'Debes enviar startDate y endDate'});
      return VSL_HTTP_JSON_(VSL_RANGE_BUILD_(String(params.startDate),String(params.endDate)));
    }
    VSL_HTTP_ENSURE_REPORTS_();
    return VSL_HTTP_JSON_(VSL_HTTP_BUILD_());
  } catch (err) {
    console.error('VSL doGet error: ' + String(err && err.stack || err));
    return VSL_HTTP_JSON_({success:false, error:VSL_HTTP_SAFE_ERROR_(err), code:'REPORT_ERROR'});
  }
}
/**
 * VSL | Closers - Orquestador de actualización por etapas.
 * Requiere, EN EL MISMO PROYECTO de Apps Script:
 * VSL_SINCRONIZAR_TODO, VSL_AGENDAMIENTOS_SINCRONIZAR,
 * VSL_ENCUESTAS_2026_SINCRONIZAR, VSL_REPORTES_GENERAR_TODOS.
 * No reemplaza ni altera los sincronizadores existentes.
 * ATENCIÓN: el sincronizador de leads existente no informa si agotó el tiempo
 * antes de procesar todos los IDs. Esta implementación lo marca como
 * PASADA_FINALIZADA, no como reconciliación exhaustiva garantizada.
 */
const VSL_JOB_KEY_ = 'VSL_REFRESH_JOB_V1';
const VSL_JOB_HANDLER_ = 'VSL_REFRESH_WORKER';
const VSL_JOB_STAGES_ = ['leads','appointments','surveys','reports'];

function VSL_REFRESH_READ_() {
  const raw = PropertiesService.getScriptProperties().getProperty(VSL_JOB_KEY_);
  if (!raw) return {status:'IDLE',stage:null,updatedAt:null};
  try { return JSON.parse(raw); } catch (_) { throw Error('Estado de actualización corrupto'); }
}
function VSL_REFRESH_WRITE_(job) {
  job.updatedAt = new Date().toISOString();
  PropertiesService.getScriptProperties().setProperty(VSL_JOB_KEY_, JSON.stringify(job));
  return job;
}
function VSL_REFRESH_PUBLIC_(job) {
  return {success:true,job:{id:job.id||null,status:job.status,stage:job.stage||null,
    completedStages:job.completedStages||[],startedAt:job.startedAt||null,
    updatedAt:job.updatedAt||null,finishedAt:job.finishedAt||null,
    warning:job.warning||null,error:job.error||null}};
}
// El activador recurrente permanece instalado. No se elimina desde el código:
// en esta cuenta ScriptApp.deleteTrigger() devuelve un error de Google.
function VSL_REFRESH_CLEAR_TRIGGERS_() {
  // Intencionalmente vacío. VSL_REFRESH_WORKER sale si no hay trabajo QUEUED.
}
function VSL_REFRESH_SCHEDULE_() {
  const existing = ScriptApp.getProjectTriggers().filter(
    t => t.getHandlerFunction() === VSL_JOB_HANDLER_
  );
  if (existing.length > 0) {
    return {scheduled:true,existing:true,count:existing.length};
  }
  // Un solo activador recurrente, no uno nuevo por cada etapa.
  ScriptApp.newTrigger(VSL_JOB_HANDLER_).timeBased().everyMinutes(1).create();
  return {scheduled:true,existing:false,count:1};
}
/** Ejecutar manualmente una vez como propietario del proyecto. */
function VSL_REFRESH_INSTALAR() {
  const result = VSL_REFRESH_SCHEDULE_();
  Logger.log('Orquestador instalado sin token: ' + JSON.stringify(result));
  return result;
}
/** Inicia un trabajo y devuelve inmediatamente. Invocado desde doPost público. */
function VSL_REFRESH_START_() {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(10000)) return {success:false,code:'BUSY',error:'Otra operación está iniciándose'};
  try {
    const current=VSL_REFRESH_READ_();
    if(current.status==='RUNNING'||current.status==='QUEUED') {
      const age = Date.now() - Date.parse(current.updatedAt || current.startedAt || 0);
      if (age < 12*60*1000) return VSL_REFRESH_PUBLIC_(current);
      current.status='ERROR';current.error='Trabajo anterior detenido o expirado';
      VSL_REFRESH_WRITE_(current);
    }
    const job={id:Utilities.getUuid(),status:'QUEUED',stage:'leads',completedStages:[],
      startedAt:new Date().toISOString(),warning:null,error:null};
    VSL_REFRESH_WRITE_(job);
    try { VSL_REFRESH_SCHEDULE_(); }
    catch(e) {job.status='ERROR';job.error='No se pudo programar el trabajo: '+e.message;VSL_REFRESH_WRITE_(job);throw e;}
    return VSL_REFRESH_PUBLIC_(job);
  } finally {lock.releaseLock();}
}
/** Una etapa por ejecución; los sincronizadores conservan sus checkpoints. */
function VSL_REFRESH_WORKER() {
  // Reservar la etapa bajo lock y LIBERAR antes de invocar sincronizadores:
  // cada sincronizador obtiene su propio ScriptLock.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  let job;
  let stage;
  try {
    job = VSL_REFRESH_READ_();
    if (job.status !== 'QUEUED') return;
    stage = job.stage;
    job.status = 'RUNNING';
    VSL_REFRESH_WRITE_(job);
  } finally { lock.releaseLock(); }

  let done = false;
  let failure = null;
  try {
    if (stage === 'leads') {
      const result = VSL_SINCRONIZAR_TODO();
      if (result && Number(result.errores || 0) > 0)
        throw Error('Leads: ' + result.errores + ' registros con error');
      job.warning = 'El sincronizador de leads no informa si agotó el tiempo antes de recorrer todos los registros.';
      done = true;
    } else if (stage === 'appointments') {
      const result = VSL_AGENDAMIENTOS_SINCRONIZAR();
      done = !!result && result.estado === 'CONSULTAS COMPLETADAS' && Number(result.intervalosPendientes !== undefined ? result.intervalosPendientes : result.consultasPendientes || 0) === 0;
    } else if (stage === 'surveys') {
      VSL_ENCUESTAS_2026_SINCRONIZAR();
      done = !PropertiesService.getScriptProperties().getProperty('VSL_SURVEYS_MASTER_CHECKPOINT_2026');
    } else if (stage === 'reports') {
      VSL_REPORTES_GENERAR_TODOS();
      SpreadsheetApp.flush();
      const response = VSL_HTTP_BUILD_();
      if (response.quality.columns.length !== 15 || response.surveys.columns.length !== 5 || response.surveyStatus.columns.length !== 14)
        throw Error('Contrato de reportes incorrecto');
      done = true;
    } else throw Error('Etapa desconocida: ' + stage);
  } catch (err) { failure = err; }

  const updateLock = LockService.getScriptLock();
  if (!updateLock.tryLock(30000)) throw Error('No se pudo guardar el estado de sincronización');
  try {
    const current = VSL_REFRESH_READ_();
    if (current.id !== job.id || current.stage !== stage || current.status !== 'RUNNING') return;
    if (failure) {
      current.status = 'ERROR';
      current.error = String(failure.message || failure).slice(0,400);
      current.finishedAt = new Date().toISOString();
      VSL_REFRESH_WRITE_(current);
      VSL_REFRESH_CLEAR_TRIGGERS_();
      console.error(failure && failure.stack || failure);
      return;
    }
    if (job.warning) current.warning = job.warning;
    if (done) {
      current.completedStages.push(stage);
      const next = VSL_JOB_STAGES_.indexOf(stage) + 1;
      if (next === VSL_JOB_STAGES_.length) {
        current.status = 'COMPLETED';
        current.stage = null;
        current.finishedAt = new Date().toISOString();
        VSL_REFRESH_WRITE_(current);
        VSL_REFRESH_CLEAR_TRIGGERS_();
        return;
      }
      current.stage = VSL_JOB_STAGES_[next];
    }
    current.status = 'QUEUED';
    VSL_REFRESH_WRITE_(current);
    VSL_REFRESH_SCHEDULE_();
  } finally { updateLock.releaseLock(); }
}

/** Entrada HTTP POST pública, sin token; cualquier persona con la URL puede iniciar la sincronización. */
function doPost(e) {
  try {
    let body = {};
    try { body = JSON.parse(e && e.postData && e.postData.contents || '{}'); }
    catch (_) { return VSL_HTTP_JSON_({success:false,code:'BAD_JSON',error:'JSON inválido'}); }
    if (body.action !== 'refresh')
      return VSL_HTTP_JSON_({success:false,code:'INVALID_ACTION',error:'Acción no soportada'});
    return VSL_HTTP_JSON_(VSL_REFRESH_START_());
  } catch (err) {
    console.error(err && err.stack || err);
    return VSL_HTTP_JSON_({success:false,code:'REFRESH_ERROR',error:String(err && err.message || err).slice(0,250)});
  }
}

function VSL_RANGE_INDEX_(source, periods) {
  const stages = new Set(VSL_KPI_SETEO_STAGES.map(VSL_KPI_NORMAL_));
  const byPeriod = periods.map(() => ({
    leads: new Set(), automatic: new Set(), pending: new Set(),
    seteos: new Set(), unqualified: new Set(), emptyOrigin: new Set()
  }));
  const latestById = new Map();
  let duplicateRows = 0, missingDate = 0;
  // Una oportunidad, una clasificación. Se elige la versión más reciente
  // según GHL Updated At, sin modificar la hoja VSL DATA.
  source.rows.forEach((row, index) => {
    if (VSL_KPI_NORMAL_(VSL_KPI_CELL_(row, source, 'Secuencia')) !== VSL_KPI_NORMAL_(VSL_KPI_CFG.pipeline)) return;
    const id = String(VSL_KPI_CELL_(row, source, 'Opportunity ID') || '').trim();
    if (!id) return;
    const updated = String(VSL_KPI_CELL_(row, source, 'GHL Updated At') || '').trim();
    const old = latestById.get(id);
    if (old) duplicateRows++;
    if (!old || updated > old.updated || (updated === old.updated && index > old.index)) {
      latestById.set(id, {row: row, updated: updated, index: index});
    }
  });
  const knownOpportunityIds = new Set(latestById.keys());
  latestById.forEach(({row}, id) => {
    const date = VSL_KPI_DATE_(VSL_KPI_CELL_(row, source, 'Creado el'));
    if (!date) { missingDate++; return; }
    const stage = VSL_KPI_NORMAL_(VSL_KPI_CELL_(row, source, 'Fase'));
    const origin = VSL_KPI_NORMAL_(VSL_KPI_CELL_(row, source, 'VSL Origen'));
    periods.forEach((period, i) => {
      if (!VSL_KPI_IN_(date, period)) return;
      const x = byPeriod[i];
      // No contabilizar oportunidades sin VSL Origen en ninguno de los tres KPI.
      // Se conservan únicamente en el diagnóstico de registros excluidos.
      if (!origin) {
        x.emptyOrigin.add(id);
      } else if (origin === 'agendado automatico') {
        x.automatic.add(id);
        x.leads.add(id);
      } else {
        x.pending.add(id);
        x.leads.add(id);
      }
      if (stages.has(stage)) x.seteos.add(id);
      if (stage === 'lead no calificado') x.unqualified.add(id);
    });
  });
  return {byPeriod, knownOpportunityIds, missingDate, duplicateRows};
}

function VSL_RANGE_APPOINTMENTS_(source, knownOpportunityIds, periodsInput) {
  const periods = periodsInput.map(() => ({
    total: new Set(), attended: new Set(), noShow: new Set(),
    matched: new Set(), unmatched: new Set()
  }));
  const seen = new Set();
  const allowed = new Set(VSL_KPI_CFG.calendarIds);
  let skippedWithoutId = 0, skippedWithoutDate = 0, skippedDeleted = 0, skippedCalendar = 0;
  source.rows.forEach(row => {
    const calendar = String(VSL_KPI_CELL_(row, source, '_Calendar ID') || '').trim();
    if (!allowed.has(calendar)) { skippedCalendar++; return; }
    const id = String(VSL_KPI_CELL_(row, source, '_Appointment ID') || '').trim();
    if (!id) { skippedWithoutId++; return; }
    if (seen.has(id)) return;
    seen.add(id);
    if (VSL_KPI_NORMAL_(VSL_KPI_CELL_(row, source, '_Deleted')) === 'true') { skippedDeleted++; return; }
    const date = VSL_KPI_DATE_(VSL_KPI_CELL_(row, source, 'Fecha cita'));
    if (!date) { skippedWithoutDate++; return; }
    const status = VSL_KPI_STATUS_(VSL_KPI_CELL_(row, source, 'Estado cita'));
    const oppId = String(VSL_KPI_CELL_(row, source, '_Opportunity ID') || '').trim();
    const matchStatus = VSL_KPI_NORMAL_(VSL_KPI_CELL_(row, source, '_Match Status'));
    periodsInput.forEach((p, i) => {
      if (!VSL_KPI_IN_(date, p)) return;
      const x = periods[i];
      x.total.add(id);
      if (status === 'ASISTIO') x.attended.add(id);
      if (status === 'NO_SHOW') x.noShow.add(id);
      if (matchStatus === 'ok' && knownOpportunityIds.has(oppId)) x.matched.add(id);
      else x.unmatched.add(id);
    });
  });
  return {periods, skippedWithoutId, skippedWithoutDate, skippedDeleted, skippedCalendar};
}


function VSL_RANGE_SURVEYS_(from,to){
  {
    const ss=SpreadsheetApp.openById(VSL20.spreadsheetId);
    const surveys=VSL20_read_(ss,VSL20.surveys,['_Submission ID','Fecha respuesta','_Contact ID','_Opportunity ID','¿Es empresario?','Ingreso promedio 3 meses','Cuello de botella','Disposición a invertir USD 3,000','Confirmación de contacto','Nombre (encuesta)','WhatsApp (encuesta)','Correo (encuesta)']);
    const opps=VSL20_read_(ss,VSL20.opps,['Opportunity ID','Contact ID','Secuencia']);
    const appointments=VSL20_read_(ss,VSL20.appointments,['_Appointment ID','_Opportunity ID','_Contact ID','_Calendar ID','Estado cita','Fecha cita','_Deleted']);
    const oppMap=new Map(),byContact=new Map();
    for(const r of opps.rows){
      if(VSL20_N_(opps.get(r,'Secuencia'))!==VSL20_N_(VSL20.pipeline))continue;
      const id=String(opps.get(r,'Opportunity ID')||'').trim(),cid=String(opps.get(r,'Contact ID')||'').trim();
      if(!id)continue;oppMap.set(id,cid);
      if(cid){if(!byContact.has(cid))byContact.set(cid,new Set());byContact.get(cid).add(id);}
    }
    // Una encuesta por contacto para cada cita: última respuesta hasta el momento de la cita.
    // Si la encuesta se completó después de la cita, no se usa para atribuir esa cita.
    const surveyByContact=new Map(),surveyByOpp=new Map(),surveyIds=new Set(),monthlySurveys=new Map();let invalidSurveyDates=0;
    for(const r of surveys.rows){
      const id=String(surveys.get(r,'_Submission ID')||'').trim();if(!id||surveyIds.has(id))continue;surveyIds.add(id);
      const d=VSL20_date_(surveys.get(r,'Fecha respuesta'));if(!d){invalidSurveyDates++;continue;}
      const obj={id,date:d,entrepreneur:surveys.get(r,'¿Es empresario?'),income:surveys.get(r,'Ingreso promedio 3 meses'),bottleneck:surveys.get(r,'Cuello de botella'),invest:surveys.get(r,'Disposición a invertir USD 3,000'),call:surveys.get(r,'Confirmación de contacto'),name:surveys.get(r,'Nombre (encuesta)'),phone:surveys.get(r,'WhatsApp (encuesta)'),email:surveys.get(r,'Correo (encuesta)')};
      const cid=String(surveys.get(r,'_Contact ID')||'').trim(),oid=String(surveys.get(r,'_Opportunity ID')||'').trim();
       // Resumen mensual: última encuesta por contacto y mes de respuesta, tenga o no cita.
       const day=Utilities.formatDate(d,VSL20.timezone,'yyyy-MM-dd');
       if(day>=from&&day<=to){
         const month=from+' / '+to;
         const identity=cid ? 'C:'+cid : (oid ? 'O:'+oid : 'S:'+id);
         if(!monthlySurveys.has(month))monthlySurveys.set(month,new Map());
         const monthMap=monthlySurveys.get(month),previous=monthMap.get(identity);
         if(!previous||d>previous.date)monthMap.set(identity,obj);
       }
      if(cid){if(!surveyByContact.has(cid))surveyByContact.set(cid,[]);surveyByContact.get(cid).push(obj);}
      if(oid&&oppMap.has(oid)){if(!surveyByOpp.has(oid))surveyByOpp.set(oid,[]);surveyByOpp.get(oid).push(obj);}
    }
    for(const arr of [...surveyByContact.values(),...surveyByOpp.values()])arr.sort((a,b)=>a.date-b.date);
    const selected=new Map(),seen=new Set(),stats={totalCitas:0,fueraPeriodo:0,sinEncuesta:0,sinOportunidad:0,sinFecha:0,duplicadas:0,estadosOtros:0,conEncuesta:0};
    const allowed=new Set(VSL20.calendars),order=['CONFIRMADO','ASISTIÓ','CANCELADO','NO ASISTIÓ','OTRO'];
    const start=new Date(from+'T00:00:00-05:00'),end=new Date(to+'T23:59:59.999-05:00');
    if(isNaN(start)||isNaN(end)||start>end)throw Error('Fechas inválidas');
    for(const r of appointments.rows){
      if(!allowed.has(String(appointments.get(r,'_Calendar ID')||'').trim()))continue;
      if(['true','1','yes','si'].includes(VSL20_N_(appointments.get(r,'_Deleted'))))continue;
      const id=String(appointments.get(r,'_Appointment ID')||'').trim();if(!id)continue;
      if(seen.has(id)){stats.duplicadas++;continue;}seen.add(id);
      const d=VSL20_date_(appointments.get(r,'Fecha cita'));if(!d){stats.sinFecha++;continue;}
      if(d<start||d>end){stats.fueraPeriodo++;continue;}
      stats.totalCitas++;
      const oid=String(appointments.get(r,'_Opportunity ID')||'').trim();
      if(!oppMap.has(oid)){stats.sinOportunidad++;continue;}
      const cid=String(appointments.get(r,'_Contact ID')||oppMap.get(oid)||'').trim();
      const candidates=[...(surveyByOpp.get(oid)||[]),...(surveyByContact.get(cid)||[])];
      const eligible=candidates.filter(s=>s.date<=d).sort((a,b)=>b.date-a.date);
      if(!eligible.length){stats.sinEncuesta++;continue;}
      const s=eligible[0],month=(from+' / '+to),status=VSL20_status_(appointments.get(r,'Estado cita'));
      if(status==='OTRO')stats.estadosOtros++;
      const key=(from+' / '+to)+'|'+status;
      if(!selected.has(key))selected.set(key,new Map());
      // Deduplicar contacto dentro de mes/estado: si tiene varias citas, contar una vez.
      const identity=cid||oid;const map=selected.get(key);
      const old=map.get(identity);if(!old||s.date>old.survey.date)map.set(identity,{survey:s,appointmentId:id,appointmentDate:d,contactId:cid,opportunityId:oid,identity:identity,month:month,status:status});
      stats.conEncuesta++;
    }
    const months=[from+' / '+to];
    // UNA fila por mes; se calcula sobre encuestas únicas del MASTER, no sobre citas.
    const headers=['PERIODO / MES','Leads que completaron la encuesta',
      '% de leads que facturan USD 5,000 o más',
      '% de leads con disposición de inversión de al menos USD 3,000',
      '% leads calificados por encuesta (dispuestos y facturan 5k+ / facturan 5k+)'];
    const output=[headers];
    for(const month of months.reverse()){
      const entries=[...(monthlySurveys.get(month)||new Map()).values()];
      const total=entries.length;
      const high=entries.filter(s=>VSL20_income_(s.income)>=1).length;
      const willing=entries.filter(s=>VSL20_invest_(s.invest)==='SI').length;
      const qualified=entries.filter(s=>VSL20_income_(s.income)>=1&&VSL20_invest_(s.invest)==='SI').length;
      output.push([month,total,total?high/total:0,total?willing/total:0,high?qualified/high:0]);
    }
    const statusHeaders=['PERIODO / MES','ESTADO DE AGENDA',
      '# Leads que dijeron "Sí, soy empresario"',
      '# Leads que dijeron "No, saldré de esta página de inmediato"',
      'Leads que facturan menos de USD 5,000 / mes',
      'Leads que facturan entre USD 5,000 y 10,000 / mes',
      'Leads que facturan entre USD 10,000 y 20,000 / mes',
      'Leads que facturan entre USD 20,000 y 50,000 / mes',
      'Leads que facturan más de USD 50,000 / mes',
      '3 principales cuellos de botella para escalar',
      '# Leads dispuestos a invertir al menos USD 3,000',
      '# Leads que no cuentan con ese presupuesto',
      '# Leads que confirmaron que contestarán la llamada',
      '# Leads que dijeron que no contestarán la llamada'];
    const statusRows=[statusHeaders];
    for(const month of months){
      for(const status of ['CONFIRMADO','ASISTIÓ','CANCELADO','NO ASISTIÓ']){
        const persons=selected.get(month+'|'+status)||new Map();
        const agg=VSL20_new_();
        for(const item of persons.values())VSL20_add_(agg,item.survey);
        const top=[...agg.bottlenecks.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,3).map(([name,count])=>name+' ('+count+')').join(' | ');
        statusRows.push([month,status,agg.yes,agg.no,...agg.income,top,agg.investYes,agg.investNo,agg.callYes,agg.callNo]);
      }
    }
    const detailHeaders=['PERIODO / MES','ESTADO DE AGENDA','NOMBRE','WHATSAPP','CORREO','FECHA DE REUNIÓN','FECHA DE RESPUESTA','_Appointment ID','_Contact ID','_Opportunity ID','_Submission ID','¿Es empresario?','Ingreso promedio 3 meses','Cuello de botella','Disposición a invertir USD 3,000','Confirmación de contacto'];
    const detailRows=[];
    for(const persons of selected.values())for(const x of persons.values()){
      const z=x.survey;
      detailRows.push([x.month,x.status,z.name,z.phone,z.email,Utilities.formatDate(x.appointmentDate,VSL20.timezone,'yyyy-MM-dd HH:mm'),Utilities.formatDate(z.date,VSL20.timezone,'yyyy-MM-dd HH:mm'),x.appointmentId,x.contactId,x.opportunityId,z.id,z.entrepreneur,z.income,z.bottleneck,z.invest,z.call]);
    }
    detailRows.sort((a,b)=>String(b[0]).localeCompare(String(a[0]))||String(a[1]).localeCompare(String(b[1]))||String(a[2]).localeCompare(String(b[2])));
    return {surveys:{columns:headers,rows:output.slice(1),sourceSheet:VSL20.surveys,truncated:false},
      surveyStatus:{columns:statusHeaders,rows:statusRows.slice(1),sourceSheet:VSL20.appointments,truncated:false},
      detail:{columns:detailHeaders,rows:detailRows,sourceSheet:VSL20.surveys,truncated:false},stats};
  }
}
function VSL_RANGE_VALIDATE_(from,to){
  const pattern=/^\d{4}-\d{2}-\d{2}$/;
  if(!pattern.test(from)||!pattern.test(to))throw Error('startDate y endDate deben tener formato YYYY-MM-DD');
  const valid=x=>{const d=new Date(x+'T12:00:00Z');return !isNaN(d.getTime())&&d.toISOString().slice(0,10)===x;};
  if(!valid(from)||!valid(to)||from>to)throw Error('Rango de fechas inválido');
  const days=Math.round((new Date(to+'T12:00:00Z')-new Date(from+'T12:00:00Z'))/86400000)+1;
  if(days>366)throw Error('Selecciona como máximo 366 días por consulta');
}
function VSL_RANGE_QUALITY_(from,to){
  const ss=SpreadsheetApp.openById(VSL_KPI_CFG.spreadsheetId);
  const leads=VSL_KPI_READ_(ss,VSL_KPI_CFG.leadsSheet,['Opportunity ID','Secuencia','Fase','Creado el','VSL Origen','Estado de agenda']);
  const appointments=VSL_KPI_READ_(ss,VSL_KPI_CFG.appointmentsSheet,['_Appointment ID','_Opportunity ID','_Calendar ID','Estado cita','Fecha cita','_Deleted','_Match Status']);
  const periods=[{label:from+' / '+to,from,to}];
  const l=VSL_RANGE_INDEX_(leads,periods);
  const a=VSL_RANGE_APPOINTMENTS_(appointments,l.knownOpportunityIds,periods);
  const x=l.byPeriod[0],y=a.periods[0],total=x.leads.size;
  const columns=['EMBUDO VSL/CLOSER','LEADS CAPTADOS','AGENDADOS AUTOMÁTICO','% AGENDADOS AUTOMÁTICO','SIN AGENDAMIENTO AUTOMÁTICO','% SIN AGENDAMIENTO AUTOMÁTICO','TOTAL DE AGENDAMIENTOS','ASISTENCIA A CITAS','% ASISTENCIA A CITAS','LEADS NO CALIFICADOS','% LEADS NO CALIFICADOS','TOTAL DE SETEOS','NO ASISTIERON','CITAS CON MATCH','CITAS SIN MATCH'];
  return {columns,rows:[[periods[0].label,total,x.automatic.size,VSL_KPI_RATIO_(x.automatic.size,total),x.pending.size,VSL_KPI_RATIO_(x.pending.size,total),y.total.size,y.attended.size,VSL_KPI_RATIO_(y.attended.size,y.total.size),x.unqualified.size,VSL_KPI_RATIO_(x.unqualified.size,total),x.seteos.size,y.noShow.size,y.matched.size,y.unmatched.size]],sourceSheet:VSL_KPI_CFG.leadsSheet,truncated:false};
}
function VSL_RANGE_BUILD_(from,to){
  VSL_RANGE_VALIDATE_(from,to);
  const quality=VSL_RANGE_QUALITY_(from,to);
  const survey=VSL_RANGE_SURVEYS_(from,to);
  return {success:true,generatedAt:Utilities.formatDate(new Date(),'America/Lima',"yyyy-MM-dd'T'HH:mm:ssXXX"),timeZone:'America/Lima',filter:{startDate:from,endDate:to,inclusive:true},quality,surveys:survey.surveys,surveyStatus:survey.surveyStatus,appointmentsByFunnel:VSL_FUNNEL_REPORT_([{label:from+' / '+to,from,to}]),diagnostics:{available:true,details:{'Fecha inicial':from,'Fecha final':to,'Citas válidas':survey.stats.totalCitas,'Citas con encuesta previa':survey.stats.conEncuesta}},note:'Leads por creación; citas por fecha de reunión; encuestas por respuesta.'};
}
function VSL_RANGO_PROBAR(){
  const r=VSL_RANGE_BUILD_('2026-10-10','2026-10-20');
  Logger.log(JSON.stringify({ok:true,filter:r.filter,quality:r.quality.rows,appointments:r.appointmentsByFunnel.rows}));
  return r;
}


/**
 * Convierte los periodos históricos de Tabla 1 en meses calendario completos
 * EXCLUSIVAMENTE para Tabla 3. No modifica los periodos de calidad VSL.
 * Ejemplo: 1-20 y 21-27 octubre => 1-31 octubre, sin duplicar el mes.
 */
function VSL_FUNNEL_FULL_MONTH_PERIODS_(periods) {
  if (!Array.isArray(periods) || !periods.length) throw Error('Tabla 3: faltan periodos históricos');
  const months = new Set();
  periods.forEach(p => {
    const from = String(p.from || ''), to = String(p.to || '');
    VSL_RANGE_VALIDATE_(from, to);
    let year = Number(from.slice(0, 4)), month = Number(from.slice(5, 7));
    const last = to.slice(0, 7);
    for (let guard = 0; guard < 240; guard++) {
      const key = year + '-' + String(month).padStart(2, '0');
      if (key > last) break;
      months.add(key);
      month++;
      if (month > 12) { month = 1; year++; }
    }
  });
  return [...months].sort((a, b) => b.localeCompare(a)).map(m => {
    const year = Number(m.slice(0, 4)), month = Number(m.slice(5, 7));
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {label:m, from:m+'-01', to:m+'-'+String(lastDay).padStart(2, '0')};
  });
}

// TABLA 3: CALIDAD DE AGENDAMIENTOS POR EMBUDO.
// La API devuelve datos; la posición visual debajo de Tabla 2 se define en Next.js.
const VSL_FUNNEL_GROUPS_ = [
  {name:'ORGÁNICO EQUIPO + ORGÁNICO CÍRCULO', ids:['yuWa4NolnVFmsURv7B7Q','mvIUSeyGl6PvbEzue8za']},
  {name:'VSL PAGO CÍRCULO + VSL PAGO EQUIPO',ids:['2stEL9p5aBxmHO5N7D8m','pMZfD4DFxhQCJHC9zoK0']},
  {name:'LIG CÍRCULO + LIG EQUIPO',ids:['zjDox3bYqGMgJm4wM7Ov','8ERAp1igdFr3k7RlTHFk']}
];
function VSL_FUNNEL_REPORT_(periods){
  const ss=SpreadsheetApp.openById(VSL_KPI_CFG.spreadsheetId);
  const src=VSL_KPI_READ_(ss,VSL_KPI_CFG.appointmentsSheet,['_Appointment ID','_Calendar ID','Estado cita','Fecha cita','_Deleted']);
  const calendarToGroup=new Map();
  VSL_FUNNEL_GROUPS_.forEach((g,i)=>g.ids.forEach(id=>calendarToGroup.set(id,i)));
  const buckets=VSL_FUNNEL_GROUPS_.map(()=>periods.map(()=>new Map()));
  let skipped=0;
  for(const row of src.rows){
    const id=String(VSL_KPI_CELL_(row,src,'_Appointment ID')||'').trim();
    const cal=String(VSL_KPI_CELL_(row,src,'_Calendar ID')||'').trim();
    if(!id||!calendarToGroup.has(cal))continue;
    if(['true','1','yes','si'].includes(VSL_KPI_NORMAL_(VSL_KPI_CELL_(row,src,'_Deleted'))))continue;
    const day=VSL_KPI_DATE_(VSL_KPI_CELL_(row,src,'Fecha cita'));
    if(!day){skipped++;continue;}
    const status=VSL20_status_(VSL_KPI_CELL_(row,src,'Estado cita'));
    const updated=String(VSL_KPI_CELL_(row,src,'_Appointment Updated At')||'');
    const gi=calendarToGroup.get(cal);
    periods.forEach((p,i)=>{
      if(day<p.from||day>p.to)return;
      const old=buckets[gi][i].get(id);
      if(!old||updated>=old.updated)buckets[gi][i].set(id,{status,updated});
    });
  }
  const columns=['EMBUDO','PERIODO / MES','TOTAL AGENDAMIENTOS','ASISTIDOS','% ASISTIDOS','NO ASISTIDOS / RESTANTES','% NO ASISTIDOS / RESTANTES','CANCELADOS REALES','NO SHOW','CONFIRMADOS','OTROS'];
  const rows=[];
  VSL_FUNNEL_GROUPS_.forEach((g,gi)=>periods.forEach((p,pi)=>{
    const all=[...buckets[gi][pi].values()];
    const cancelled=all.filter(x=>x.status==='CANCELADO').length;
    // TOTAL AGENDAMIENTOS excluye CANCELADO; los demás estados sí suman al total.
    const a=all.filter(x=>x.status!=='CANCELADO');
    const n=a.length,att=a.filter(x=>x.status==='ASISTIÓ').length;
    const noShow=a.filter(x=>x.status==='NO ASISTIÓ').length;
    const confirmed=a.filter(x=>x.status==='CONFIRMADO').length;
    rows.push([g.name,p.label,n,att,n?att/n:0,n-att,n?(n-att)/n:0,cancelled,noShow,confirmed,n-att-noShow-confirmed]);
  }));
  return {columns,rows,sourceSheet:VSL_KPI_CFG.appointmentsSheet,truncated:false,skippedWithoutDate:skipped,percentColumns:[4,6]};
}


// ===== REPORTE COMERCIAL CORREGIDO V2 =====
// Fuentes de solo lectura: VSL DATA y APPOINTMENTS_MASTER.
// Una venta confirmada = Opportunity ID único con fase válida y Fecha de primer pago.
// Se exponen tanto oportunidades como clientes/producto únicos; NO se fuerza un total.
const COM_CFG = Object.freeze({
  spreadsheetId:'1h4zBoUfJqhc40GLegkOl1vIInGBPJHY5tQjsCQwax-0',
  sales:'VSL DATA', appointments:'APPOINTMENTS_MASTER', tz:'America/Lima',
  // Calendarios conocidos de VSL Pagado, Orgánico y LIG. Otros embudos
  // se clasifican por los campos Producto / Calendario cita cuando es posible.
  calendars:{
    'pMZfD4DFxhQCJHC9zoK0':'EQUIPO MILLONARIO',
    '2stEL9p5aBxmHO5N7D8m':'CIRCULO MILLONARIO',
    'yuWa4NolnVFmsURv7B7Q':'EQUIPO MILLONARIO',
    'mvIUSeyGl6PvbEzue8za':'CIRCULO MILLONARIO',
    'zjDox3bYqGMgJm4wM7Ov':'CIRCULO MILLONARIO',
    '8ERAp1igdFr3k7RlTHFk':'EQUIPO MILLONARIO'
  },
  stages:{
    'Lanzamiento I. Pagado OEI - EM':['Ventas Confirmadas'],
    'Lanzamiento Interno Gratuito':['Venta Confirmada / Reserva'],
    'Captación orgánica de leads | Setters':['Venta Confirmada/Reserva'],
    'VSL - Evento Presencial Gira':['Venta Confirmada / Reserva'],
    'VSL | Closers':['Venta Confirmada / Reserva','Venta Confirmada/Reserva']
  }
});
function COM_N_(v){return String(v==null?'':v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');}
function COM_S_(v){return String(v==null?'':v).trim();}
function COM_READ_(ss,name,required){
  const sh=ss.getSheetByName(name);if(!sh)throw Error('No existe hoja '+name);
  const data=sh.getDataRange().getValues();if(!data.length)throw Error('Hoja vacía '+name);
  const headers=data.shift().map(COM_N_),ix={};headers.forEach((h,i)=>{if(h&&ix[h]===undefined)ix[h]=i;});
  required.forEach(h=>{if(ix[COM_N_(h)]===undefined)throw Error('Falta columna '+h+' en '+name);});
  return {rows:data,headers,get:(r,...keys)=>{for(const k of keys){const i=ix[COM_N_(k)];if(i!==undefined&&COM_S_(r[i]))return r[i];}return '';},has:(...keys)=>keys.some(k=>ix[COM_N_(k)]!==undefined)};
}
function COM_DATE_(v){
  if(v instanceof Date)return isNaN(v.getTime())?'':Utilities.formatDate(v,COM_CFG.tz,'yyyy-MM-dd');
  const s=COM_S_(v);if(!s)return '';
  const lat=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(lat)return lat[3]+'-'+lat[2].padStart(2,'0')+'-'+lat[1].padStart(2,'0');
  if(/^\d{4}-\d{2}-\d{2}T/.test(s)&&/(Z|[+-]\d{2}:?\d{2})$/.test(s)){
    const d=new Date(s);return isNaN(d.getTime())?'':Utilities.formatDate(d,COM_CFG.tz,'yyyy-MM-dd');
  }
  const iso=s.match(/^(\d{4}-\d{2}-\d{2})/);return iso?iso[1]:'';
}
function COM_TS_(v){if(v instanceof Date)return v.getTime();const d=new Date(COM_S_(v));return isNaN(d.getTime())?0:d.getTime();}
function COM_STATUS_(v){const n=COM_N_(v);if(/cancel|invalid/.test(n))return 'CANCELADO';if(/no.?show|no asist/.test(n))return 'NO_SHOW';if(/showed|asist|attended|completed/.test(n))return 'ASISTIO';if(/confirm|booked|agend|scheduled|^new$/.test(n))return 'CONFIRMADO';return 'OTRO';}
function COM_PRODUCT_(v){const n=COM_N_(v);if(/circulo/.test(n))return 'CIRCULO MILLONARIO';if(/equipo/.test(n))return 'EQUIPO MILLONARIO';if(/gira/.test(n))return 'GIRA / OTROS';return '';}
function COM_AMOUNT_(v){if(typeof v==='number')return isFinite(v)?v:NaN;let s=COM_S_(v).replace(/[^\d,.-]/g,'');if(!s)return NaN;
  if(s.includes(',')&&s.includes('.'))s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
  else if(s.includes(','))s=s.replace(',','.');return Number(s);
}
function COM_MONTH_OK_(m){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(m))throw Error('month debe ser YYYY-MM');return m;}
function COM_STAGE_OK_(p,s){return (COM_CFG.stages[p]||[]).some(x=>COM_N_(x)===COM_N_(s));}
function COM_CLOSER_(v){const n=COM_N_(v);if(!n)return '';const names={amaranta:'Amaranta Alfonso Krasnova',ezequiel:'Ezequiel Dario',fiorela:'Fiorela Bernales',evelyn:'Evelyn Lopez Horna',gabriel:'Gabriel Eduardo Mora De Hoyos'};
  for(const k in names){if(n===k||n===COM_N_(names[k]))return names[k];}return COM_S_(v);
}
function COM_SOURCES_(){
  const ss=SpreadsheetApp.openById(COM_CFG.spreadsheetId);
  const sales=COM_READ_(ss,COM_CFG.sales,['Opportunity ID','Contact ID','Secuencia','Fase','Fecha de primer pago','Producto/Evento']);
  const ap=COM_READ_(ss,COM_CFG.appointments,['_Appointment ID','_Opportunity ID','_Contact ID','Estado cita','Fecha cita']);
  return {sales:sales,ap:ap};
}
function COM_BUILD_(month){
  month=COM_MONTH_OK_(month);
  return COM_BUILD_FROM_SOURCES_(month,COM_SOURCES_());
}
function COM_BUILD_FROM_SOURCES_(month,sources){
  month=COM_MONTH_OK_(month);
  const sales=sources.sales,ap=sources.ap;
  const diag={salesConfirmedAllDates:0,salesInMonth:0,salesAttributedByAppointment:0,salesAttributedByOpportunity:0,salesWithoutCloser:0,salesWithoutProduct:0,salesExcludedWithoutAppointment:0,duplicateOpportunityRows:0,duplicateCustomerProduct:0,invalidAmounts:0,missingPaymentAmount:0,appointmentsWithoutCloser:0,appointmentsUnknownProduct:0,appointmentsExcludedDeleted:0,unrecognizedCurrency:0};
  const latestAp=new Map();
  for(const r of ap.rows){const id=COM_S_(ap.get(r,'_Appointment ID'));if(!id)continue;const t=COM_TS_(ap.get(r,'_Appointment Updated At'));const old=latestAp.get(id);if(!old||t>=old.t)latestAp.set(id,{r,t});}
  const appointments=[],byOpp=new Map(),byContact=new Map();
  for(const [id,item] of latestAp){const r=item.r;
    if(['true','yes','si','1'].includes(COM_N_(ap.get(r,'_Deleted')))){diag.appointmentsExcludedDeleted++;continue;}
    const status=COM_STATUS_(ap.get(r,'Estado cita'));if(status==='CANCELADO')continue;
    const calId=COM_S_(ap.get(r,'_Calendar ID'));
    const product=COM_CFG.calendars[calId]||COM_PRODUCT_(ap.get(r,'Producto','Calendario cita'));
    if(!product){diag.appointmentsUnknownProduct++;continue;}
    const closer=COM_CLOSER_(ap.get(r,'Closer cita','Closer','Nombre closer','Usuario asignado'));
    if(!closer)diag.appointmentsWithoutCloser++;
    const day=COM_DATE_(ap.get(r,'Fecha cita'));if(!day)continue;
    const a={id,opp:COM_S_(ap.get(r,'_Opportunity ID')),contact:COM_S_(ap.get(r,'_Contact ID')),product,closer,status,day,ts:COM_TS_(ap.get(r,'Fecha cita')),created:COM_DATE_(ap.get(r,'_Appointment Created At'))};
    appointments.push(a);
    if(a.opp){if(!byOpp.has(a.opp))byOpp.set(a.opp,[]);byOpp.get(a.opp).push(a);}
    if(a.contact){if(!byContact.has(a.contact))byContact.set(a.contact,[]);byContact.get(a.contact).push(a);}
  }
  const latestSales=new Map();
  for(const r of sales.rows){const id=COM_S_(sales.get(r,'Opportunity ID'));if(!id)continue;const t=COM_TS_(sales.get(r,'GHL Updated At'));const old=latestSales.get(id);if(old)diag.duplicateOpportunityRows++;if(!old||t>=old.t)latestSales.set(id,{r,t});}
  const groups=new Map();
  function bucket(closer,product){const k=COM_N_(closer)+'|'+product;if(!groups.has(k))groups.set(k,{closer,product,agendas:0,asistencias:0,ventas:0,clientesUnicos:0,cashPEN:0,cashUSD:0});return groups.get(k);}
  // ASISTENCIAS: una cita única (última versión por Appointment ID),
  // no eliminada, con estado ASISTIO y fecha de reunión dentro del mes (Lima).
  // Incluye todos los embudos cuyo producto pueda identificarse en el calendario
  // o en los campos Producto / Calendario cita. No exige venta ni match.
  // Para evitar atribuciones inventadas, requiere Closer cita explícito.
  // Se conservan los criterios previos de AGENDAS y VENTAS.
  const attendanceAudit={showedInMonth:0,counted:0,withoutCloser:0,otherCalendar:0,
    missingMeetingDate:0,otherStatusInMonth:0,byCloserProduct:{},
    byCalendar:{},unclassifiedProduct:0};
  for(const a of appointments){
    let agendaCloser=a.closer;
    if(!agendaCloser&&a.opp&&latestSales.has(a.opp)){
      const r=latestSales.get(a.opp).r;
      agendaCloser=COM_CLOSER_(sales.get(r,'Opportunity assigned','Asignado'));
    }
    if(!agendaCloser)agendaCloser='SIN CLOSER IDENTIFICADO';
    if(a.created.slice(0,7)===month)bucket(agendaCloser,a.product).agendas++;
    if(a.day.slice(0,7)!==month)continue;
    if(a.status!=='ASISTIO'){
      attendanceAudit.otherStatusInMonth++;continue;
    }
    attendanceAudit.showedInMonth++;
    const raw=latestAp.get(a.id).r;
    const calendarId=COM_S_(ap.get(raw,'_Calendar ID'));
    const calendarProduct=COM_CFG.calendars[calendarId]||COM_PRODUCT_(ap.get(raw,'Producto','Calendario cita'));
    if(!calendarProduct){attendanceAudit.unclassifiedProduct++;continue;}
    // CORRECCION: antes, si la cita no tenia Closer cita explicito, la
    // asistencia se descartaba por completo (withoutCloser++; continue),
    // aunque la Opportunity vinculada si tuviera un closer asignado. Ahora
    // se usa el mismo fallback que ya se usa arriba para agendas
    // (agendaCloser = Closer cita, o si no hay, Opportunity assigned/
    // Asignado de la oportunidad vinculada, o 'SIN CLOSER IDENTIFICADO').
    // withoutCloser queda solo como diagnostico de cuantas asistencias no
    // tenian Closer cita explicito en el calendario, sin perder la cita.
    if(!a.closer)attendanceAudit.withoutCloser++;
    bucket(agendaCloser,calendarProduct).asistencias++;
    attendanceAudit.counted++;
    const key=agendaCloser+' | '+calendarProduct;
    attendanceAudit.byCloserProduct[key]=(attendanceAudit.byCloserProduct[key]||0)+1;
    const calKey=calendarId||'SIN_CALENDAR_ID';
    attendanceAudit.byCalendar[calKey]=(attendanceAudit.byCalendar[calKey]||0)+1;
  }
  const audit=[],uniqueCustomerProduct=new Map();
  for(const [oppId,item] of latestSales){const r=item.r,pipeline=COM_S_(sales.get(r,'Secuencia')),stage=COM_S_(sales.get(r,'Fase'));
    if(!COM_STAGE_OK_(pipeline,stage))continue;diag.salesConfirmedAllDates++;
    const payment=COM_DATE_(sales.get(r,'Fecha de primer pago'));
    if(payment.slice(0,7)!==month)continue;diag.salesInMonth++;
    const contact=COM_S_(sales.get(r,'Contact ID'));
    let product=COM_PRODUCT_(sales.get(r,'Producto/Evento'));
    let candidates=(byOpp.get(oppId)||[]).filter(a=>a.day<=payment&&a.status!=='NO_SHOW');
    let match='OPPORTUNITY_ID';
    if(!candidates.length&&contact){candidates=(byContact.get(contact)||[]).filter(a=>a.day<=payment&&a.status!=='NO_SHOW');match='CONTACT_ID';}
    // Preferir cita del mismo producto, sin impedir ventas con cita ausente.
    if(product){const same=candidates.filter(a=>a.product===product);if(same.length)candidates=same;}
    candidates.sort((a,b)=>((b.status==='ASISTIO')-(a.status==='ASISTIO'))||b.ts-a.ts);
    const chosen=candidates[0]||null;
    if(!product&&chosen)product=chosen.product;
    if(!product){product='SIN PRODUCTO IDENTIFICADO';diag.salesWithoutProduct++;}
    const currency=COM_N_(sales.get(r,'Tipo de moneda del precio acordado','Moneda del monto acordado'));
    const amount=COM_AMOUNT_(sales.get(r,'Monto de cuota 1'));
    // CORRECCION (no atribuir ventas sin cita vinculada): antes, si no se
    // encontraba ninguna cita (ni por Opportunity ID ni por Contact ID), la
    // venta igual se contaba usando el closer de "Opportunity assigned"/
    // "Asignado" de la propia Opportunity. El problema es que ese campo no
    // es evidencia de que ESE closer haya sostenido una sesión real: puede
    // venir de otro embudo (OEI, LIG, orgánico) donde nunca hubo cita de
    // VSL | Closers, e igual se sumaba a su conversión de asistencias.
    // Ahora: sin cita vinculada, la venta NO se cuenta para ningún closer
    // (ni ventas, ni cash, ni clientesUnicos). Sigue quedando en el audit
    // con closerSource:'SIN_CITA_EXCLUIDA' para que puedas revisarla y
    // decidir manualmente, pero no infla a nadie.
    if(!chosen){
      diag.salesExcludedWithoutAppointment++;
      audit.push({opportunityId:oppId,contactId:contact,pipeline,stage,product,closer:'',closerSource:'SIN_CITA_EXCLUIDA',paymentDate:payment,appointmentId:null,appointmentMatch:null,amount:Number.isFinite(amount)?amount:null,currency:currency||'',customerProductDuplicate:false,duplicateOfOpportunityId:null});
      continue;
    }
    const appointmentCloser=chosen.closer;
    const opportunityCloser=COM_CLOSER_(sales.get(r,'Opportunity assigned','Asignado'));
    const closer=appointmentCloser||opportunityCloser||'SIN CLOSER IDENTIFICADO';
    // CORRECCION (evita ventas duplicadas): la misma venta real puede
    // quedar registrada en DOS Opportunity ID distintos -por ejemplo, uno
    // creado en el pipeline del setter ("Captación orgánica de leads |
    // Setters") y otro en el pipeline del closer ("VSL | Closers")- para el
    // mismo Contact ID y mismo Producto. Antes, cada Opportunity ID sumaba
    // su propia venta y su propio cash, así que esa misma venta se contaba
    // dos veces en los totales y en el cuadro por closer (uniqueCustomerProduct
    // ya detectaba el duplicado, pero solo se usaba para "clientesUnicos",
    // no para frenar el conteo de "ventas"/cash).
    // Ahora: la PRIMERA Opportunity ID de este Contact ID + Producto en el
    // mes es la que se cuenta como venta (ventas, cash, clientesUnicos,
    // diagnósticos de atribución de closer). Cualquier Opportunity ID
    // posterior para el mismo Contact ID + Producto queda registrada en el
    // audit como duplicado (customerProductDuplicate:true), pero NO se
    // vuelve a sumar en ningún total, para no inflar las ventas.
    const customerKey=(contact||'OPP:'+oppId)+'|'+product;
    const isDuplicate=uniqueCustomerProduct.has(customerKey);
    if(isDuplicate){
      diag.duplicateCustomerProduct++;
    }else{
      uniqueCustomerProduct.set(customerKey,oppId);
      if(appointmentCloser)diag.salesAttributedByAppointment++;
      else if(opportunityCloser)diag.salesAttributedByOpportunity++;
      else diag.salesWithoutCloser++;
      if(!Number.isFinite(amount))diag.missingPaymentAmount++;
      const g=bucket(closer,product);g.ventas++;g.clientesUnicos++;
      if(Number.isFinite(amount)){if(/^(pen|sol|soles|s\/)/.test(currency))g.cashPEN+=amount;else if(/^(usd|dolar|\$)/.test(currency))g.cashUSD+=amount;else diag.unrecognizedCurrency++;}
    }
    audit.push({opportunityId:oppId,contactId:contact,pipeline,stage,product,closer,closerSource:appointmentCloser?'CITA':opportunityCloser?'OPORTUNIDAD_CON_CITA':'NO_IDENTIFICADO',paymentDate:payment,appointmentId:chosen.id,appointmentMatch:match,amount:Number.isFinite(amount)?amount:null,currency:currency||'',customerProductDuplicate:isDuplicate,duplicateOfOpportunityId:isDuplicate?uniqueCustomerProduct.get(customerKey):null});
  }
  const rows=[...groups.values()].sort((a,b)=>a.product.localeCompare(b.product)||a.closer.localeCompare(b.closer)).map(g=>({...g,conversion:g.asistencias?g.ventas/g.asistencias:null,cashPEN:Math.round(g.cashPEN*100)/100,cashUSD:Math.round(g.cashUSD*100)/100}));
  const totals={ventas:rows.reduce((n,r)=>n+r.ventas,0),clientesUnicosPorProducto:uniqueCustomerProduct.size,asistencias:rows.reduce((n,r)=>n+r.asistencias,0),agendas:rows.reduce((n,r)=>n+r.agendas,0),cashPEN:Math.round(rows.reduce((n,r)=>n+r.cashPEN,0)*100)/100,cashUSD:Math.round(rows.reduce((n,r)=>n+r.cashUSD,0)*100)/100};
  const byProduct={};rows.forEach(r=>{if(!byProduct[r.product])byProduct[r.product]={ventas:0,clientesUnicos:0};byProduct[r.product].ventas+=r.ventas;byProduct[r.product].clientesUnicos+=r.clientesUnicos;});
  return {success:true,month,timeZone:COM_CFG.tz,generatedAt:new Date().toISOString(),rows,totals,byProduct,diagnostics:{...diag,appointmentsRead:appointments.length,attendanceAudit},rules:{salesDate:'Fecha de primer pago',saleIdentity:'Opportunity ID único; clientes únicos por Contact ID + Producto',attribution:'Closer cita si existe; fallback Opportunity assigned/Asignado; sin cita también cuenta la venta',product:'Producto/Evento; fallback calendario',cash:'Monto de cuota 1, sin estimar pagos faltantes',conversion:'ventas/asistencias; asistencia con estado ASISTIO, Fecha cita, Closer cita y producto identificado en cualquier embudo'},audit};
}
function COM_API_RESPONSE_(month){const result=COM_BUILD_(month);delete result.audit;return result;}
function COM_API_PROBAR(){const r=COM_BUILD_('2026-10');Logger.log(JSON.stringify({totals:r.totals,byProduct:r.byProduct,diagnostics:r.diagnostics,rows:r.rows},null,2));return {totals:r.totals,byProduct:r.byProduct,diagnostics:r.diagnostics,rows:r.rows};}
function COM_API_AUDITAR_OCTUBRE(){const r=COM_BUILD_('2026-10');Logger.log(JSON.stringify(r.audit,null,2));return r.audit;}
function COM_API_DIAGNOSTICAR_COLUMNAS(){const ss=SpreadsheetApp.openById(COM_CFG.spreadsheetId);for(const name of [COM_CFG.sales,COM_CFG.appointments]){const sh=ss.getSheetByName(name);Logger.log(name+': '+JSON.stringify(sh?sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0]:null));}}

/**
 * 21_VSL_CALIDAD_LEADS_EMBUDOS.gs
 *
 * Tablas "ANÁLISIS DE CALIDAD DE LEADS" para los embudos
 * ORGÁNICO (Captación orgánica de leads | Setters) y LIG
 * (Lanzamiento Interno Gratuito).
 *
 * NO toca el embudo VSL | Closers ni sus funciones
 * (VSL_CALIDAD_LEADS_GENERAR, VSL_KPI_*, VSL_FUNNEL_REPORT_, etc.).
 *
 * A diferencia de la Tabla 1 (VSL | Closers), estos dos embudos
 * leen del sistema OPM multi-pipeline:
 * - Leads:        hoja "VSL DATA" (con espacio) — columnas
 *                 Opportunity ID, Secuencia, Fase, Creado el,
 *                 GHL Updated At.
 * - Agendamientos: hoja "APPOINTMENTS_MASTER" — columnas
 *                 _Appointment ID, Pipeline Key, Estado cita,
 *                 Fecha cita, _Deleted.
 *
 * Reutiliza los helpers genéricos ya existentes en este proyecto:
 * VSL_KPI_NORMAL_, VSL_KPI_DATE_, VSL_KPI_IN_, VSL_KPI_READ_,
 * VSL_KPI_CELL_, VSL_KPI_STATUS_, VSL_KPI_RATIO_ (definidos en
 * api.gs). Requiere que ese archivo esté en el mismo proyecto.
 *
 * Funciones a ejecutar:
 *   VSL_CALIDAD_LEADS_ORGANICO_GENERAR()
 *   VSL_CALIDAD_LEADS_LIG_GENERAR()
 *   VSL_CALIDAD_LEADS_EMBUDOS_GENERAR_TODOS()   <- ambas de una vez
 */

const VSL_EMBUDOS_CFG = Object.freeze({
  spreadsheetId: '1h4zBoUfJqhc40GLegkOl1vIInGBPJHY5tQjsCQwax-0',
  leadsSheet: 'VSL DATA',
  appointmentsSheet: 'APPOINTMENTS_MASTER',
  timeZone: 'America/Lima',
  // Mismos periodos históricos que la Tabla 1 (VSL_KPI_CFG.periods),
  // así las tres tablas quedan alineadas por columna.
  periods: VSL_KPI_CFG.periods
});

const VSL_EMBUDOS_LIST_ = [
  {
    key: 'CAPTACION_ORGANICA',
    pipelineName: 'Captación orgánica de leads | Setters',
    unqualifiedStage: 'Lead No Calificado',
    reportSheet: 'VSL_CALIDAD_LEADS_ORGANICO',
    title: 'ANÁLISIS DE CALIDAD DE LEADS DEL EMBUDO ORGÁNICO'
  },
  {
    key: 'LIG',
    pipelineName: 'Lanzamiento Interno Gratuito',
    unqualifiedStage: 'Lead no calificado',
    reportSheet: 'VSL_CALIDAD_LEADS_LIG',
    title: 'ANÁLISIS DE CALIDAD DE LEADS DEL EMBUDO LIG'
  }
];

// Última fila por Opportunity ID, filtrando por Secuencia = pipeline del embudo.
function VSL_EMBUDO_INDEX_(source, pipelineName) {
  const latestById = new Map();
  source.rows.forEach((row, index) => {
    if (VSL_KPI_NORMAL_(VSL_KPI_CELL_(row, source, 'Secuencia')) !== VSL_KPI_NORMAL_(pipelineName)) return;
    const id = String(VSL_KPI_CELL_(row, source, 'Opportunity ID') || '').trim();
    if (!id) return;
    const updated = String(VSL_KPI_CELL_(row, source, 'GHL Updated At') || '').trim();
    const old = latestById.get(id);
    if (!old || updated > old.updated || (updated === old.updated && index > old.index)) {
      latestById.set(id, { row: row, updated: updated, index: index });
    }
  });
  return latestById;
}

// Leads captados (cohorte por Creado el) y leads no calificados (fase actual) por periodo.
function VSL_EMBUDO_LEADS_BY_PERIOD_(source, latestById, unqualifiedStage) {
  const unqualifiedNorm = VSL_KPI_NORMAL_(unqualifiedStage);
  const byPeriod = VSL_EMBUDOS_CFG.periods.map(() => ({ leads: new Set(), unqualified: new Set() }));
  let missingDate = 0;
  latestById.forEach(({ row }, id) => {
    const date = VSL_KPI_DATE_(VSL_KPI_CELL_(row, source, 'Creado el'));
    if (!date) { missingDate++; return; }
    const stage = VSL_KPI_NORMAL_(VSL_KPI_CELL_(row, source, 'Fase'));
    VSL_EMBUDOS_CFG.periods.forEach((period, i) => {
      if (!VSL_KPI_IN_(date, period)) return;
      byPeriod[i].leads.add(id);
      if (stage === unqualifiedNorm) byPeriod[i].unqualified.add(id);
    });
  });
  return { byPeriod: byPeriod, missingDate: missingDate };
}

// Agendamientos (todas las citas del embudo, EXCLUYENDO solo las canceladas) y asistencia, por periodo.
function VSL_EMBUDO_APPOINTMENTS_BY_PERIOD_(source, pipelineKey) {
  const periods = VSL_EMBUDOS_CFG.periods.map(() => ({ total: new Set(), attended: new Set() }));
  const seen = new Set();
  let skippedWithoutId = 0, skippedWithoutDate = 0, skippedDeleted = 0, skippedCancelled = 0;
  source.rows.forEach(row => {
    const key = String(VSL_KPI_CELL_(row, source, 'Pipeline Key') || '').trim();
    if (key !== pipelineKey) return;
    const id = String(VSL_KPI_CELL_(row, source, '_Appointment ID') || '').trim();
    if (!id) { skippedWithoutId++; return; }
    if (seen.has(id)) return;
    seen.add(id);
    if (VSL_KPI_NORMAL_(VSL_KPI_CELL_(row, source, '_Deleted')) === 'true') { skippedDeleted++; return; }
    const date = VSL_KPI_DATE_(VSL_KPI_CELL_(row, source, 'Fecha cita'));
    if (!date) { skippedWithoutDate++; return; }
    const estadoNorm = VSL_KPI_NORMAL_(VSL_KPI_CELL_(row, source, 'Estado cita'));
    // Única exclusión pedida: canceladas. Todo lo demás cuenta como agendamiento.
    if (/cancel/.test(estadoNorm)) { skippedCancelled++; return; }
    const status = VSL_KPI_STATUS_(VSL_KPI_CELL_(row, source, 'Estado cita'));
    VSL_EMBUDOS_CFG.periods.forEach((p, i) => {
      if (!VSL_KPI_IN_(date, p)) return;
      periods[i].total.add(id);
      if (status === 'ASISTIO') periods[i].attended.add(id);
    });
  });
  return { periods: periods, skippedWithoutId: skippedWithoutId, skippedWithoutDate: skippedWithoutDate, skippedDeleted: skippedDeleted, skippedCancelled: skippedCancelled };
}

function VSL_EMBUDO_CALIDAD_GENERAR_(funnel) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Ya hay otra ejecución del reporte en curso.');
  try {
    const ss = SpreadsheetApp.openById(VSL_EMBUDOS_CFG.spreadsheetId);
    const leads = VSL_KPI_READ_(ss, VSL_EMBUDOS_CFG.leadsSheet,
      ['Opportunity ID', 'Secuencia', 'Fase', 'Creado el', 'GHL Updated At']);
    const appointments = VSL_KPI_READ_(ss, VSL_EMBUDOS_CFG.appointmentsSheet,
      ['_Appointment ID', 'Pipeline Key', 'Estado cita', 'Fecha cita', '_Deleted']);

    const latestById = VSL_EMBUDO_INDEX_(leads, funnel.pipelineName);
    const leadsResult = VSL_EMBUDO_LEADS_BY_PERIOD_(leads, latestById, funnel.unqualifiedStage);
    const appointmentsResult = VSL_EMBUDO_APPOINTMENTS_BY_PERIOD_(appointments, funnel.key);

    const headings = ['EMBUDO VSL/CLOSER', 'LEADS CAPTADOS', 'TOTAL DE AGENDAMIENTOS',
      'ASISTENCIA A CITAS', '% ASISTENCIA A CITAS', 'LEADS NO CALIFICADOS', '% LEADS NO CALIFICADOS'];

    const output = VSL_EMBUDOS_CFG.periods.map((period, i) => {
      const l = leadsResult.byPeriod[i], a = appointmentsResult.periods[i];
      const leadsCount = l.leads.size;
      return [period.label, leadsCount, a.total.size, a.attended.size,
        VSL_KPI_RATIO_(a.attended.size, a.total.size),
        l.unqualified.size, VSL_KPI_RATIO_(l.unqualified.size, leadsCount)];
    });

    let sheet = ss.getSheetByName(funnel.reportSheet);
    if (!sheet) sheet = ss.insertSheet(funnel.reportSheet);
    // Solo esta hoja se reconstruye; las hojas de origen permanecen intactas.
    sheet.clear();
    if (sheet.getMaxColumns() < headings.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), headings.length - sheet.getMaxColumns());
    sheet.getRange(1, 1, 1, headings.length).merge()
      .setValue(funnel.title)
      .setBackground('#374151').setFontColor('#ffffff').setFontWeight('bold')
      .setHorizontalAlignment('center');
    sheet.getRange(2, 1, 1, headings.length).setValues([headings])
      .setBackground('#e5e7eb').setFontWeight('bold').setWrap(true)
      .setHorizontalAlignment('center');
    if (output.length) sheet.getRange(3, 1, output.length, headings.length).setValues(output);
    [5, 7].forEach(c => sheet.getRange(3, c, Math.max(1, output.length), 1).setNumberFormat('0%'));
    sheet.setFrozenRows(2);
    sheet.setRowHeight(2, 64);
    sheet.setColumnWidth(1, 235);
    for (let c = 2; c <= headings.length; c++) sheet.setColumnWidth(c, 155);
    sheet.getRange(2, 1, output.length + 1, headings.length).setBorder(true, true, true, true, true, true);

    const noteRow = output.length + 5;
    sheet.getRange(noteRow, 1).setValue('CRITERIOS Y ADVERTENCIAS').setFontWeight('bold');
    const notes = [
      'Leads captados y leads no calificados: cohorte por fecha de creación de la oportunidad (hora Lima) en la hoja "' + VSL_EMBUDOS_CFG.leadsSheet + '", filtrando por Secuencia = "' + funnel.pipelineName + '", usando el estado ACTUAL de cada oportunidad.',
      'Leads no calificados = oportunidades de la cohorte actualmente en la fase "' + funnel.unqualifiedStage + '".',
      'Total de agendamientos: todas las citas de "' + VSL_EMBUDOS_CFG.appointmentsSheet + '" con Pipeline Key = "' + funnel.key + '" por fecha de cita, EXCLUYENDO únicamente las canceladas. Una cita por Appointment ID; excluye _Deleted=TRUE.',
      'Asistencia a citas = estado de cita "showed"/"asistido" (y variantes equivalentes). % asistencia = asistidas / total de agendamientos del periodo (no sobre leads captados).',
      'El reporte refleja los datos disponibles en ambas hojas en el momento de ejecución. Sincroniza primero OPM (leads) y APPOINTMENTS_MASTER (citas) antes de generar.'
    ];
    sheet.getRange(noteRow + 1, 1, notes.length, 1).setValues(notes.map(n => [n]));
    sheet.getRange(noteRow + 1, 1, notes.length, 1).setWrap(true);

    const summary = {
      success: true, funnel: funnel.key, periods: VSL_EMBUDOS_CFG.periods.length,
      sourceLeadRows: leads.rows.length, sourceAppointmentRows: appointments.rows.length,
      leadsWithoutValidCreationDate: leadsResult.missingDate,
      appointmentsWithoutId: appointmentsResult.skippedWithoutId,
      appointmentsWithoutDate: appointmentsResult.skippedWithoutDate,
      deletedAppointmentsExcluded: appointmentsResult.skippedDeleted,
      cancelledAppointmentsExcluded: appointmentsResult.skippedCancelled,
      reportSheet: funnel.reportSheet,
      rows: output.map((r, i) => ({
        period: VSL_EMBUDOS_CFG.periods[i].label, leads: r[1], appointments: r[2], attended: r[3], unqualified: r[5]
      }))
    };
    console.log(JSON.stringify(summary, null, 2));
    return summary;
  } finally {
    lock.releaseLock();
  }
}

function VSL_CALIDAD_LEADS_ORGANICO_GENERAR() {
  return VSL_EMBUDO_CALIDAD_GENERAR_(VSL_EMBUDOS_LIST_[0]);
}

function VSL_CALIDAD_LEADS_LIG_GENERAR() {
  return VSL_EMBUDO_CALIDAD_GENERAR_(VSL_EMBUDOS_LIST_[1]);
}

// Genera ambas tablas en una sola llamada. Esta es la que se
// engancha en VSL_REPORTES_GENERAR_TODOS() (ver instrucciones).
function VSL_CALIDAD_LEADS_EMBUDOS_GENERAR_TODOS() {
  const organico = VSL_CALIDAD_LEADS_ORGANICO_GENERAR();
  const lig = VSL_CALIDAD_LEADS_LIG_GENERAR();
  Logger.log('Embudos ORGÁNICO y LIG finalizados.');
  return { organico: organico, lig: lig };
}

// Validación de origen sin escribir ninguna hoja (análogo a VSL_CALIDAD_LEADS_VERIFICAR).
function VSL_CALIDAD_LEADS_EMBUDOS_VERIFICAR() {
  const ss = SpreadsheetApp.openById(VSL_EMBUDOS_CFG.spreadsheetId);
  const leads = VSL_KPI_READ_(ss, VSL_EMBUDOS_CFG.leadsSheet,
    ['Opportunity ID', 'Secuencia', 'Fase', 'Creado el', 'GHL Updated At']);
  const appointments = VSL_KPI_READ_(ss, VSL_EMBUDOS_CFG.appointmentsSheet,
    ['_Appointment ID', 'Pipeline Key', 'Estado cita', 'Fecha cita', '_Deleted']);
  const result = {
    valid: true, leadRows: leads.rows.length, appointmentRows: appointments.rows.length,
    periods: VSL_EMBUDOS_CFG.periods, funnels: VSL_EMBUDOS_LIST_.map(f => ({ key: f.key, pipelineName: f.pipelineName }))
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}
// Trends reuse the exact commercial calculation; only the source reads are shared.
function COM_TRENDS_MONTHS_(from,to) {
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(from)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(to)||from>to)throw Error('from y to deben ser YYYY-MM y estar en orden');
  const first=Number(from.slice(0,4))*12+Number(from.slice(5))-1,last=Number(to.slice(0,4))*12+Number(to.slice(5))-1;
  if(last-first+1>12)throw Error('commercial_trends admite como máximo 12 meses');
  const months=[];
  for(let cursor=first;cursor<=last;cursor++)months.push(Math.floor(cursor/12)+'-'+String(cursor%12+1).padStart(2,'0'));
  return months;
}
function COM_TRENDS_RESPONSE_(from,to) {
  const started=Date.now(),months=COM_TRENDS_MONTHS_(from,to),sources=COM_SOURCES_(),series=[];
  for(const month of months) {
    if(Date.now()-started>45000)throw Error('Las tendencias excedieron el presupuesto de cálculo; selecciona menos meses');
    const report=COM_BUILD_FROM_SOURCES_(month,sources);
    for(const row of report.rows) {
      if(row.product!=='EQUIPO MILLONARIO'&&row.product!=='CIRCULO MILLONARIO')continue;
      series.push({month:month,product:row.product,closer:row.closer,asistencias:row.asistencias,ventas:row.ventas,conversion:row.conversion});
    }
  }
  return {success:true,from:from,to:to,months:months,series:series,generatedAt:new Date().toISOString()};
}
/** Read-only real-data parity check. Intentionally rereads sources for the independent comparison. */
function COM_TRENDS_VERIFY_(from,to) {
  const trends=COM_TRENDS_RESPONSE_(from,to),expected=[];
  for(const month of trends.months)for(const row of COM_BUILD_(month).rows) {
    if(row.product==='EQUIPO MILLONARIO'||row.product==='CIRCULO MILLONARIO')expected.push({month:month,product:row.product,closer:row.closer,asistencias:row.asistencias,ventas:row.ventas,conversion:row.conversion});
  }
  if(JSON.stringify(trends.series)!==JSON.stringify(expected))throw Error('Tendencias y comercial no coinciden; comprobar cambios de datos durante la auditoría');
  const result={success:true,months:trends.months,records:expected.length};Logger.log(JSON.stringify(result));return result;
}
