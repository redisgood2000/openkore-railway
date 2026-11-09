import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const app=express(), server=http.createServer(app), wss=new WebSocketServer({noServer:true});
const PORT=Number(process.env.PORT||3000), TOKEN=process.env.WORKER_TOKEN;
const ROOT=process.env.OPENKORE_DIR||'/opt/openkore', DATA='/data/control';
if(!TOKEN){console.error('WORKER_TOKEN is required');process.exit(1);}
fs.mkdirSync(DATA,{recursive:true});
let proc=null, startedAt=null, lastExit=null;
let clients=new Set(), history=[];
function log(line){const s=String(line).replace(/\x1b\[[0-9;]*m/g,'');history.push(s);if(history.length>500)history.shift();for(const c of clients)if(c.readyState===1)c.send(s);}
const auth=(req,res,next)=>{const v=req.headers.authorization?.replace(/^Bearer /i,'')||'';if(v.length!==TOKEN.length||!Buffer.from(v).equals(Buffer.from(TOKEN)))return res.status(401).json({error:'Unauthorized'});next();};
app.get('/health',(_q,r)=>r.json({ok:true,service:'openkore-worker'}));
app.use(auth);
app.get('/status',(_q,r)=>r.json({running:!!proc, pid:proc?.pid||null, startedAt, lastExit, configDirectory:DATA, executable:path.join(ROOT,'openkore.pl')}));
app.post('/start',(_q,r)=>{if(proc)return r.json({ok:true,running:true,message:'Already running'});const script=path.join(ROOT,'openkore.pl');if(!fs.existsSync(script))return r.status(500).json({error:'OpenKore source not found in image'});try{proc=spawn('perl',[script,'--control',DATA],{cwd:ROOT,env:{...process.env,HOME:'/data'},stdio:['pipe','pipe','pipe']});startedAt=new Date().toISOString();lastExit=null;log('[manager] OpenKore starting, pid '+proc.pid);proc.stdout.on('data',b=>log(b.toString()));proc.stderr.on('data',b=>log('[stderr] '+b.toString()));proc.on('error',e=>{log('[process error] '+e.message);proc=null;});proc.on('exit',(code,signal)=>{lastExit={code,signal,at:new Date().toISOString()};log('[process exited] code='+code+' signal='+signal);proc=null;});r.json({ok:true,running:true,pid:proc.pid});}catch(e){proc=null;r.status(500).json({error:e.message});}});
app.post('/stop',(_q,r)=>{if(!proc)return r.json({ok:true,running:false,message:'Not running'});const p=proc;p.kill('SIGTERM');setTimeout(()=>{if(proc===p) p.kill('SIGKILL');},10000).unref();r.json({ok:true,stopping:true});});
app.post('/restart',(_q,r)=>{if(proc){proc.kill('SIGTERM');}r.json({ok:true,message:'Stop requested; start after process exits'});});
server.on('upgrade',(req,socket,head)=>{const u=new URL(req.url,'http://localhost'),v=u.searchParams.get('token')||'';if(u.pathname!='/terminal'||v.length!==TOKEN.length||!Buffer.from(v).equals(Buffer.from(TOKEN))){socket.destroy();return;}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));});
wss.on('connection',ws=>{clients.add(ws);for(const line of history)ws.send(line);ws.on('message',data=>{const command=data.toString().trim();if(!command)return;if(command.length>300){ws.send('[rejected] command too long');return;}if(!proc||!proc.stdin.writable){ws.send('[worker] OpenKore is not running');return;}if(!/^(?:status|help|where|who|look|inventory|items|skills|party|guild|sit|stand|move\s+-?\d+\s+-?\d+|talknpc\s+[\w.-]+)$/i.test(command)){ws.send('[rejected] Only the allowlisted safe commands are accepted by this manager');return;}proc.stdin.write(command+'\n');});ws.on('close',()=>clients.delete(ws));});
server.listen(PORT,'0.0.0.0',()=>console.log('OpenKore worker listening on '+PORT));
