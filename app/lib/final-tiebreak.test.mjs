import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameHandler,validateGame,publicGame} from './live-game.mjs';
import {createGameSync} from '../public/sync-engine.mjs';
import {applyRound,finishGame,selectFinalRepresentative,startFinalBracket,recordFinalResult,finalBracket} from '../game.mjs';

function fixture() {
  let s={version:1,session:'Synthetic knockout test',totalRounds:1,duration:30,startingPoints:0,
    teams:Array.from({length:5},(_,i)=>({id:i+1,name:`Team ${i+1}`,members:['Member'],score:i<3?5:0})),
    phase:'preview',choices:Array(5).fill('red'),champion:null,champions:{red:'',blue:''},draws:0,history:[],timer:{remaining:30,deadline:null},sample:false};
  s=finishGame(applyRound(s));
  for(const i of s.finalTiebreak.qualifiers)s=selectFinalRepresentative(s,i,0);
  return startFinalBracket(s,()=>0.99);
}

test('API rejects malformed or stale knockout states while accepting legacy and selection saves',()=>{
  const valid=fixture();
  const cases=[
    s=>s.finalTiebreak.qualifiers=[0,1,3],
    s=>s.finalTiebreak.qualifiers=[0,0,1],
    s=>s.finalTiebreak.order=[0,1,1],
    s=>s.finalTiebreak.order=[0,1],
    s=>s.finalTiebreak.order='012',
    s=>delete s.finalTiebreak.representatives[0],
    s=>s.finalTiebreak.representatives[0]=-1,
    s=>s.finalTiebreak.representatives[0]=0.5,
    s=>s.finalTiebreak.representatives[0]=1,
    s=>s.finalTiebreak.representatives[3]=0,
    s=>s.finalTiebreak.results=[{winner:2}], // bye team cannot win first match
    s=>s.finalTiebreak.results=[{winner:0},{winner:0},{winner:0}], // extra result
    s=>s.finalTiebreak.results=[{winner:'0'}],
    s=>s.finalTiebreak.results=[{}],
    s=>s.finalTiebreak.results=Array(10001).fill({winner:null}),
    s=>{s.finalTiebreak.order=null;s.finalTiebreak.results=[{winner:null}];},
    s=>s.phase='result',
    s=>s.history=[],
    s=>s.teams[0].score=10,
    s=>s.finalTiebreak={}
  ];
  for(const mutate of cases){const s=structuredClone(valid);mutate(s);assert.throws(()=>validateGame(s),undefined,String(mutate));}
  const legacy=structuredClone(valid);delete legacy.finalTiebreak;
  assert.equal(validateGame(legacy).finalTiebreak,null);
  const selecting=structuredClone(valid);selecting.finalTiebreak.order=null;selecting.finalTiebreak.representatives={};
  assert.deepEqual(validateGame(selecting).finalTiebreak,selecting.finalTiebreak);
  assert.deepEqual(publicGame(validateGame(valid)).finalTiebreak,valid.finalTiebreak);
});

test('final bracket survives allowlisted API, public reads and sync backup/reload without reshuffling',async()=>{
  let stored=null,revision=0,backup=null;
  const store={read:async()=>structuredClone(stored),write:async data=>{stored={...structuredClone(data),revision:String(++revision)};return stored;}};
  const handle=createGameHandler({store,authenticate:async()=>true});
  const read=async()=> (await handle(new Request('https://test.example/api/game?manage=1'))).json();
  const sync=createGameSync({read,backup:v=>{backup=JSON.stringify(v);},write:async data=>{
    const response=await handle(new Request('https://test.example/api/game',{method:'POST',headers:{origin:'https://test.example','content-type':'application/json'},body:JSON.stringify(data)}));
    return {ok:response.ok,status:response.status,data:await response.json()};
  }});
  let s=recordFinalResult(fixture(),null);
  s.finalTiebreak.incidentalSecret='not public';s.finalTiebreak.results[0].privateNote='not public';
  sync.save(s);
  assert.deepEqual(JSON.parse(backup).state.finalTiebreak.order,s.finalTiebreak.order);
  await sync.flush();assert.equal(backup,'null');
  const restored=(await read()).state;
  assert.ok(restored.finalTiebreak,'API must not drop the bracket');
  assert.deepEqual(restored.finalTiebreak.order,s.finalTiebreak.order);
  assert.equal(restored.finalTiebreak.incidentalSecret,undefined);
  assert.deepEqual(restored.finalTiebreak.results,[{winner:null}]);
  assert.deepEqual(startFinalBracket(restored,()=>{throw Error('reshuffled');}),restored);
  const viewer=(await (await handle(new Request('https://test.example/api/game'))).json()).state;
  assert.deepEqual(viewer.finalTiebreak,restored.finalTiebreak);
  let completed=restored;
  while(finalBracket(completed.finalTiebreak).current) completed=recordFinalResult(completed,finalBracket(completed.finalTiebreak).current.teams[0]);
  sync.save(completed);await sync.flush();
  assert.equal(finalBracket((await read()).state.finalTiebreak).winner,0);
  assert.deepEqual((await read()).state.teams,s.teams);
});
