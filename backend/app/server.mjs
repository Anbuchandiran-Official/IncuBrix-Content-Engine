import { createServer as httpServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ALLOWED_PLATFORMS, buildAssets, csvEscape, makeUtm, normalizedHash, similarity, validateEditedAsset, validateStatusChange } from './core.mjs';
import { addPerformance, allAssets, createRun, db, finishRun, getAsset, getBrand, getIdempotency, getSource, listAssets, listPerformance, listRuns, listSources, putAsset, putSource, saveIdempotency, setBrand, stats } from './store.mjs';
import { generateContent } from './provider.mjs';
import { getFirebaseStatus, initializeFirebaseSync, flushFirebaseSync } from './firebase.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const PORT=Number(process.env.PORT||8000), HOST=process.env.HOST||'127.0.0.1', ORIGIN=process.env.APP_ORIGIN||'http://127.0.0.1:5173';
const MAX_BODY=2*1024*1024;
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8'};

function json(res,status,data){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));}
function readBody(req){return new Promise((resolve,reject)=>{let data='';req.on('data',c=>{data+=c;if(data.length>MAX_BODY){reject(Object.assign(new Error('Request is larger than 2 MB.'),{status:413}));req.destroy();}});req.on('end',()=>{try{resolve(data?JSON.parse(data):{});}catch{reject(Object.assign(new Error('Request body must be valid JSON.'),{status:400}));}});req.on('error',reject);});}
const uid=prefix=>`${prefix}-${randomUUID()}`;
function safeSource(body){
  const content=String(body.content||'').trim(); if(!content)throw Object.assign(new Error('Source text is empty.'),{status:400});
  if(Buffer.byteLength(content,'utf8')>MAX_BODY)throw Object.assign(new Error('Source exceeds the 2 MB limit.'),{status:413});
  const title=String(body.title||'Untitled source').trim().slice(0,180);
  const type=String(body.type||'article').toLowerCase();
  if(!['article','podcast','webinar','demo','notes','transcript','text','markdown'].includes(type))throw Object.assign(new Error('Unsupported source type.'),{status:400});
  const hash=createHash('sha256').update(content).digest('hex');
  const duplicate=db.prepare('SELECT id FROM sources WHERE hash=?').get(hash); if(duplicate)throw Object.assign(new Error(`This source already exists (${duplicate.id}).`),{status:409});
  return {id:uid('SRC'),title,type,content,hash,tags:Array.isArray(body.tags)?body.tags.map(String).slice(0,20):[],notes:String(body.notes||'').slice(0,2000),createdAt:new Date().toISOString()};
}
function assetListCsv(items){
 const fields=['asset_id','source_id','platform','content_type','pillar','hook','caption','hashtags','cta','tracking_url','target_metric','target_value','status','scheduled_at','validation_status','source_evidence'];
 return fields.join(',')+'\r\n'+items.map(a=>[a.id,a.sourceId,a.platform,a.contentType,a.pillar,a.hook,a.caption,a.hashtags,a.cta,a.trackingUrl,a.targetMetric,a.targetValue,a.status,a.scheduledAt,a.validation?.passed?'PASS':'INCOMPLETE',a.sourceEvidence].map(csvEscape).join(',')).join('\r\n')+'\r\n';
}
async function serveStatic(req,res,pathname){
 const base=path.resolve(ROOT,'dist');
 let file=path.resolve(base,'.'+decodeURIComponent(pathname));
 if(!file.startsWith(base+path.sep)&&file!==base) return false;
 try{if((await stat(file)).isDirectory())file=path.join(file,'index.html');const body=await readFile(file);res.writeHead(200,{'content-type':MIME[path.extname(file)]||'application/octet-stream'});res.end(body);return true;}catch{return false;}
}
const openapi={openapi:'3.1.0',info:{title:'IncuBrix Content Engine API',version:'1.0.0'},paths:Object.fromEntries(['/api/health','/api/dashboard','/api/sources','/api/generate','/api/assets','/api/calendar','/api/brand','/api/performance','/api/runs','/api/export/csv','/api/export/json','/api/settings'].map(p=>[p,{get:{summary:`Read ${p.slice(5)}`},post:{summary:`Create or update ${p.slice(5)}`}}]))};

