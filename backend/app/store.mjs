import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mirrorFirebase } from './firebase.mjs';

const dbPath = path.resolve(process.env.DATABASE_PATH || './data/incrubrix.sqlite');
mkdirSync(path.dirname(dbPath), {recursive:true});
export const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,title TEXT NOT NULL,type TEXT NOT NULL,content TEXT NOT NULL,hash TEXT NOT NULL UNIQUE,tags TEXT NOT NULL DEFAULT '[]',notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY,source_id TEXT NOT NULL,platform TEXT NOT NULL,status TEXT NOT NULL,content_type TEXT NOT NULL,scheduled_at TEXT,content_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(source_id) REFERENCES sources(id));
CREATE INDEX IF NOT EXISTS assets_status_idx ON assets(status);
CREATE INDEX IF NOT EXISTS assets_source_idx ON assets(source_id);
CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,source_id TEXT NOT NULL,status TEXT NOT NULL,provider TEXT NOT NULL,model TEXT,started_at TEXT NOT NULL,ended_at TEXT,runtime_ms REAL,requested INTEGER NOT NULL,generated INTEGER NOT NULL DEFAULT 0,duplicates INTEGER NOT NULL DEFAULT 0,retries INTEGER NOT NULL DEFAULT 0,error TEXT,estimated_cost REAL,FOREIGN KEY(source_id) REFERENCES sources(id));
CREATE TABLE IF NOT EXISTS performance(id INTEGER PRIMARY KEY AUTOINCREMENT,asset_id TEXT NOT NULL,platform TEXT NOT NULL,observed_at TEXT NOT NULL,reach INTEGER,impressions INTEGER,likes INTEGER,comments INTEGER,shares INTEGER,saves INTEGER,clicks INTEGER,signups INTEGER,evidence TEXT,FOREIGN KEY(asset_id) REFERENCES assets(id));
CREATE TABLE IF NOT EXISTS brand_config(id INTEGER PRIMARY KEY CHECK(id=1),config_json TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS evidence(id INTEGER PRIMARY KEY AUTOINCREMENT,claim TEXT NOT NULL,source TEXT NOT NULL,checked_at TEXT NOT NULL,asset_ids TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS idempotency_requests(key TEXT PRIMARY KEY,request_hash TEXT NOT NULL,response_json TEXT NOT NULL,created_at TEXT NOT NULL);`);
const runColumns=new Set(db.prepare('PRAGMA table_info(runs)').all().map(c=>c.name));
if(!runColumns.has('actual_usage'))db.exec('ALTER TABLE runs ADD COLUMN actual_usage TEXT');
const defaultBrand = {description:'Creator-focused content and workflow product; capabilities require direct verification.',verifiedFacts:[],audience:'Creators, podcasters, YouTubers, editors, and small content teams.',voice:'Clear, practical, specific, and respectful of creators’ time.',preferredTerms:['creator','workflow','content'],prohibitedClaims:['guaranteed growth','customer testimonial without consent','unverified product feature'],ctaRules:'One clear next action; use a verified destination.',hashtags:['#CreatorEducation','#ContentStrategy'],visualGuidelines:'Original or licensed assets, high contrast, accessible captions.',pillars:['Repurposing craft','Creator operations','Audience value','Measurement','Verified product proof'],rightsRequirements:['Use only licensed or original media','Obtain likeness/voice consent','Label AI media when required']};
db.prepare('INSERT OR IGNORE INTO brand_config(id,config_json,updated_at) VALUES(1,?,?)').run(JSON.stringify(defaultBrand),new Date().toISOString());
const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
try {
  const sampleContent=readFileSync(path.join(projectRoot,'engine','sample_input.md'),'utf8');
  const sampleHash=createHash('sha256').update(sampleContent).digest('hex');
  db.prepare('INSERT OR IGNORE INTO sources(id,title,type,content,hash,tags,notes,created_at) VALUES(?,?,?,?,?,?,?,?)').run(
    'SRC_SAMPLE_CREATOR_WORKFLOW','Sample: creator repurposing workflow','article',sampleContent,sampleHash,
    JSON.stringify(['example','creator education']),'Generic educational sample for trying the local demo; not IncuBrix product evidence.',new Date().toISOString());
} catch { /* Allow alternate deployments that intentionally omit the example source. */ }

export const parse = row => row ? {...row} : row;
export function getBrand(){return JSON.parse(db.prepare('SELECT config_json FROM brand_config WHERE id=1').get().config_json);}
export function setBrand(brand){const updatedAt=new Date().toISOString();db.prepare('UPDATE brand_config SET config_json=?,updated_at=? WHERE id=1').run(JSON.stringify(brand),updatedAt);mirrorFirebase('brandConfig','default',{id:'default',config:brand,updatedAt});return brand;}
export function listSources(){return db.prepare('SELECT id,title,type,hash,tags,notes,created_at FROM sources ORDER BY created_at DESC').all().map(s=>({...s,tags:JSON.parse(s.tags)}));}
export function getSource(id){const r=db.prepare('SELECT * FROM sources WHERE id=?').get(id);return r?{...r,tags:JSON.parse(r.tags)}:null;}
export function putSource(s){db.prepare('INSERT INTO sources(id,title,type,content,hash,tags,notes,created_at) VALUES(?,?,?,?,?,?,?,?)').run(s.id,s.title,s.type,s.content,s.hash,JSON.stringify(s.tags||[]),s.notes||'',s.createdAt);const saved=getSource(s.id);mirrorFirebase('sources',s.id,saved);return saved;}
export function listAssets(filters={}){
  const clauses=[], values=[];
  for(const key of ['platform','status','content_type'])if(filters[key]){clauses.push(`${key}=?`);values.push(filters[key]);}
  if(filters.q){clauses.push('(lower(content_json) LIKE ? OR lower(id) LIKE ?)');values.push(`%${filters.q.toLowerCase()}%`,`%${filters.q.toLowerCase()}%`);}
  const page=Math.max(1,Number(filters.page)||1),limit=Math.min(100,Math.max(1,Number(filters.limit)||100));
  const where=clauses.length?`WHERE ${clauses.join(' AND ')}`:'';
  const total=db.prepare(`SELECT count(*) n FROM assets ${where}`).get(...values).n;
  const rows=db.prepare(`SELECT content_json FROM assets ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...values,limit,(page-1)*limit).map(r=>JSON.parse(r.content_json));
  return {items:rows,total,page,limit};
}
export function allAssets(){return db.prepare('SELECT content_json FROM assets ORDER BY created_at DESC').all().map(r=>JSON.parse(r.content_json));}
export function getAsset(id){const r=db.prepare('SELECT content_json FROM assets WHERE id=?').get(id);return r?JSON.parse(r.content_json):null;}
export function putAsset(a){const now=new Date().toISOString();db.prepare(`INSERT INTO assets(id,source_id,platform,status,content_type,scheduled_at,content_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET platform=excluded.platform,status=excluded.status,content_type=excluded.content_type,scheduled_at=excluded.scheduled_at,content_json=excluded.content_json,updated_at=excluded.updated_at`).run(a.id,a.sourceId,a.platform,a.status,a.contentType,a.scheduledAt||null,JSON.stringify(a),a.createdAt||now,now);mirrorFirebase('assets',a.id,a);return a;}
export function createRun(r){db.prepare('INSERT INTO runs(id,source_id,status,provider,model,started_at,requested,estimated_cost) VALUES(?,?,?,?,?,?,?,?)').run(r.id,r.sourceId,'running',r.provider,r.model||null,r.startedAt,r.requested,r.estimatedCost??0);mirrorFirebase('runs',r.id,db.prepare('SELECT * FROM runs WHERE id=?').get(r.id));}
export function finishRun(id,r){db.prepare('UPDATE runs SET status=?,ended_at=?,runtime_ms=?,generated=?,duplicates=?,retries=?,error=?,estimated_cost=?,actual_usage=? WHERE id=?').run(r.status,r.endedAt,r.runtimeMs,r.generated,r.duplicates,r.retries||0,r.error||null,r.estimatedCost??null,r.actualUsage?JSON.stringify(r.actualUsage):null,id);mirrorFirebase('runs',id,db.prepare('SELECT * FROM runs WHERE id=?').get(id));}
export function listRuns(){return db.prepare('SELECT * FROM runs ORDER BY started_at DESC LIMIT 100').all();}
export function getIdempotency(key){return db.prepare('SELECT * FROM idempotency_requests WHERE key=?').get(key)||null;}
export function saveIdempotency(key,requestHash,response){const createdAt=new Date().toISOString();db.prepare('INSERT OR REPLACE INTO idempotency_requests(key,request_hash,response_json,created_at) VALUES(?,?,?,?)').run(key,requestHash,JSON.stringify(response),createdAt);mirrorFirebase('idempotencyRequests',key,{key,request_hash:requestHash,response_json:JSON.stringify(response),created_at:createdAt});}
export function addPerformance(p){const r=db.prepare(`INSERT INTO performance(asset_id,platform,observed_at,reach,impressions,likes,comments,shares,saves,clicks,signups,evidence) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(p.assetId,p.platform,p.observedAt,p.reach??null,p.impressions??null,p.likes??null,p.comments??null,p.shares??null,p.saves??null,p.clicks??null,p.signups??null,p.evidence||'');const saved=db.prepare('SELECT * FROM performance WHERE id=?').get(Number(r.lastInsertRowid));mirrorFirebase('performance',saved.id,saved);return saved;}
export function listPerformance(){return db.prepare('SELECT * FROM performance ORDER BY observed_at DESC').all();}
export function stats(){
  const assets=db.prepare('SELECT content_json FROM assets').all().map(r=>JSON.parse(r.content_json));
  const runs=listRuns(), performance=listPerformance();
  const totalRuns=db.prepare('SELECT count(*) n FROM runs').get().n;
  const totalEstimatedCost=db.prepare('SELECT sum(estimated_cost) n FROM runs').get().n;
  const statuses=Object.fromEntries(['draft','in_review','approved','scheduled','published'].map(s=>[s,assets.filter(a=>a.status===s).length]));
  const platforms=Object.fromEntries(['LinkedIn','Instagram','YouTube Shorts'].map(p=>[p,assets.filter(a=>a.platform===p).length]));
  const totalReach=performance.reduce((s,p)=>s+(p.reach||p.impressions||0),0);
  const totalClicks=performance.reduce((s,p)=>s+(p.clicks||0),0);
  const totalSignups=performance.reduce((s,p)=>s+(p.signups||0),0);
  const engNumerator=performance.reduce((s,p)=>s+(p.likes||0)+(p.comments||0)+(p.shares||0)+(p.saves||0),0);
  const denominator=performance.reduce((s,p)=>s+(p.reach||p.impressions||0),0);
  const targetNames=[...new Set(assets.map(a=>a.targetMetric).filter(Boolean))];
  const targetMetrics=targetNames.map(metric=>{
    const matching=assets.filter(a=>a.targetMetric===metric),values=matching.map(a=>a.targetValue).filter(v=>v!=null);
    const ids=new Set(matching.map(a=>a.id));
    const observed=performance.filter(p=>ids.has(p.asset_id)).reduce((sum,p)=>sum+(metric.toLowerCase().includes('click')?(p.clicks||0):metric.toLowerCase().includes('sign')?(p.signups||0):(p.reach||p.impressions||0)),0);
    return {metric,proposedTarget:values.length?values.reduce((s,v)=>s+Number(v),0):null,observed:performance.some(p=>ids.has(p.asset_id))?observed:null};
  });
  const upcomingAll=assets.filter(a=>a.status==='scheduled'&&a.scheduledAt).sort((a,b)=>a.scheduledAt.localeCompare(b.scheduledAt));
  return {totalAssets:assets.length,totalRuns,platforms,statuses,videos:assets.filter(a=>/video|reel/i.test(a.contentType)).length,carousels:assets.filter(a=>/carousel|graphic/i.test(a.contentType)).length,recentRuns:runs.slice(0,8),failedRuns:runs.filter(r=>r.status==='failed').length,averageRuntimeMs:runs.filter(r=>r.runtime_ms!=null).length?Math.round(runs.filter(r=>r.runtime_ms!=null).reduce((s,r)=>s+r.runtime_ms,0)/runs.filter(r=>r.runtime_ms!=null).length):null,estimatedCost:totalEstimatedCost,approvalRate:assets.length?(statuses.approved+statuses.scheduled+statuses.published)/assets.length:0,upcomingCount:upcomingAll.length,upcoming:upcomingAll.slice(0,5),targetMetrics,performance:performance.length?{observations:performance.length,reach:totalReach,clicks:totalClicks,signups:totalSignups,engagementRate:denominator?engNumerator/denominator:null,formula:'(likes + comments + shares + saves) / reach or impressions'}:null};
}
export function recordEvidence(e){const r=db.prepare('INSERT INTO evidence(claim,source,checked_at,asset_ids) VALUES(?,?,?,?)').run(e.claim,e.source,e.checkedAt,JSON.stringify(e.assetIds||[]));const saved=db.prepare('SELECT * FROM evidence WHERE id=?').get(Number(r.lastInsertRowid));mirrorFirebase('evidence',saved.id,{...saved,asset_ids:JSON.parse(saved.asset_ids)});}
