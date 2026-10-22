import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {createGameHandler} from './live-game.mjs';
import {fileGameStore} from './file-game.mjs';
import {createAccessHandler} from './access.mjs';
import {applyRound} from '../game.mjs';
const origin='https://game.example';
const passcode='TEST-CODE-ONLY-2948';
const access=createAccessHandler({passcode,secret:'test-secret-longer-than-thirty-two-characters'});
const fresh=()=>({version:1,session:'Classroom test',totalRounds:8,duration:30,startingPoints:50,teams:Array.from({length:6},(_,i)=>({id:i+1,name:'Team '+(i+1),members:[],score:50})),phase:'record',choices:['red','red','blue','blue','blue','blue'],champion:null,champions:{red:'private draft',blue:''},draws:0,history:[],timer:{remaining:30,deadline:null},sample:false});
async function fixture(run){
  const folder=await mkdtemp(path.join(process.cwd(),'.facilitator-sync-test-'));
  try{
    const store=fileGameStore(path.join(folder,'game.json'));
    const handle=createGameHandler({store,authenticate:async request=>(await access(new Request(origin+'/api/access',{headers:request.headers}))).ok});
    const login=await access(new Request(origin+'/api/access',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({action:'login',passcode})}));
    const cookie=login.headers.get('set-cookie').split(';')[0];
    const get=(manage=false,auth=false)=>handle(new Request(origin+'/api/game'+(manage?'?manage=1':''),{headers:auth?{cookie}:{}}));
    const post=(state,revision=null,mutationId='first-write',headers={cookie})=>handle(new Request(origin+'/api/game',{method:'POST',headers:{origin,'Content-Type':'application/json',...headers},body:JSON.stringify({state,revision,mutationId})}));
    await run({store,get,post,cookie});
  }finally{if(!folder.startsWith(path.join(process.cwd(),'.facilitator-sync-test-')))throw Error('Unexpected test path');await rm(folder,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
}
test('independent anonymous viewer sees shared board and scored log, never draft choices',()=>fixture(async({get,post,store})=>{
  assert.equal((await (await get()).json()).state,null);
  const state=fresh();state.incidentalSecret='do not publish';
  const saved=await (await post(state)).json();
  const viewer=await get();assert.match(viewer.headers.get('cache-control'),/no-store/);
  const publicData=await viewer.json();assert.deepEqual(publicData.state.choices,Array(6).fill(null));assert.deepEqual(publicData.state.champions,{red:'',blue:''});assert.equal(publicData.state.incidentalSecret,undefined);assert.equal(publicData.revision,undefined);
  assert.deepEqual((await (await get(true,true)).json()).state.choices,state.choices);
  state.phase='preview';const scored=applyRound(state);
  const response=await post(scored,saved.revision,'score-round');assert.equal(response.status,200);
  const otherViewer=(await (await get()).json()).state;assert.equal(otherViewer.teams[0].score,54);assert.equal(otherViewer.teams[2].score,48);assert.equal(otherViewer.history.length,1);assert.deepEqual(otherViewer.choices,state.choices);
  // A new adapter (like a new function instance) reads the same durable data.
  assert.equal((await store.read()).state.history.length,1);
}));
test('anonymous and cross-origin writes fail; forged sessions cannot read manager state',()=>fixture(async({get,post,cookie})=>{
  assert.equal((await post(fresh(),null,'x',{})).status,401);
  assert.equal((await post(fresh(),null,'x',{cookie,origin:'https://attacker.example'})).status,403);
  assert.equal((await get(true)).status,401);
  assert.equal((await post(fresh(),null,'x',{cookie:'__Host-leadership_facilitator=forged'})).status,401);
  assert.equal((await get()).status,200);
}));
test('stale and concurrent managers cannot overwrite; retry after lost response is idempotent',()=>fixture(async({post,get})=>{
  const state=fresh();const first=await (await post(state)).json();
  assert.equal((await post(state,null,'different-manager')).status,409);
  const retry=await post(state,null,'first-write');assert.equal(retry.status,200);assert.equal((await retry.json()).revision,first.revision);
  const results=await Promise.all([post({...state,session:'A'},first.revision,'A'),post({...state,session:'B'},first.revision,'B')]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal((await (await get()).json()).state.history.length,0);
}));
test('invalid state is rejected without replacing an existing game',()=>fixture(async({post,get})=>{
  const first=await (await post(fresh())).json();
  assert.equal((await post({...fresh(),choices:['red']},first.revision,'bad')).status,400);
  assert.equal((await (await get()).json()).state.teams.length,6);
}));
