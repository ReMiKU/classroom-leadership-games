import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, copyFile, readFile, rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import * as game from '../game.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const build=await mkdtemp(path.join(root,'.tiebreak-build-test-'));
after(()=>rm(build,{recursive:true,force:true,maxRetries:10,retryDelay:100}));
for(const name of ['app.mjs','game.mjs','style.css','index.html','assets/three-v-three.png','scripts/prepare-access-layout.mjs','scripts/navigation-renderers.mjs']) {
  await mkdir(path.dirname(path.join(build,name)),{recursive:true});
  await copyFile(path.join(root,name),path.join(build,name));
}
execFileSync(process.execPath,['scripts/prepare-access-layout.mjs'],{cwd:build,stdio:'pipe'});
const projector=await readFile(path.join(build,'public/projector.mjs'),'utf8');
const controller=await readFile(path.join(build,'.private/facilitator-app.mjs'),'utf8');
const copiedGame=await import(pathToFileURL(path.join(build,'public/game.mjs')).href);

function tied(count=3) {
  return game.finishGame(game.applyRound({version:1,session:'Generated test',totalRounds:1,duration:30,startingPoints:0,
    teams:Array.from({length:count},(_,i)=>({id:i+1,name:`Team ${i+1}`,members:['Representative'],score:0})),
    phase:'preview',choices:Array(count).fill('red'),champion:null,champions:{red:'',blue:''},draws:0,history:[],timer:{remaining:30,deadline:null},sample:false}));
}
async function browser(code,initial,host=false) {
  const handlers={},elements=new Map();
  const element=()=>({innerHTML:'',textContent:'',classList:{toggle(){},add(){},remove(){}},setAttribute(){},addEventListener(name,cb){this[name]=cb;},showModal(){}});
  const document={body:{classList:{toggle(){}},append(){}},querySelector:s=>{if(!elements.has(s))elements.set(s,element());return elements.get(s);},querySelectorAll:()=>[],createElement:element,addEventListener:(name,fn)=>{handlers[name]=fn;}};
  const context={document,window:{addEventListener(){},scrollTo(){}},location:{search:'',hash:'#board'},URLSearchParams,console,structuredClone,Blob,
    setInterval(){},setTimeout(){},clearTimeout(){},localStorage:{getItem:()=>JSON.stringify(initial),setItem(){}},
    followGame:receive=>receive(initial),connectGame:async()=>({state:initial,save(){}})};
  // Inject only the names actually imported, not every helper in game.mjs.
  for(const m of code.matchAll(/import \{([^}]+)\} from ['"](?:\.\/|\/)game\.mjs['"]/g))
    for(const name of m[1].split(',').map(s=>s.trim())) {assert.ok(name in copiedGame,`missing game export ${name}`);context[name]=copiedGame[name];}
  await vm.runInNewContext('(async()=>{'+code.replace(/^import .*;\r?\n/gm,'')+'\nglobalThis.ui={get state(){return state;},'+(host?'controls,':'receive,')+'board,history,guide};})()',context);
  return {ui:context.ui,handlers,elements,context};
}

test('generated projector renders pending, live and completed knockouts with read-only controls',async()=>{
  let state=tied();
  const d=await browser(projector,state);
  assert.match(d.ui.board(),/Overall title undecided/);
  assert.doesNotMatch(d.ui.board(),/data-action="final-|data-final-representative=/);
  for(const i of state.finalTiebreak.qualifiers)state=game.selectFinalRepresentative(state,i,0);
  state=game.startFinalBracket(state,()=>0.99);
  d.ui.receive(state);
  assert.match(d.ui.board(),/Bye/);
  assert.match(d.ui.board(),/UP NEXT/);
  assert.doesNotMatch(d.ui.board(),/data-action="final-|data-final-representative=/);
  while(game.finalBracket(state.finalTiebreak).current)state=game.recordFinalResult(state,game.finalBracket(state.finalTiebreak).current.teams[0]);
  d.ui.receive(state);
  assert.match(d.ui.board(),/OVERALL CHAMPION/);
  assert.match(d.ui.board(),/Scores unchanged/);
  assert.doesNotMatch(d.ui.board(),/data-action="final-|data-final-representative=/);
  const restored=await browser(projector,JSON.parse(JSON.stringify(state)));
  assert.equal(restored.ui.board(),d.ui.board());
});

test('generated public log reports the title separately from scored rounds and stays read-only',async()=>{
  let state=tied();
  for(const i of state.finalTiebreak.qualifiers)state=game.selectFinalRepresentative(state,i,0);
  state=game.startFinalBracket(state,()=>0.99);
  const d=await browser(projector,state);
  assert.match(d.ui.history(),/Overall title undecided/);
  while(game.finalBracket(state.finalTiebreak).current)state=game.recordFinalResult(state,game.finalBracket(state.finalTiebreak).current.teams[0]);
  d.ui.receive(state);
  assert.match(d.ui.history(),/OVERALL CHAMPION/);
  assert.match(d.ui.history(),/Overall title knockout/);
  assert.match(d.ui.history(),/1 scored rounds/);
  assert.doesNotMatch(d.ui.history(),/data-action=|data-final-representative=/);
});

test('generated controller keeps final helpers and generated logic matches source byte for byte',async()=>{
  const state=tied();
  const d=await browser(controller,state,true);
  assert.match(d.ui.controls(),/data-action="final-start"/);
  assert.match(d.ui.board(),/Overall title undecided/);
  assert.equal(await readFile(path.join(build,'public/game.mjs'),'utf8'),await readFile(path.join(root,'game.mjs'),'utf8'));
  for(const name of ['public/projector.mjs','.private/facilitator-app.mjs','public/game.mjs'])execFileSync(process.execPath,['--check',path.join(build,name)],{stdio:'pipe'});
});

test('authored and generated guides explain one title winner, byes, draws and unchanged scores',async()=>{
  for(const [code,host] of [[projector,false],[controller,true]]) {
    const d=await browser(code,tied(),host);
    const guide=d.ui.guide();
    assert.doesNotMatch(guide,/share the win|No bonus multipliers or elimination/);
    assert.match(guide,/one overall champion/i);
    assert.match(guide,/knockout/i);
    assert.match(guide,/byes/i);
    assert.match(guide,/replay draws/i);
    assert.match(guide,/scores stay unchanged/i);
  }
});

test('API validation runtime dependencies are not explicitly excluded from deployment',async()=>{
  const ignored=new Set((await readFile(path.join(root,'.vercelignore'),'utf8')).split(/\r?\n/).map(s=>s.trim()));
  const visited=new Set();
  async function check(name) {
    if(visited.has(name))return;
    visited.add(name);
    assert.ok(!ignored.has(name)&&!ignored.has('/'+name),`API runtime imports excluded source: ${name}`);
    const code=await readFile(path.join(root,name),'utf8');
    for(const m of code.matchAll(/^import .* from ['"]([^'"]+)['"]/gm))
      if(m[1].startsWith('.'))await check(path.posix.normalize(path.posix.join(path.posix.dirname(name),m[1])));
  }
  await check('lib/live-game.mjs');
});
