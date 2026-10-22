import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createAccessHandler } from './lib/access.mjs';
import {createGameHandler} from './lib/live-game.mjs';
import {fileGameStore} from './lib/file-game.mjs';
const projectRoot=fileURLToPath(new URL('.',import.meta.url));
const root = path.join(projectRoot,'public')+path.sep;
let secrets={};
try{secrets=JSON.parse(await readFile(path.join(projectRoot,'.facilitator-secrets.json'),'utf8'));}catch{}
const handleAccess=createAccessHandler({passcode:secrets.FACILITATOR_PASSCODE,secret:secrets.FACILITATOR_SESSION_SECRET,loadFacilitator:()=>readFile(path.join(projectRoot,'.private','facilitator-app.mjs'),'utf8')});
const previewPort=Number(process.env.LEADERSHIP_PREVIEW_PORT||4173);
const previewFile=process.env.LEADERSHIP_PREVIEW_TEST==='1'?'.facilitator-isolated-preview.json':'.facilitator-live-game.json';
const handleGame=createGameHandler({store:fileGameStore(path.join(projectRoot,previewFile)),authenticate:async request=>(await handleAccess(new Request(new URL('/api/access',request.url),{headers:request.headers}))).ok});
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.mjs':'text/javascript', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if(pathname==='/api/access'||pathname==='/api/game') {
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>(pathname==='/api/game'?131072:1024)){res.writeHead(413);res.end();return;}chunks.push(chunk);}
      const options={method:req.method,headers:req.headers};
      if(!['GET','HEAD'].includes(req.method))options.body=Buffer.concat(chunks);
      const response=await (pathname==='/api/game'?handleGame:handleAccess)(new Request('http://'+req.headers.host+req.url,options));
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root) || pathname.split('/').some(p=>p.startsWith('.')) || !['GET','HEAD'].includes(req.method)) { res.writeHead(403); res.end(); return; }
    const bytes = await readFile(file);
    res.writeHead(200, {'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store'});
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(previewPort, '127.0.0.1', () => process.stdout.write(`Local: http://127.0.0.1:${previewPort}\n`));