export async function handler(req,res){
 const url=new URL(req.url,`http://${req.headers.host||'localhost'}`), pathname=url.pathname;
 const allowedOrigins=new Set([ORIGIN,`http://127.0.0.1:${PORT}`,`http://localhost:${PORT}`]);
 if(req.headers.origin){
  let sameOrigin=false;
  try{sameOrigin=new URL(req.headers.origin).host===req.headers.host;}catch{}
  if(!allowedOrigins.has(req.headers.origin)&&!sameOrigin){json(res,403,{error:'Origin not allowed.'});return;}
 }
 res.setHeader('access-control-allow-origin',req.headers.origin||ORIGIN);res.setHeader('vary','Origin');res.setHeader('access-control-allow-methods','GET,POST,PATCH,PUT,OPTIONS');res.setHeader('access-control-allow-headers','content-type,idempotency-key');
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
 try{
  if(pathname==='/api/health'&&req.method==='GET')return json(res,200,{status:'ok',provider:process.env.AI_PROVIDER||'demo',database:'SQLite',firebase:getFirebaseStatus()});
  if(pathname==='/api/openapi.json')return json(res,200,openapi);
  if(pathname==='/api/docs')return json(res,200,{openapi:'/api/openapi.json',note:'REST API schema'});
  if(pathname==='/api/dashboard'&&req.method==='GET')return json(res,200,stats());
  if(pathname==='/api/settings'&&req.method==='GET')return json(res,200,{provider:process.env.AI_PROVIDER||'demo',model:process.env.AI_MODEL||null,keyConfigured:!!process.env.AI_API_KEY&&process.env.AI_API_KEY!=='replace_me',database:'SQLite with Firestore cloud backup',firebase:getFirebaseStatus(),runtime:'Node.js'});
  if(pathname==='/api/sources'&&req.method==='GET')return json(res,200,{items:listSources()});
  if(pathname==='/api/sources'&&req.method==='POST'){const body=await readBody(req),source=safeSource(body);putSource(source);return json(res,201,{source:{...source,content:undefined}});}
  if(pathname.startsWith('/api/sources/')&&req.method==='GET'){const s=getSource(decodeURIComponent(pathname.split('/').at(-1)));return s?json(res,200,{...s}):json(res,404,{error:'Source not found.'});}
  if(pathname==='/api/generate'&&req.method==='POST'){
   const body=await readBody(req);let source=body.sourceId?getSource(body.sourceId):null;
   if(!source&&body.content&&String(body.content).trim().length<100)return json(res,400,{error:'Source needs at least 100 characters to generate useful content.'});
   if(!source&&body.content){source=safeSource({title:body.title||'Generation source',type:body.type||'article',content:body.content});putSource(source);}
   if(!source)return json(res,400,{error:'Select a saved source or provide source content.'});
   if(source.content.trim().length<100)return json(res,400,{error:'Source needs at least 100 characters to generate useful content.'});
   const idempotencyKey=String(req.headers['idempotency-key']||'').trim();
   if(idempotencyKey.length>128)return json(res,400,{error:'Idempotency-Key must be 128 characters or fewer.'});
   const requestHash=createHash('sha256').update(JSON.stringify(body)).digest('hex');
   if(idempotencyKey){const cached=getIdempotency(idempotencyKey);if(cached){if(cached.request_hash!==requestHash)return json(res,409,{error:'Idempotency-Key was already used for a different request.'});return json(res,200,JSON.parse(cached.response_json));}}
   const runId=uid('RUN'),started=Date.now(),provider=process.env.AI_PROVIDER||'demo',count=Math.max(10,Math.min(60,Number(body.count)||10));
   createRun({id:runId,sourceId:source.id,provider,model:provider==='demo'?null:(process.env.AI_MODEL||'gpt-4o-mini'),startedAt:new Date(started).toISOString(),requested:count,estimatedCost:provider==='demo'?0:null});
   try{
    const generated=await generateContent({source:source.content,sourceId:source.id,platforms:body.platforms||ALLOWED_PLATFORMS,brand:getBrand(),config:{...body.config,count}});
    const existing=allAssets();const prior=existing.map(a=>`${a.hook} ${a.caption}`);
    for(const a of generated.assets){const text=`${a.hook} ${a.caption}`,exact=existing.some(old=>normalizedHash(`${old.hook} ${old.caption}`)===normalizedHash(text));const near=prior.some(t=>similarity(text,t)>=.82);if(exact||near){a.duplicate={...a.duplicate,exact:a.duplicate.exact||exact,near:true,decision:exact?'exact duplicate flagged for manual review':'near duplicate flagged for manual review'};a.validation.warnings.push({code:exact?'exact_duplicate':'near_duplicate',message:exact?'The same copy already exists in saved assets. Review this draft before using it.':'Similar content exists in saved assets. Review this draft before using it.'});}putAsset(a);prior.push(text);}
    const duplicates=generated.assets.filter(a=>a.duplicate.near).length,runtimeMs=Date.now()-started;
    finishRun(runId,{status:'succeeded',endedAt:new Date().toISOString(),runtimeMs,generated:generated.assets.length,duplicates,retries:generated.retries||0,estimatedCost:generated.estimatedCost,actualUsage:generated.actualUsage});
    const result={run:{id:runId,status:'succeeded',runtimeMs,requested:count,generated:generated.assets.length,duplicates,retries:generated.retries||0,provider:generated.provider,model:generated.model,actualUsage:generated.actualUsage,estimatedCost:generated.estimatedCost,costLabel:generated.estimatedCost===0?'Local demo; $0 external provider cost':generated.estimatedCost==null?'Not available; check provider billing':`Estimated $${generated.estimatedCost}`},assets:generated.assets};
    if(idempotencyKey)saveIdempotency(idempotencyKey,requestHash,result);
    return json(res,201,result);
   }catch(error){finishRun(runId,{status:'failed',endedAt:new Date().toISOString(),runtimeMs:Date.now()-started,generated:0,duplicates:0,error:error.message,estimatedCost:provider==='demo'?0:null});return json(res,502,{error:error.message,runId});}
  }
  if(pathname==='/api/assets'&&req.method==='GET')return json(res,200,listAssets({platform:url.searchParams.get('platform')||'',status:url.searchParams.get('status')||'',content_type:url.searchParams.get('type')||'',q:url.searchParams.get('q')||'',page:url.searchParams.get('page'),limit:url.searchParams.get('limit')}));
  if(pathname.startsWith('/api/assets/')&&req.method==='GET'){const a=getAsset(decodeURIComponent(pathname.split('/').at(-1)));return a?json(res,200,a):json(res,404,{error:'Asset not found.'});}
  if(pathname.startsWith('/api/assets/')&&req.method==='PATCH'){
   const id=decodeURIComponent(pathname.split('/').at(-1)),asset=getAsset(id);if(!asset)return json(res,404,{error:'Asset not found.'});const body=await readBody(req);
   const editable=['title','hook','caption','hashtags','cta','trackingUrl','targetMetric','targetValue','videoScript','videoDuration','slides','visualDirection','aspectRatio','rights','scheduledAt','status'];
   for(const key of Object.keys(body))if(!editable.includes(key))return json(res,400,{error:`Field ${key} cannot be edited.`});
   const next={...asset,...body};
   if(body.status)validateStatusChange(asset,body.status);
   if(body.trackingUrl){try{new URL(body.trackingUrl);}catch{return json(res,400,{error:'Tracking URL must be a valid URL.'});}}
   next.validation=validateEditedAsset(next,getBrand());putAsset(next);return json(res,200,next);
  }
  if(pathname==='/api/assets/bulk-status'&&req.method==='POST'){
   const body=await readBody(req);if(!Array.isArray(body.ids)||body.ids.length>200)return json(res,400,{error:'Provide up to 200 asset IDs.'});
   const changed=[];db.exec('BEGIN IMMEDIATE');try{for(const id of body.ids){const a=getAsset(id);if(!a)continue;validateStatusChange(a,body.status);a.status=body.status;a.validation=validateEditedAsset(a,getBrand());putAsset(a);changed.push(a);}db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return json(res,200,{items:changed});
  }
  if(pathname==='/api/calendar'&&req.method==='GET'){const items=allAssets().filter(a=>a.scheduledAt||['approved','scheduled','published'].includes(a.status));return json(res,200,{items});}
  if(pathname==='/api/brand'&&req.method==='GET')return json(res,200,getBrand());
  if(pathname==='/api/brand'&&req.method==='PUT'){const b=await readBody(req);for(const k of ['description','audience','voice'])if(typeof b[k]!=='string')return json(res,400,{error:`${k} must be text.`});const clean={...getBrand(),...b};setBrand(clean);return json(res,200,clean);}
  if(pathname==='/api/performance'&&req.method==='GET')return json(res,200,{items:listPerformance()});
  if(pathname==='/api/performance'&&req.method==='POST'){const p=await readBody(req);if(!getAsset(p.assetId))return json(res,404,{error:'Asset not found.'});if(!p.platform||!p.observedAt)return json(res,400,{error:'Platform and observation date are required.'});for(const k of ['reach','impressions','likes','comments','shares','saves','clicks','signups'])if(p[k]!=null&&(!Number.isInteger(p[k])||p[k]<0))return json(res,400,{error:`${k} must be a nonnegative integer.`});return json(res,201,addPerformance(p));}
  if(pathname==='/api/runs'&&req.method==='GET')return json(res,200,{items:listRuns()});
  if(pathname==='/api/export/csv'&&req.method==='GET'){const items=allAssets();res.writeHead(200,{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="calendar.csv"'});return res.end('\uFEFF'+assetListCsv(items));}
  if(pathname==='/api/export/json'&&req.method==='GET')return json(res,200,{assets:allAssets(),brand:getBrand()});
  if(pathname==='/api/export/markdown'&&req.method==='GET'){const items=allAssets();res.writeHead(200,{'content-type':'text/markdown; charset=utf-8','content-disposition':'attachment; filename="content-package.md"'});return res.end(items.map(a=>`# ${a.id} · ${a.platform}\n\n**${a.hook}**\n\n${a.caption}\n\nCTA: ${a.cta}\n\n${a.trackingUrl}\n`).join('\n---\n\n'));}
  if(pathname.startsWith('/api/'))return json(res,404,{error:'API route not found.'});
  if(await serveStatic(req,res,pathname))return;
  if(req.method==='GET'&&!path.extname(pathname)){try{const html=await readFile(path.join(ROOT,'dist/index.html'));res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(html);}catch{}}
  json(res,404,{error:'Not found.'});
 }catch(error){const status=error.status||400;json(res,status,{error:error.message||'Request failed.'});}
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const server=httpServer(handler);
 const start=async()=>{const firebase=await initializeFirebaseSync(db);server.listen(PORT,HOST,()=>console.log(`IncuBrix Content Engine listening on http://${HOST}:${PORT} (${process.env.AI_PROVIDER||'demo'} mode; public access; Firebase ${firebase.connected?'connected':'not connected'})`));};
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close(async()=>{await flushFirebaseSync();db.close();process.exit(0);});});
 start().catch(error=>{console.error('Server startup failed:',error.message);process.exitCode=1;});
}
