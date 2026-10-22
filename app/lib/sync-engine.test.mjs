import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameSync} from '../public/sync-engine.mjs';

function fixture(){
  let data={state:{score:50},revision:'v1'},counter=1,drop=false;
  const writes=[],statuses=[],conflicts=[],received=[],backups=[];
  const read=async()=>structuredClone(data);
  const write=async request=>{
    writes.push(structuredClone(request));
    if(request.mutationId===data.mutationId)return {ok:true,status:200,data:{revision:data.revision}};
    if(request.revision!==data.revision)return {ok:false,status:409,data:{}};
    data={...structuredClone(request),revision:'v'+(++counter)};
    if(drop){drop=false;throw Error('Lost response after successful save');}
    return {ok:true,status:200,data:{revision:data.revision}};
  };
  const make=()=>createGameSync({read,write,revision:'v1',status:s=>statuses.push(s),conflict:c=>conflicts.push(c),remote:s=>received.push(s),backup:s=>backups.push(s)});
  return {make,read,writes,statuses,conflicts,received,backups,dropNext:()=>{drop=true;}};
}
test('a new zero-point session from an old Manage tab replaces the latest shared game and survives reload',async()=>{
  const f=fixture(),a=f.make(),b=f.make();
  a.save({score:75,rounds:[1,2]});await a.flush();
  b.save({score:0,rounds:[],session:'Fresh classroom'},{replace:true});await b.flush();
  const reloaded=await f.read();assert.deepEqual(reloaded.state,{score:0,rounds:[],session:'Fresh classroom'});assert.deepEqual(f.conflicts,[]);assert.equal(f.statuses.at(-1),'saved');
});
test('lost acknowledgement retains the old request identity even when a newer change is queued',async()=>{
  const f=fixture(),desk=f.make();f.dropNext();
  desk.save({score:51});await assert.rejects(desk.flush());
  assert.equal(f.statuses.at(-1),'offline');
  desk.save({score:52});await desk.flush();
  assert.equal(f.writes[0].mutationId,f.writes[1].mutationId);assert.equal((await f.read()).state.score,52);assert.deepEqual(f.conflicts,[]);assert.equal(desk.hasPending(),false);
});
test('a real competing edit exposes recovery, and saving the local version uses the current revision',async()=>{
  const f=fixture(),a=f.make(),b=f.make();a.save({score:60});await a.flush();
  b.save({score:70});await assert.rejects(b.flush());assert.deepEqual(f.conflicts,[409]);assert.equal((await f.read()).state.score,60);
  await b.resolve('mine');assert.equal((await f.read()).state.score,70);assert.equal(b.isBlocked(),false);
});
test('loading shared state clears a conflict; a later fresh reset can also recover',async()=>{
  const f=fixture(),a=f.make(),b=f.make();a.save({score:60});await a.flush();
  b.save({score:70});await assert.rejects(b.flush());await b.resolve('remote');assert.deepEqual(f.received.at(-1),{score:60});assert.equal(b.hasPending(),false);
  a.save({score:80});await a.flush();b.save({score:90});await assert.rejects(b.flush());
  b.save({score:0},{replace:true});await b.flush();assert.equal((await f.read()).state.score,0);
});
test('idle managers receive shared updates while pending changes are never silently replaced',async()=>{
  const f=fixture(),a=f.make(),b=f.make();a.save({score:60});await a.flush();await b.refresh();assert.deepEqual(f.received.at(-1),{score:60});
  b.save({score:70});a.save({score:80});await a.flush();await b.refresh();assert.deepEqual(f.received.at(-1),{score:60});
});
test('concurrent flush calls send one write and readiness is not announced before acknowledgement',async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});let count=0;
  const statuses=[];const desk=createGameSync({read:async()=>({revision:'v1'}),revision:'v1',status:s=>statuses.push(s),write:async()=>{count++;await gate;return {ok:true,status:200,data:{revision:'v2'}};}});
  desk.save({score:0},{replace:true});const first=desk.flush(),second=desk.flush();await Promise.resolve();assert.equal(statuses.includes('saved'),false);release();await Promise.all([first,second]);assert.equal(count,1);assert.equal(statuses.at(-1),'saved');
});
test('an old background read cannot undo a reset that saves while the read is in flight',async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});const received=[];let first=true;
  const desk=createGameSync({revision:'v1',remote:s=>received.push(s),read:async()=>{if(first){first=false;await gate;return {revision:'old',state:{score:50}};}return {revision:'v1'};},write:async()=>({ok:true,status:200,data:{revision:'v2'}})});
  const refresh=desk.refresh();desk.save({score:0},{replace:true});await desk.flush();release();await refresh;assert.deepEqual(received,[]);
});
