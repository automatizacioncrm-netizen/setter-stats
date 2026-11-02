const fs=require('fs'),ts=require('typescript');require.extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
(async()=>{
 const {loadEnv}=await import('vite');if(!process.env.APPS_SCRIPT_URL_VSL)process.env.APPS_SCRIPT_URL_VSL=loadEnv('development',process.cwd(),'APPS_SCRIPT_URL_VSL').APPS_SCRIPT_URL_VSL;
 const {vslSyncStartApi,vslSyncStatusApi}=require('./src/server/api/vsl-sync.api.server.ts'),{qualityApi}=require('./src/server/api/vsl-quality.api.server.ts');
 const resume=process.argv.includes("--resume");
 const evidence=resume && fs.existsSync("vsl-refresh-live-evidence.local")?JSON.parse(fs.readFileSync("vsl-refresh-live-evidence.local","utf8")):{startedAt:new Date().toISOString(),observed:[]};
 const report=async(suffix='')=>{const r=await qualityApi(new Request('https://local.test/api/reports/vsl-calidad'+suffix));const body=await r.json();if(!r.ok)throw new Error(body.error);return {generatedAt:body.generatedAt,queriedAt:body.queriedAt,filter:body.filter,qualityColumns:body.quality.columns.length,qualityRows:body.quality.rows.length,surveyColumns:body.surveys.columns.length,surveyRows:body.surveys.rows.length,statusColumns:body.surveyStatus.columns.length,statusRows:body.surveyStatus.rows.length};};
 if(!resume){evidence.before=await report();console.log(JSON.stringify({before:evidence.before}));}
 const response=resume?await vslSyncStatusApi():await vslSyncStartApi(new Request('https://local.test/api/reports/vsl-calidad-sync',{method:'POST',headers:{Origin:'https://local.test'}}));let job=await response.json();if(!response.ok)throw new Error(job.error);
 const originalId=resume?evidence.observed[0]?.id:job.id;let last='',attempt=0;
 while(true){
  if(originalId && job.id && job.id!==originalId)throw new Error('El identificador del trabajo cambió; no se certifica la actualización iniciada.');
  const signature=JSON.stringify(job);if(signature!==last){console.log(JSON.stringify({job}));evidence.observed.push(job);last=signature;fs.writeFileSync('vsl-refresh-live-evidence.local',JSON.stringify(evidence,null,2));}
  if(job.status==='COMPLETED')break;
  if(job.status==='ERROR')throw new Error('La sincronización remota terminó con ERROR: '+(job.error??'sin descripción'));
  if(job.status==='IDLE')throw new Error('El endpoint no confirmó trabajo activo tras el POST.');
  if(attempt++>360)throw new Error('No se confirmó COMPLETED dentro de la observación; consultar el trabajo activo.');
  await new Promise(resolve=>setTimeout(resolve,5000));const r=await vslSyncStatusApi();const next=await r.json();if(!r.ok){console.log(JSON.stringify({pollingError:next.error,resumingSameJob:originalId}));continue;}job=next;
 }
 evidence.completed=job;evidence.after=await report();evidence.filteredAfter=await report('?startDate=2026-10-01&endDate=2026-10-31');evidence.finishedAt=new Date().toISOString();fs.writeFileSync('vsl-refresh-live-evidence.local',JSON.stringify(evidence,null,2));console.log(JSON.stringify({completed:job,after:evidence.after,filteredAfter:evidence.filteredAfter}));
})().catch(error=>{console.log(JSON.stringify({failure:error.message}));process.exitCode=1;});
