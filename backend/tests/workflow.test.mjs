import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let server,base,tempDir,db;
before(async()=>{
 tempDir=await mkdtemp(path.join(os.tmpdir(),'incubrix-workflow-'));
 process.env.DATABASE_PATH=path.join(tempDir,'workflow.sqlite');
 process.env.AI_PROVIDER='demo';
 const app=await import('../app/server.mjs');
 const store=await import('../app/store.mjs');db=store.db;
 server=createServer(app.handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));db?.close();if(tempDir)await rm(tempDir,{recursive:true,force:true});});
const req=(route,method='GET',body)=>fetch(base+route,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
const source=`A creator can make one long source easier to reuse by identifying the useful ideas first. Each idea should answer one clear audience question and include enough context to make sense on its own.\n\nA short video can demonstrate one step while a carousel can explain the sequence. A text post can explore why the creator chose that approach. Keep the original meaning intact when changing the format.\n\nReview names and numbers against the source before publishing. Use licensed or original media, add accurate captions, and get permission before using another person's words or voice. Track one action with a tagged destination and review actual results after publishing.`;

test('end-to-end source → generate → edit → schedule field → export → performance → dashboard',async()=>{
 let r=await req('/api/health');assert.equal(r.status,200);assert.equal((await r.json()).status,'ok');
 r=await req('/api/sources','POST',{title:'Test source',type:'article',content:source});assert.equal(r.status,201);const src=(await r.json()).source;
 r=await req('/api/sources','POST',{title:'Duplicate',type:'article',content:source});assert.equal(r.status,409);
 r=await req('/api/generate','POST',{sourceId:src.id,count:10,platforms:['LinkedIn','Instagram','YouTube Shorts']});assert.equal(r.status,201);const generated=await r.json();
 assert.equal(generated.assets.length,10);assert.equal(generated.run.status,'succeeded');assert.equal(generated.run.provider,'demo');assert.equal(generated.run.estimatedCost,0);
 const asset=generated.assets[0];
 r=await req(`/api/assets/${asset.id}`,'PATCH',{hook:'Edited, saved hook'});assert.equal(r.status,200);assert.equal((await r.json()).hook,'Edited, saved hook');
 r=await req(`/api/assets/${asset.id}`,'PATCH',{scheduledAt:'2026-11-01T10:30:00.000Z'});assert.equal(r.status,200);
 r=await req('/api/calendar');assert.ok((await r.json()).items.some(x=>x.id===asset.id));
 r=await req('/api/export/csv');assert.equal(r.status,200);const csv=await r.text();assert.match(csv,/asset_id,source_id,platform/);assert.match(csv,/Edited, saved hook/);
 r=await req('/api/performance','POST',{assetId:asset.id,platform:asset.platform,observedAt:'2026-11-01T12:00:00.000Z',reach:100,likes:8,comments:2,shares:1,saves:3,clicks:4,signups:1,evidence:'local test fixture'});assert.equal(r.status,201);
 r=await req('/api/dashboard');const dashboard=await r.json();assert.equal(dashboard.totalAssets,10);assert.equal(dashboard.performance.reach,100);assert.equal(dashboard.performance.clicks,4);assert.ok(dashboard.averageRuntimeMs>=0);
 r=await req('/api/runs');const runs=(await r.json()).items;assert.equal(runs[0].status,'succeeded');assert.equal(runs[0].estimated_cost,0);
 r=await req('/api/generate','POST',{sourceId:src.id,count:10,platforms:['LinkedIn','Instagram','YouTube Shorts']});const second=await r.json();assert.equal(second.assets.length,10);assert.ok(second.run.duplicates>0);
 r=await req('/api/assets?limit=100');const afterRefresh=(await r.json()).items;assert.equal(afterRefresh.length,20);assert.ok(afterRefresh.find(x=>x.id===asset.id).hook==='Edited, saved hook','refresh must not overwrite saved edits');
});

test('invalid content is rejected and does not change prior saved assets',async()=>{
 const r=await req('/api/generate','POST',{content:'too short'});assert.equal(r.status,400);
 const list=await req('/api/assets?limit=100');assert.equal((await list.json()).total,20);
});

test('status transitions reject approval before checks pass',async()=>{
 const list=await req('/api/assets?limit=1');const item=(await list.json()).items[0];
 const r=await req(`/api/assets/${item.id}`,'PATCH',{status:'approved'});assert.equal(r.status,400);
});

test('generation idempotency key returns the same run and rejects conflicting reuse',async()=>{
 const body={sourceId:'SRC_SAMPLE_CREATOR_WORKFLOW',count:10,platforms:['LinkedIn'],config:{campaign:'idem-test'}};
 const first=await fetch(base+'/api/generate',{method:'POST',headers:{'content-type':'application/json','idempotency-key':'test-run-key-1'},body:JSON.stringify(body)});
 assert.equal(first.status,201);const result=await first.json();
 const second=await fetch(base+'/api/generate',{method:'POST',headers:{'content-type':'application/json','idempotency-key':'test-run-key-1'},body:JSON.stringify(body)});
 assert.equal(second.status,200);assert.equal((await second.json()).run.id,result.run.id);
 const conflict=await fetch(base+'/api/generate',{method:'POST',headers:{'content-type':'application/json','idempotency-key':'test-run-key-1'},body:JSON.stringify({...body,config:{campaign:'different'}})});
 assert.equal(conflict.status,409);
});
