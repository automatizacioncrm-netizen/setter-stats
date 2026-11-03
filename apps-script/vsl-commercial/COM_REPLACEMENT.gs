/** Reemplaza únicamente el bloque COM_* del API.gs suministrado.
 * No agregar junto al bloque original (duplicaría const COM_CFG).
 * doGet/doPost, VSL_KPI_CFG, VSL20 y VSL_FUNNEL_GROUPS_ permanecen intactos.
 */
const COM_CFG = Object.freeze({
  spreadsheetId:'1h4zBoUfJqhc40GLegkOl1vIInGBPJHY5tQjsCQwax-0',
  sales:'VSL_DATA', appointments:'VSL_APPOINTMENTS', tz:'America/Lima',
  calendars:{'pMZfD4DFxhQCJHC9zoK0':'EQUIPO MILLONARIO','2stEL9p5aBxmHO5N7D8m':'CIRCULO MILLONARIO'},
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
function COM_BUILD_(month){
  month=COM_MONTH_OK_(month);
  const ss=SpreadsheetApp.openById(COM_CFG.spreadsheetId);
  const sales=COM_READ_(ss,COM_CFG.sales,['Opportunity ID','Contact ID','Secuencia','Fase','Fecha de primer pago','Producto/Evento']);
  const ap=COM_READ_(ss,COM_CFG.appointments,['_Appointment ID','_Opportunity ID','_Contact ID','Estado cita','Fecha cita']);
  const diag={salesConfirmedAllDates:0,salesInMonth:0,salesAttributedByAppointment:0,salesAttributedByOpportunity:0,salesWithoutCloser:0,salesWithoutProduct:0,duplicateOpportunityRows:0,duplicateCustomerProduct:0,invalidAmounts:0,missingPaymentAmount:0,appointmentsWithoutCloser:0,appointmentsUnknownProduct:0,appointmentsExcludedDeleted:0,unrecognizedCurrency:0};
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
  // AGENDAS: preserva exactamente el procesamiento original utilizado por ventas.
  for(const a of appointments){
    let agendaCloser=a.closer;
    if(!agendaCloser&&a.opp&&latestSales.has(a.opp)){
      const r=latestSales.get(a.opp).r;
      agendaCloser=COM_CLOSER_(sales.get(r,'Opportunity assigned','Asignado'));
    }
    if(!agendaCloser)agendaCloser='SIN CLOSER IDENTIFICADO';
    if(a.created.slice(0,7)===month)bucket(agendaCloser,a.product).agendas++;
  }
  // ASISTENCIAS: lee TODAS las versiones originales, sin filtros de ventas/match.
  const attendanceAudit=COM_ATTENDANCE_BUILD_(ap,month,bucket);
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
    if(product){const same=candidates.filter(a=>a.product===product);if(same.length)candidates=same;}
    candidates.sort((a,b)=>((b.status==='ASISTIO')-(a.status==='ASISTIO'))||b.ts-a.ts);
    const chosen=candidates[0]||null;
    if(!product&&chosen)product=chosen.product;
    if(!product){product='SIN PRODUCTO IDENTIFICADO';diag.salesWithoutProduct++;}
    const appointmentCloser=chosen?chosen.closer:'';
    const opportunityCloser=COM_CLOSER_(sales.get(r,'Opportunity assigned','Asignado'));
    const closer=appointmentCloser||opportunityCloser||'SIN CLOSER IDENTIFICADO';
    if(appointmentCloser)diag.salesAttributedByAppointment++;
    else if(opportunityCloser)diag.salesAttributedByOpportunity++;
    else diag.salesWithoutCloser++;
    const currency=COM_N_(sales.get(r,'Tipo de moneda del precio acordado','Moneda del monto acordado'));
    const amount=COM_AMOUNT_(sales.get(r,'Monto de cuota 1'));
    if(!Number.isFinite(amount))diag.missingPaymentAmount++;
    const g=bucket(closer,product);g.ventas++;
    if(Number.isFinite(amount)){if(/^(pen|sol|soles|s\/)/.test(currency))g.cashPEN+=amount;else if(/^(usd|dolar|\$)/.test(currency))g.cashUSD+=amount;else diag.unrecognizedCurrency++;}
    const customerKey=(contact||'OPP:'+oppId)+'|'+product;
    if(uniqueCustomerProduct.has(customerKey))diag.duplicateCustomerProduct++;
    else{uniqueCustomerProduct.set(customerKey,oppId);g.clientesUnicos++;}
    audit.push({opportunityId:oppId,contactId:contact,pipeline,stage,product,closer,closerSource:appointmentCloser?'CITA':opportunityCloser?'OPORTUNIDAD':'NO_IDENTIFICADO',paymentDate:payment,appointmentId:chosen?chosen.id:null,appointmentMatch:chosen?match:null,amount:Number.isFinite(amount)?amount:null,currency:currency||'',customerProductDuplicate:uniqueCustomerProduct.get(customerKey)!==oppId});
  }
  const rows=[...groups.values()].sort((a,b)=>a.product.localeCompare(b.product)||a.closer.localeCompare(b.closer)).map(g=>({...g,conversion:g.asistencias?g.ventas/g.asistencias:null,cashPEN:Math.round(g.cashPEN*100)/100,cashUSD:Math.round(g.cashUSD*100)/100}));
  const totals={ventas:rows.reduce((n,r)=>n+r.ventas,0),clientesUnicosPorProducto:uniqueCustomerProduct.size,asistencias:rows.reduce((n,r)=>n+r.asistencias,0),agendas:rows.reduce((n,r)=>n+r.agendas,0),cashPEN:Math.round(rows.reduce((n,r)=>n+r.cashPEN,0)*100)/100,cashUSD:Math.round(rows.reduce((n,r)=>n+r.cashUSD,0)*100)/100};
  const byProduct={};rows.forEach(r=>{if(!byProduct[r.product])byProduct[r.product]={ventas:0,clientesUnicos:0};byProduct[r.product].ventas+=r.ventas;byProduct[r.product].clientesUnicos+=r.clientesUnicos;});
  return {success:true,month,timeZone:COM_CFG.tz,generatedAt:new Date().toISOString(),rows,totals,byProduct,diagnostics:{...diag,appointmentsRead:appointments.length,attendanceAudit},rules:{salesDate:'Fecha de primer pago',saleIdentity:'Opportunity ID único; clientes únicos por Contact ID + Producto',attribution:'Closer cita si existe; fallback Opportunity assigned/Asignado; sin cita también cuenta la venta',product:'Producto/Evento; fallback calendario',cash:'Monto de cuota 1, sin estimar pagos faltantes',conversion:'ventas/asistencias; asistencia por Fecha cita, última versión de Appointment ID y calendarios comerciales autorizados'},audit};
}
function COM_API_RESPONSE_(month){const result=COM_BUILD_(month);delete result.audit;return result;}
function COM_API_PROBAR(){const r=COM_BUILD_('2026-10');Logger.log(JSON.stringify({totals:r.totals,byProduct:r.byProduct,diagnostics:r.diagnostics,rows:r.rows},null,2));return {totals:r.totals,byProduct:r.byProduct,diagnostics:r.diagnostics,rows:r.rows};}
function COM_API_AUDITAR_OCTUBRE(){const r=COM_BUILD_('2026-10');Logger.log(JSON.stringify(r.audit,null,2));return r.audit;}
function COM_API_DIAGNOSTICAR_COLUMNAS(){const ss=SpreadsheetApp.openById(COM_CFG.spreadsheetId);for(const name of [COM_CFG.sales,COM_CFG.appointments]){const sh=ss.getSheetByName(name);Logger.log(name+': '+JSON.stringify(sh?sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0]:null));}}
