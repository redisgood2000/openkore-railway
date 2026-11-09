import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'node:http';

const app = express();
app.use(express.json({ limit: '32kb' }));
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const PORT = Number(process.env.PORT || 3000);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const WORKER_URL = process.env.WORKER_URL;
const WORKER_TOKEN = process.env.WORKER_TOKEN;
if (!ADMIN_TOKEN || !WORKER_URL || !WORKER_TOKEN) {
  console.error('Missing ADMIN_TOKEN, WORKER_URL, or WORKER_TOKEN'); process.exit(1);
}
const auth = (req,res,next) => {
  const supplied = req.headers.authorization?.replace(/^Bearer /i,'');
  if (!supplied || supplied.length !== ADMIN_TOKEN.length ||
      !Buffer.from(supplied).equals(Buffer.from(ADMIN_TOKEN))) return res.status(401).json({error:'Unauthorized'});
  next();
};
async function worker(path, method='GET', body) {
  const r = await fetch(new URL(path, WORKER_URL), {
    method, headers: {'Authorization': 'Bearer '+WORKER_TOKEN, 'Content-Type':'application/json'},
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(8000)
  });
  const data = await r.json().catch(()=>({error:'Invalid worker response'}));
  if (!r.ok) throw Object.assign(new Error(data.error || 'Worker request failed'), {status:r.status});
  return data;
}
app.get('/health', (_req,res)=>res.json({ok:true,service:'openkore-manager-api'}));
app.use('/api', auth);
app.get('/api/status', async (_req,res)=>{ try {res.json(await worker('/status'));} catch(e){res.status(e.status||502).json({error:e.message});} });
for (const action of ['start','stop','restart']) app.post('/api/'+action, async (_req,res)=>{
  try {res.json(await worker('/'+action,'POST'));} catch(e){res.status(e.status||502).json({error:e.message});}
});
app.get('/', (_req,res)=>res.type('html').send(page));
server.on('upgrade',(req,socket,head)=>{
  const url = new URL(req.url,'http://localhost');
  const token = url.searchParams.get('token') || '';
  if (url.pathname !== '/terminal' || token.length !== ADMIN_TOKEN.length ||
      !Buffer.from(token).equals(Buffer.from(ADMIN_TOKEN))) { socket.destroy(); return; }
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));
});
wss.on('connection', async ws=>{
  let upstream;
  try {
    const {WebSocket} = await import('ws');
    upstream = new WebSocket(WORKER_URL.replace(/^http/,'ws')+'/terminal?token='+encodeURIComponent(WORKER_TOKEN));
    upstream.on('message',data=>{if(ws.readyState===1)ws.send(data.toString());});
    upstream.on('close',()=>{if(ws.readyState===1)ws.send('[worker terminal disconnected]');});
    ws.on('message',data=>{ if(upstream.readyState===1) upstream.send(data.toString()); });
    ws.on('close',()=>upstream.close());
  } catch { ws.send('[Unable to connect to worker terminal]'); }
});
server.listen(PORT,'0.0.0.0',()=>console.log('Manager listening on '+PORT));
const page = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Midgard • OpenKore</title><style>
*{box-sizing:border-box}body{margin:0;background:#09111e;color:#e8f0ff;font:15px system-ui}main{max-width:1100px;margin:auto;padding:28px}.top{display:flex;justify-content:space-between;align-items:center;gap:16px}h1{font-size:25px;margin:0}.muted{color:#8fa3bd}.panel{background:#111e30;border:1px solid #263953;border-radius:16px;padding:20px;margin-top:18px}.actions{display:flex;gap:10px;flex-wrap:wrap}button{border:0;border-radius:10px;padding:12px 18px;font-weight:700;background:#d7a84c;color:#172033}button.secondary{background:#263953;color:#e8f0ff}input{padding:12px;border-radius:10px;border:1px solid #354b68;background:#091522;color:white;width:min(100%,340px)}pre{white-space:pre-wrap;background:#050b13;border-radius:12px;padding:16px;min-height:240px;max-height:440px;overflow:auto;color:#b7e3c1}.grid{display:grid;grid-template-columns:1fr 2fr;gap:18px}@media(max-width:700px){.grid{grid-template-columns:1fr}main{padding:16px}}</style></head><body><main><div class="top"><div><h1>Midgard / OpenKore</h1><div class="muted">Private bot control center</div></div><span id="state" class="muted">Not connected</span></div><section class="panel"><input id="token" type="password" placeholder="Admin access token" autocomplete="off"><button onclick="connect()">Connect</button></section><div class="grid"><section class="panel"><h2>Worker</h2><p id="status" class="muted">Connect to load worker status.</p><div class="actions"><button onclick="act('start')">Start</button><button class="secondary" onclick="act('stop')">Stop</button><button class="secondary" onclick="act('restart')">Restart</button><button class="secondary" onclick="refresh()">Refresh</button></div><p class="muted">Configure account and server credentials in the worker's persistent OpenKore control files, not in this browser.</p></section><section class="panel"><h2>Live terminal</h2><pre id="log">Waiting for connection…</pre></section></div></main><script>
let token='',ws;const el=id=>document.getElementById(id);
async function api(path,method='GET'){const r=await fetch('/api'+path,{method,headers:{Authorization:'Bearer '+token}});const d=await r.json();if(!r.ok)throw Error(d.error||r.statusText);return d}
async function connect(){token=el('token').value;if(!token)return;try{await refresh();el('state').textContent='Connected';ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/terminal?token='+encodeURIComponent(token));ws.onmessage=e=>{el('log').textContent=(el('log').textContent+'\n'+e.data).slice(-18000);el('log').scrollTop=el('log').scrollHeight};ws.onopen=()=>el('log').textContent='Terminal connected';ws.onclose=()=>el('state').textContent='Terminal disconnected'}catch(e){el('state').textContent=e.message}}
async function refresh(){const d=await api('/status');el('status').textContent=JSON.stringify(d,null,2)}
async function act(a){try{const d=await api('/'+a,'POST');el('status').textContent=JSON.stringify(d,null,2)}catch(e){el('status').textContent=e.message}}
</script></body></html>`;
