import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {del,get} from '@vercel/blob';
import {createBlobGameStore} from '../lib/blob-game.mjs';
import {createGameHandler} from '../lib/live-game.mjs';
import {createGameSync} from '../public/sync-engine.mjs';
import {applyRound} from '../public/game.mjs';
const pathname='verification/sync-'+randomUUID()+'.json';
const store=createBlobGameStore(pathname);
let latest;
try{
  assert.equal(await store.read(),null);
  const first=await store.write({state:{fixture:true,score:50},mutationId:'initial',updatedAt:Date.now()},null);latest=first;
  assert.ok(first.revision);
  const independent=createBlobGameStore(pathname);
  const firstRead=await independent.read();
  assert.equal(firstRead.state.score,50);
  assert.equal(firstRead.revision,first.revision,'Read and write must return the same revision');
  const second=await independent.write({state:{fixture:true,score:54},mutationId:'score',updatedAt:Date.now()},first.revision);latest=second;
  const secondRead=await store.read();
  assert.equal(secondRead.state.score,54);
  assert.equal(secondRead.revision,second.revision,'An overwrite must return its readable revision');
  await assert.rejects(()=>store.write({state:{fixture:true,score:0}},first.revision),error=>error.code==='CONFLICT');
  await assert.rejects(()=>store.write({state:{fixture:true,score:0}},null),error=>error.code==='CONFLICT');
  // A realistic game crosses the compression threshold. Small records cannot
  // reproduce the weak-ETag failure that previously broke reset and recovery.
  const game={version:1,session:'Isolated compression and recovery test',totalRounds:8,duration:30,startingPoints:50,teams:Array.from({length:6},(_,i)=>({id:i+1,name:'Verification team '+(i+1),members:Array.from({length:5},(_,j)=>'Fictional test student '+i+' '+j+' · classroom fixture'),score:50})),phase:'preview',choices:['red','blue','blue','blue','blue','blue'],champion:null,champions:{red:'',blue:''},draws:0,history:[],timer:{remaining:30,deadline:null},sample:false};
  const scored=applyRound(game);
  latest=await store.write({state:scored,mutationId:'scored-fixture',updatedAt:Date.now()},latest.revision);
  const compressed=await get(pathname,{access:'private',useCache:false,headers:{'accept-encoding':'gzip'}});await new Response(compressed.stream).arrayBuffer();
  assert.ok(compressed.blob.etag.startsWith('W/'),'Fixture must reproduce weak tags from compression');
  const uncompressed=await store.read();assert.equal(uncompressed.revision,latest.revision);assert.ok(!uncompressed.revision.startsWith('W/'));
  const origin='https://isolated-verification.example';
  const handler=createGameHandler({store,authenticate:async()=>true});
  const read=async()=>{const response=await handler(new Request(origin+'/api/game?manage=1'));assert.equal(response.status,200);return response.json();};
  const write=async data=>{const response=await handler(new Request(origin+'/api/game',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(data)}));return {ok:response.ok,status:response.status,data:await response.json()};};
  const olderRevision=(await read()).revision;
  const reset={...game,phase:'discuss',startingPoints:0,duration:45,totalRounds:3,history:[],choices:Array(6).fill(null),teams:game.teams.map(t=>({...t,score:0})),timer:{remaining:45,deadline:null}};
  const fresh=createGameSync({read,write,revision:olderRevision});fresh.save(reset,{replace:true});await fresh.flush();
  assert.deepEqual((await read()).state.teams.map(t=>t.score),Array(6).fill(0));
  const stale=createGameSync({read,write,revision:olderRevision});stale.save({...reset,session:'Recovered isolated changes'});await assert.rejects(stale.flush());
  await stale.resolve('mine');
  const recovered=await read();assert.equal(recovered.state.session,'Recovered isolated changes');assert.equal(recovered.state.history.length,0);assert.equal(recovered.state.duration,45);assert.deepEqual(recovered.state.teams.map(t=>t.score),Array(6).fill(0));
  latest=await store.read();
  console.log('Private Blob full-game verification passed: compressed weak tags reproduced; identity reads preserve strong revisions; API reset to zero and Save my changes recovery both persisted. Live classroom session untouched.');
}finally{
  if(latest&&pathname.startsWith('verification/sync-')){const current=await store.read();if(current)await del(pathname,{ifMatch:current.revision});}
}
