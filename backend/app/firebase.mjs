import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let firestore=null, writeQueue=Promise.resolve();
const state={configured:false,connected:false,pending:0,lastSynced:null,error:null,projectId:null};

const clean=value=>JSON.parse(JSON.stringify(value));
const enqueue=write=>{
 if(!firestore)return;
 state.pending++;
 writeQueue=writeQueue.then(write).then(()=>{state.lastSynced=new Date().toISOString();state.error=null;}).catch(error=>{state.error=String(error?.code||error?.message||'Firebase sync failed').slice(0,240);}).finally(()=>{state.pending--;});
};

async function writeSource(source){
 const {content='',...metadata}=source;
 const chunks=[];for(let i=0;i<content.length;i+=100000)chunks.push(content.slice(i,i+100000));
 await firestore.collection('sources').doc(source.id).set(clean({...metadata,contentChunkCount:chunks.length}));
 for(let index=0;index<chunks.length;index++)await firestore.collection('sources').doc(source.id).collection('contentChunks').doc(String(index).padStart(4,'0')).set({text:chunks[index]});
}
export function mirrorFirebase(collection,id,data){
 if(collection==='sources')return enqueue(()=>writeSource(data));
 enqueue(()=>firestore.collection(collection).doc(String(id)).set(clean(data)));
}

export async function initializeFirebaseSync(database,{serviceAccountPath=process.env.FIREBASE_SERVICE_ACCOUNT_PATH}={}){
 if(!serviceAccountPath)return {...state};
 state.configured=true;
 try{
  const filename=path.resolve(serviceAccountPath);
  const serviceAccount=JSON.parse(await readFile(filename,'utf8'));
  const app=initializeApp({credential:cert(serviceAccount),projectId:serviceAccount.project_id},'incubrix-admin');
  firestore=getFirestore(app);
  const connection=firestore.collection('_system').doc('incubrixConnection');
  await connection.set({service:'IncuBrix content app',checkedAt:new Date().toISOString(),mode:'local-primary-firestore-backup'});
  state.connected=true;state.error=null;state.projectId=serviceAccount.project_id;
  await syncLocalSnapshot(database);
  return {...state};
 }catch(error){state.connected=false;state.error=String(error?.code||error?.message||'Firebase connection failed').slice(0,240);return {...state};}
}

async function syncLocalSnapshot(database){
 const collections=[
  ['sources',database.prepare('SELECT * FROM sources').all().map(row=>({...row,tags:JSON.parse(row.tags)}))],
  ['assets',database.prepare('SELECT content_json FROM assets').all()],
  ['runs',database.prepare('SELECT * FROM runs').all()],
  ['performance',database.prepare('SELECT * FROM performance').all()],
  ['brandConfig',[{id:'default',config:JSON.parse(database.prepare('SELECT config_json FROM brand_config WHERE id=1').get().config_json)}]],
  ['idempotencyRequests',database.prepare('SELECT * FROM idempotency_requests').all().map(row=>({...row,response:JSON.parse(row.response_json)}))],
  ['evidence',database.prepare('SELECT * FROM evidence').all().map(row=>({...row,asset_ids:JSON.parse(row.asset_ids)}))],
 ];
 for(const [name,rows] of collections){
  if(name==='sources'){for(const row of rows)await writeSource(row);continue;}
  for(let offset=0;offset<rows.length;offset+=450){
   const batch=firestore.batch();
   for(const row of rows.slice(offset,offset+450)){
    const id=name==='brandConfig'?'default':String(row.id??row.key);
    const data=name==='assets'?JSON.parse(row.content_json||'{}'):row;
    batch.set(firestore.collection(name).doc(id),clean(data));
   }
   await batch.commit();
  }
 }
 state.lastSynced=new Date().toISOString();
}

export function getFirebaseStatus(){return {...state};}
export async function flushFirebaseSync(){await writeQueue;return {...state};}
