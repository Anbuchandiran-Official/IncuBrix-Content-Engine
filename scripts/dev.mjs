import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const children=[
 spawn(process.execPath,['--env-file-if-exists=.env','backend/app/server.mjs'],{cwd:root,stdio:'inherit'}),
 spawn(process.execPath,['--env-file-if-exists=.env','node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5173'],{cwd:root,stdio:'inherit'}),
];
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children)if(!child.killed)child.kill();setTimeout(()=>process.exit(code),250).unref();}
for(const child of children)child.on('exit',(code)=>{if(!stopping&&code!==0)stop(code||1)});
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>stop(0));
