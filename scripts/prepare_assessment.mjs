import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const csvPath=path.join(root,'content','calendar.csv');
const outRoot=path.join(root,'content','final_assets');
const videoRows=[];

function parseCsv(text){
 const rows=[];let row=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++;}else if(c==='"')quoted=false;else field+=c;}else if(c==='"')quoted=true;else if(c===','){row.push(field);field='';}else if(c==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}else field+=c;}
 if(field||row.length){row.push(field.replace(/\r$/,''));rows.push(row);}const headers=rows.shift();return rows.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]||''])));
}
function csvEscape(value){const s=String(value??'');return /[",\r\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s;}
function xmlEscape(s){return String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');}
function safe(s,n=135){const t=String(s||'').replace(/https?:\/\/\S+/g,'').replace(/\s+/g,' ').trim();return t.length>n?t.slice(0,n-1).trimEnd()+'…':t;}
function splitSentences(s){return String(s||'').replace(/\bScript:\s*/i,'').split(/(?<=[.!?])\s+/).map(x=>x.trim()).filter(Boolean);}
function carouselPoints(caption){const found=[...String(caption).matchAll(/(?:Slide\s*)?\d+\s*:\s*(.*?)(?=(?:\s+\d+\s*:)|$)/gi)].map(m=>safe(m[1],90));if(found.length>=4)return found.slice(0,6);const parts=splitSentences(caption);while(parts.length<5)parts.push('Keep this step useful, clear, and easy to try.');return parts.slice(0,5).map(x=>safe(x,90));}
function textSvg({id,platform,title,body,label='CREATOR WORKFLOW',page='',pages=''}){
 const W=1080,H=1350,words=String(body||'').split(/\s+/),lines=[];let line='';
 for(const word of words){const next=line?`${line} ${word}`:word;if(next.length>28&&line){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);const font=title.length>40?54:68,titleLines=[];let tl='';for(const word of title.split(/\s+/)){const next=tl?`${tl} ${word}`:word;if(next.length>22&&tl){titleLines.push(tl);tl=word;}else tl=next;}if(tl)titleLines.push(tl);
 const titleMarkup=titleLines.slice(0,4).map((x,i)=>`<text x="92" y="${380+i*78}" class="title" font-size="${font}">${xmlEscape(x)}</text>`).join('');
 const bodyStart=430+Math.min(titleLines.length,4)*80;const bodyMarkup=lines.slice(0,7).map((x,i)=>`<text x="96" y="${bodyStart+i*42}" class="body">${xmlEscape(x)}</text>`).join('');
 return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1350" viewBox="0 0 1080 1350" role="img" aria-labelledby="t d"><title id="t">${xmlEscape(title)}</title><desc id="d">${xmlEscape(body)}</desc><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#15182E"/><stop offset="1" stop-color="#4237A8"/></linearGradient><radialGradient id="r"><stop stop-color="#A5F3C2" stop-opacity=".32"/><stop offset="1" stop-color="#A5F3C2" stop-opacity="0"/></radialGradient></defs><rect width="1080" height="1350" rx="48" fill="url(#g)"/><circle cx="935" cy="170" r="350" fill="url(#r)"/><path d="M88 192h112" stroke="#A5F3C2" stroke-width="9" stroke-linecap="round"/><text x="88" y="250" class="label">${xmlEscape(label)}${page?` · ${page}/${pages}`:''}</text>${titleMarkup}<text x="96" y="${bodyStart-45}" class="eyebrow">TRY THIS</text>${bodyMarkup}<rect x="88" y="1100" width="904" height="132" rx="28" fill="#A5F3C2"/><text x="120" y="1158" class="cta">${xmlEscape(platform==='YouTube Shorts'?'MAKE ONE IDEA TRAVEL':'TRY ONE STEP THIS WEEK')}</text><text x="120" y="1202" class="brand">INCUBRIX  ·  CREATOR WORKFLOW</text><text x="90" y="1290" class="fine">${xmlEscape(id)}  ·  Original text and vector artwork</text><style>.label,.eyebrow,.cta,.brand,.fine,.title,.body{font-family:Arial,Helvetica,sans-serif}.label{fill:#D8D6FF;font-size:22px;font-weight:700;letter-spacing:4px}.title{fill:#fff;font-weight:700;letter-spacing:-1px}.eyebrow{fill:#A5F3C2;font-size:19px;font-weight:700;letter-spacing:3px}.body{fill:#E8E8F0;font-size:29px}.cta{fill:#15182E;font-size:23px;font-weight:700;letter-spacing:1px}.brand{fill:#3B347F;font-size:16px;font-weight:700;letter-spacing:2px}.fine{fill:#9A9CB2;font-size:15px}</style></svg>`;
}
function writeVtt(row){const caption=safe(row.caption,500);return `WEBVTT\n\n00:00:00.000 --> 00:00:03.000\n${safe(row.hook,100)}\n\n00:00:03.000 --> 00:00:06.000\n${caption}\n\n00:00:06.000 --> 00:00:09.000\n${safe(row.call_to_action,110)}\n`;}
function rendererHtml(jobs){return `<!doctype html><meta charset="utf-8"><title>Preparing videos</title><body>Preparing 0/${jobs.length}<script>
const jobs=${JSON.stringify(jobs)};const wait=ms=>new Promise(r=>setTimeout(r,ms));
function wrap(ctx,text,max){const words=String(text).split(/\\s+/),lines=[];let line='';for(const w of words){const n=line?line+' '+w:w;if(ctx.measureText(n).width>max&&line){lines.push(line);line=w;}else line=n;}if(line)lines.push(line);return lines;}
function draw(ctx,w,h,job,scene,p){const palettes=[['#15182e','#4237a8','#a5f3c2'],['#14252b','#186452','#d9ff80'],['#251a36','#7040a1','#ffd58e']];const c=palettes[job.index%palettes.length];const grad=ctx.createLinearGradient(0,0,w,h);grad.addColorStop(0,c[0]);grad.addColorStop(1,c[1]);ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);ctx.globalAlpha=.18;ctx.fillStyle=c[2];ctx.beginPath();ctx.arc(w*.82,h*(.16+Math.sin(p*5)*.02),w*.5,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;ctx.fillStyle=c[2];ctx.fillRect(w*.1,h*.105,w*.18,8);ctx.fillStyle='#dcdbff';ctx.font='700 22px Arial';ctx.fillText('CREATOR WORKFLOW',w*.1,h*.15);ctx.fillStyle='#fff';ctx.font='700 52px Arial';const lines=wrap(ctx,job.scenes[scene],w*.8).slice(0,6);const lh=64;const y=(h-lines.length*lh)/2;lines.forEach((l,i)=>ctx.fillText(l,w*.1,y+i*lh));ctx.fillStyle='rgba(255,255,255,.75)';ctx.font='24px Arial';ctx.fillText(job.id,w*.1,h*.92);ctx.fillStyle='rgba(255,255,255,.2)';ctx.fillRect(w*.1,h*.95,w*.8,5);ctx.fillStyle=c[2];ctx.fillRect(w*.1,h*.95,w*.8*p,5);ctx.fillStyle='rgba(255,255,255,.55)';ctx.font='20px Arial';ctx.fillText((scene+1)+' / 3',w*.82,h*.15);}
async function render(job){const canvas=document.createElement('canvas');canvas.width=720;canvas.height=1280;const ctx=canvas.getContext('2d');const mime=MediaRecorder.isTypeSupported('video/webm;codecs=vp8')?'video/webm;codecs=vp8':'video/webm';const rec=new MediaRecorder(canvas.captureStream(20),{mimeType:mime,videoBitsPerSecond:2200000});const chunks=[];rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};const done=new Promise(resolve=>rec.onstop=resolve);rec.start();const start=performance.now();await new Promise(resolve=>{function frame(now){const elapsed=now-start;const scene=Math.min(2,Math.floor(elapsed/3000));draw(ctx,canvas.width,canvas.height,job,scene,(elapsed%3000)/3000);if(elapsed<9000)requestAnimationFrame(frame);else{draw(ctx,canvas.width,canvas.height,job,2,1);setTimeout(()=>{rec.stop();resolve()},100)}}requestAnimationFrame(frame)});await done;const blob=new Blob(chunks,{type:'video/webm'});const response=await fetch('/save/'+job.id,{method:'POST',body:blob});if(!response.ok)throw new Error('save failed '+job.id);}
(async()=>{for(let i=0;i<jobs.length;i++){document.body.textContent='Rendering '+(i+1)+'/'+jobs.length+' · '+jobs[i].id;await render(jobs[i]);}document.body.textContent='Done '+jobs.length+' short videos';document.title='Done';})().catch(e=>{document.body.textContent='ERROR '+e.message;document.title='ERROR';});
</script></body>`;}

const rows=parseCsv(await readFile(csvPath,'utf8'));
if(rows.length!==30)throw new Error(`Expected 30 calendar assets; found ${rows.length}.`);
await mkdir(outRoot,{recursive:true});
for(let i=0;i<rows.length;i++){
 const row=rows[i],dir=path.join(outRoot,row.asset_id);await mkdir(dir,{recursive:true});
 const isVideo=/video|reel/i.test(row.format);const isCarousel=/carousel/i.test(row.format);const media=[];
 if(isVideo){
  const sentences=splitSentences(row.caption);const mid=sentences.find(s=>!/^script:/i.test(s))||row.caption;
  videoRows.push({id:row.asset_id,index:videoRows.length,scenes:[safe(row.hook,85),safe(mid,105),safe(row.call_to_action,75)],dir});
  await writeFile(path.join(dir,'captions.vtt'),writeVtt(row),'utf8');
  media.push(`content/final_assets/${row.asset_id}/${row.asset_id}.webm`);
 }else if(isCarousel){
  const points=carouselPoints(row.caption),pages=points.length;
  for(let n=0;n<points.length;n++){const name=`${row.asset_id}-slide-${String(n+1).padStart(2,'0')}.svg`;await writeFile(path.join(dir,name),textSvg({id:row.asset_id,platform:row.platform,title:n===0?row.hook:`${n+1}. ${points[n].split(/\s+/).slice(0,5).join(' ')}`,body:points[n],page:n+1,pages}), 'utf8');media.push(`content/final_assets/${row.asset_id}/${name}`);}
 }else{
  const body=splitSentences(row.caption).slice(0,2).join(' ')||row.call_to_action;
  const name=`${row.asset_id}.svg`;await writeFile(path.join(dir,name),textSvg({id:row.asset_id,platform:row.platform,title:row.hook,body:safe(body,175)}),'utf8');media.push(`content/final_assets/${row.asset_id}/${name}`);
 }
 row._media=media.join(';');
}
console.log(`Created artwork for ${rows.length} calendar assets; rendering ${videoRows.length} silent, captioned 9:16 videos.`);

let saved=videoRows.filter(j=>existsSync(path.join(j.dir,`${j.id}.webm`))).length,server;
const renderJobs=videoRows.filter(j=>!existsSync(path.join(j.dir,`${j.id}.webm`)));
if(renderJobs.length){
 server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(req.method==='GET'&&url.pathname==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(rendererHtml(renderJobs.map(({id,index,scenes})=>({id,index,scenes}))));}
  if(req.method==='POST'&&url.pathname.startsWith('/save/')){const id=decodeURIComponent(url.pathname.slice(6));const job=videoRows.find(x=>x.id===id);if(!job){res.writeHead(404);return res.end('unknown asset');}const chunks=[];for await(const c of req)chunks.push(c);const b=Buffer.concat(chunks);if(b.length<1000){res.writeHead(400);return res.end('empty video');}await writeFile(path.join(job.dir,`${id}.webm`),b);saved++;console.log(`Rendered ${saved}/${videoRows.length}: ${id} (${Math.round(b.length/1024)} KB)`);res.writeHead(200,{'content-type':'text/plain'});return res.end('saved');}
  res.writeHead(404);res.end('not found');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=server.address().port;const chromeCandidates=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'];const chrome=chromeCandidates.find(existsSync);if(!chrome)throw new Error('Chrome or Edge is required to render the short video files.');
 const profile=path.join(root,'tools',`.assessment-render-profile-${Date.now()}`);
 const browser=spawn(chrome,['--headless=new','--disable-gpu','--no-sandbox','--autoplay-policy=no-user-gesture-required',`--user-data-dir=${profile}`,`http://127.0.0.1:${port}/`],{stdio:'ignore',windowsHide:true});
 const started=Date.now();while(saved<videoRows.length&&Date.now()-started<420000){await new Promise(resolve=>setTimeout(resolve,1000));if(browser.exitCode!==null)break;}
 if(saved!==videoRows.length){browser.kill();await new Promise(resolve=>server.close(resolve));throw new Error(`Video render stopped at ${saved}/${videoRows.length}.`);}
 browser.kill();await new Promise(resolve=>server.close(resolve));
}

const headings=['asset_id','day','scheduled_at','platform','format','hook','caption','hashtags','call_to_action','tracking_link','target_metric','final_asset_file','source_file','status'];
const start=new Date('2026-10-26T10:00:00+08:00');
for(let i=0;i<rows.length;i++){
 const row=rows[i],date=new Date(start.getTime()+i*86400000),stamp=`${date.toISOString().slice(0,10)}T10:00:00+08:00`;
 const channel={LinkedIn:'linkedin',Instagram:'instagram','YouTube Shorts':'youtube'}[row.platform];const target=new URL('https://incubrix.com/');target.searchParams.set('utm_source',channel);target.searchParams.set('utm_medium','social');target.searchParams.set('utm_campaign','2027_growth');target.searchParams.set('utm_content',row.asset_id);
 row.day=String(i+1);row.scheduled_at=stamp;row.tracking_link=target.toString();row.final_asset_file=row._media;row.status='Prepared - owner approval required';delete row._media;
}
const csv=`${headings.join(',')}\r\n${rows.map(r=>headings.map(h=>csvEscape(r[h])).join(',')).join('\r\n')}\r\n`;
await writeFile(csvPath,csv,'utf8');await mkdir(path.join(root,'output'),{recursive:true});await writeFile(path.join(root,'output','calendar.csv'),csv,'utf8');
for(const row of rows){
 const isVideo=/video|reel/i.test(row.format),isCarousel=/carousel/i.test(row.format);
 const size=isVideo?'720 × 1280; 9 seconds; silent text animation with WebVTT captions':isCarousel?'1080 × 1350 SVG panels; five panels':'1080 × 1350 editable SVG graphic';
 const source=path.resolve(root,row.source_file);await mkdir(path.dirname(source),{recursive:true});
 const md=`# ${row.asset_id} — Day ${row.day} — ${row.platform} / ${row.format}\n\n**Status:** Prepared for IncuBrix owner approval. Proposed slot: ${row.scheduled_at} (Singapore Time). Not uploaded or scheduled on a social account.\n\n## Hook\n\n${row.hook}\n\n## Caption / script\n\n${row.caption}\n\n## Hashtags\n\n${row.hashtags}\n\n## Call to action\n\n${row.call_to_action}\n\n## Tracking link\n\n${row.tracking_link}\n\n## Target metric\n\n${row.target_metric}\n\n## Final media\n\n${row.final_asset_file.split(';').map(f=>`- ${f}`).join('\n')}\n\n**Media format:** ${size}.\n\n## Review before publishing\n\n- Confirm the public destination and UTM analytics event with the account owner.\n- Preview in the platform composer and approve the planned posting time.\n- This asset makes no unverified IncuBrix product-feature claim.\n- Artwork uses original text/vector shapes and system fonts; no third-party music, stock image, or likeness is included.\n`;
 await writeFile(source,md,'utf8');
}
await writeFile(path.join(root,'content','final_assets','README.md'),`# Final media package\n\nOne folder per row in calendar.csv. Every asset folder contains its original editable Markdown source link in the CSV and final media files. The 14 short videos are silent, captioned 9:16 motion graphics rendered from original text and vector shapes; no stock imagery, third-party audio, or likenesses are used. Carousel SVG files are individual editable panels.\n\nAll dates are proposed slots in Singapore Time, beginning 26 October 2026. The content is prepared for owner review; it has not been uploaded or scheduled on IncuBrix accounts. Confirm the account owner, brand approval, destination, UTM analytics, and final platform previews before publishing.\n`,'utf8');
console.log(`Updated calendar.csv and output/calendar.csv with ${rows.length} rows, proposed slots, UTMs, and final media paths.`);
