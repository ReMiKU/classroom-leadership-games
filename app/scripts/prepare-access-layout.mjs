import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { publicHeader, privateHeader, publicHistory, publicRender, publicSpotlight } from './navigation-renderers.mjs';

const root=process.cwd();
const original=await readFile(path.join(root,'app.mjs'),'utf8');
await mkdir(path.join(root,'.private'),{recursive:true});
await mkdir(path.join(root,'public','assets'),{recursive:true});
let host=original.replace("from './game.mjs'","from '/game.mjs'")
  .replace("const KEY =", "import { connectGame } from '/live-sync.mjs';\nconst KEY =")
  .replace("const channel =",`let online;
try { online=await connectGame(state,{
  receive:next=>{state=next;setupDraft=null;try{localStorage.setItem(KEY,JSON.stringify(state));}catch{}render();},
  canRefresh:()=>!setupDraft,
  confirm:confirmAction
});state=online.state;localStorage.setItem(KEY,JSON.stringify(state)); }
catch {document.querySelector('#app').innerHTML='<main class="access-page"><section class="access-card"><h1>Unable to connect.</h1><p>Your browser’s saved game is safe. Check your connection, then reload to open the shared game.</p><button onclick="location.reload()">Retry connection</button></section></main>';throw Error('Shared game connection failed');}
const channel =`)
  .replace(/^const isDisplay = .*$/m,'const isDisplay = false;')
  .replace("new BroadcastChannel(KEY)","new BroadcastChannel(KEY+'-projector-v2')")
  .replace("  channel?.postMessage(state);",`  const visible=['tie','preview','result','complete'].includes(state.phase);
  const snapshot={...state,choices:visible?[...state.choices]:state.choices.map(()=>null)};
  try {localStorage.setItem(KEY+'-projector-v2',JSON.stringify(snapshot));} catch {}
  channel?.postMessage(snapshot);
  online.save(state,options);`)
  .replace(/function receive\(next\)[\s\S]*?window\.addEventListener\('storage',[^\n]*\n/,'')
  .replace(/^const route = .*$/m,"const route = () => location.hash==='#teams'?'teams':'board';")
  .replace(/function header\(\) \{[\s\S]*?\n\}\n\nfunction home/,privateHeader.toString().replace('function privateHeader','function header')+'\n\nfunction home')
  .replaceAll('href="#history"','href="/#history"')
  .replace('if(!isDisplay) persist();','')
  .replace('Facilitator-led · Saved in this browser','Facilitator-led · Shared online');
host+=`\nwindow.addEventListener('facilitator:locking',()=>{if(state.timer.deadline)state.timer={remaining:remaining(),deadline:null};persist();});\n`;
await writeFile(path.join(root,'.private','facilitator-app.mjs'),host);

function extract(name) {
  const start=original.indexOf(`function ${name}(`);
  if(start<0)throw new Error('Missing renderer '+name);
  if(name==='debrief') return original.slice(start,original.indexOf('\n',start));
  const end=original.indexOf('\n}',start);
  return original.slice(start,end+2);
}
const viewer=`import { outcome, finalLeaders, finalBracket } from './game.mjs';
import { followGame } from './live-sync.mjs';
const KEY='leadership-lab-redblue-v1-projector-v2';
const isDisplay=true;
let state=null;
const route=()=>['board','history','guide','home'].includes(location.hash.slice(1))?location.hash.slice(1):(new URLSearchParams(location.search).has('display')?'board':'home');
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const signed=n=>n>0?'+'+n:String(n);
const teamNumber=i=>String(i+1).padStart(2,'0');
const roundNumber=()=>Math.min(state.history.length+(['result','complete'].includes(state.phase)?0:1),state.totalRounds);
const revealed=()=>['tie','preview','result','complete'].includes(state.phase);
const result=()=>state.choices.every(Boolean)?outcome(state.choices,state.champion):null;
const remaining=()=>state.timer.deadline?Math.max(0,Math.ceil((state.timer.deadline-Date.now())/1000)):state.timer.remaining;
const clockText=()=>Math.floor(remaining()/60)+':'+String(remaining()%60).padStart(2,'0');
${publicHeader.toString().replace('function publicHeader','function header')}
${['board','finalSummary','finalRepresentative','finalTiebreakStage','splitBanner','teamCard','calculation','championStage','debrief'].map(extract).join('\n\n')}
${extract('home').replace(/const inProgress=.*?;/,'const inProgress=false;')}
${extract('guide').replace('Enter 2–12 teams, add members if useful, and choose your session length.','The facilitator opens Manage, enters the passcode, then adds teams and chooses the session length.')}
${publicHistory.toString().replace('function publicHistory','function history')}
${publicRender.toString().replace('function publicRender','function render')}
function receive(next){state=next;render();}
${publicSpotlight.toString().replace('function publicSpotlight','function startSpotlight')}
const showSpotlight=startSpotlight();
const connection=document.createElement('div');connection.className='sync-status';connection.setAttribute('role','status');document.body.append(connection);
connection.textContent='Connecting to the shared game…';
followGame(receive,(message,error=false)=>{connection.textContent=message;connection.classList.toggle('sync-error',error);});
window.addEventListener('hashchange',()=>{render();window.scrollTo(0,0);});
document.addEventListener('click',async event=>{if(event.target.closest('[data-action="fullscreen"]')){if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}});
setInterval(()=>{if(!state)return;document.querySelectorAll('.clock').forEach(el=>el.textContent=clockText());},250);
render();
`;
await writeFile(path.join(root,'public','projector.mjs'),viewer);
for(const name of ['index.html','style.css','game.mjs'])await copyFile(path.join(root,name),path.join(root,'public',name));
await copyFile(path.join(root,'assets','three-v-three.png'),path.join(root,'public','assets','three-v-three.png'));
let html=await readFile(path.join(root,'public','index.html'),'utf8');
html=html.replace('src="./app.mjs"','src="./entry.mjs"');
await writeFile(path.join(root,'public','index.html'),html);
console.log('Prepared public display and private facilitator assets.');
