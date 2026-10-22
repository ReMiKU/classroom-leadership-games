import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as game from '../game.mjs';

const source=await readFile(new URL('../app.mjs',import.meta.url),'utf8');
function saved(scores=[4,4,4]) {
  return game.applyRound({version:1,session:'UI test',totalRounds:1,duration:30,startingPoints:0,
    teams:scores.map((score,i)=>({id:i+1,name:`Team ${i+1}`,members:i?[]:['Alex','Jo'],score})),
    phase:'preview',choices:scores.map(()=>'red'),champion:null,champions:{red:'',blue:''},draws:0,history:[],timer:{remaining:30,deadline:null},sample:false});
}
function desk(initial,code=source,extra={}) {
  const handlers={},elements=new Map(),storage=new Map([['leadership-lab-redblue-v1',JSON.stringify(initial)]]);
  const element=()=>({textContent:'',innerHTML:'',classList:{add(){},remove(){},toggle(){}},showModal(){},addEventListener(name,cb){this[name]=cb;}});
  const document={body:{classList:{toggle(){}},append(){}},createElement:()=>({click(){}}),querySelector:s=>{if(!elements.has(s))elements.set(s,element());return elements.get(s);},querySelectorAll:()=>[],addEventListener:(name,cb)=>{handlers[name]=cb;}};
  const context={...game,document,window:{addEventListener(){}},location:{search:'',hash:'#board'},URLSearchParams,structuredClone,Blob,console,
    setInterval(){},setTimeout(){},clearTimeout(){},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},...extra};
  vm.runInNewContext(code.replace(/^import .*;\r?\n/gm,'')+'\nglobalThis.ui={get state(){return state;},set state(value){state=value;},fresh,setup,board,controls,history,guide,download};',context);
  return {ui:context.ui,context,storage,elements,
    click:(action,data={})=>handlers.click({target:{closest:()=>({disabled:false,dataset:{action,...data}})}}),
    change:(team,value)=>handlers.change({target:{dataset:{finalRepresentative:String(team)},value:String(value)}}),
    submit:()=>handlers.submit({target:{id:'setup-form'},preventDefault(){}}),
    confirm:yes=>{const d=document.querySelector('#confirm-dialog');d.returnValue=yes?'confirm':'cancel';assert.ok(d.close,'confirmation dialog required');d.close();}};
}
const plain=value=>JSON.parse(JSON.stringify(value));

test('CSV distinguishes zero-point title matches, byes, draws and sole champion from scored rounds',async()=>{
  let state=game.finishGame(saved());
  for(let i=0;i<3;i++)state=game.selectFinalRepresentative(state,i,0);
  state=game.startFinalBracket(state,()=>0.99);
  state=game.recordFinalResult(state,null);
  while(game.finalBracket(state.finalTiebreak).current)state=game.recordFinalResult(state,game.finalBracket(state.finalTiebreak).current.teams[0]);
  let blob;
  const d=desk(state,source,{URL:{createObjectURL:value=>{blob=value;return 'blob:test';},revokeObjectURL(){}}});
  d.ui.download();
  const csv=await blob.text();
  assert.match(csv,/"Record type","Stage","Match","Opponent","Title result"/);
  assert.equal(csv.match(/"Scored round"/g)?.length,3);
  assert.equal(csv.match(/"Title knockout"/g)?.length,3); // two played matches + one bye
  assert.match(csv,/"1","Title knockout","1","1","Team 2","Team 1 wins"/);
  assert.match(csv,/"Bye"/);
  assert.match(csv,/"","Team 1","","0","4","","","Overall title","","","","Champion - knockout"/);
  assert.doesNotMatch(csv,/Alex|Jo/); // member names are not exported
  assert.deepEqual(plain(d.ui.state),state);
});

test('CSV exports pending and unique-leader titles honestly and escapes formula-like team names',async()=>{
  for(const scores of [[4,4,4],[8,4,4]]) {
    const state=game.finishGame(saved(scores));state.teams[0].name='=SUM(1,2)';
    let blob;
    const d=desk(state,source,{URL:{createObjectURL:value=>{blob=value;return 'blob:test';},revokeObjectURL(){}}});
    d.ui.download();
    const csv=await blob.text();
    assert.match(csv,/"'=SUM\(1,2\)"/);
    assert.match(csv,scores[0]===8?/"Champion - highest score"/:/"Pending"/);
    assert.doesNotMatch(csv,/"Title knockout"/);
  }
});

test('confirmed fresh setup clears the knockout and scored history; cancellation preserves both',async()=>{
  let state=game.finishGame(saved());
  for(let i=0;i<3;i++)state=game.selectFinalRepresentative(state,i,0);
  state=game.startFinalBracket(state,()=>0.99);
  state=game.recordFinalResult(state,0);
  const d=desk(state);
  d.ui.setup();
  let pending=d.submit();d.confirm(false);await pending;
  assert.deepEqual(plain(d.ui.state),state);
  pending=d.submit();d.confirm(true);await pending;
  assert.equal(d.ui.state.finalTiebreak,null);
  assert.deepEqual(plain(d.ui.state.history),[]);
  assert.deepEqual(plain(d.ui.state.teams.map(t=>t.score)),[0,0,0]);
  assert.equal(d.ui.state.phase,'discuss');
});

test('round log includes the sole overall champion and knockout without inventing scored rounds',()=>{
  let state=game.finishGame(saved());
  for(let i=0;i<3;i++)state=game.selectFinalRepresentative(state,i,0);
  state=game.startFinalBracket(state,()=>0.99);
  state=game.recordFinalResult(state,null);
  while(game.finalBracket(state.finalTiebreak).current)state=game.recordFinalResult(state,game.finalBracket(state.finalTiebreak).current.teams[0]);
  const d=desk(state);
  assert.match(d.ui.history(),/OVERALL CHAMPION/);
  assert.match(d.ui.history(),/Overall title knockout/);
  assert.match(d.ui.history(),/1 draw/);
  assert.match(d.ui.history(),/1 scored rounds/);
  assert.match(d.ui.history(),/Scores unchanged/);
});

test('legacy tied finals can start a knockout without deleting history; a unique leader needs none',async()=>{
  const legacy={...saved(),phase:'complete'};delete legacy.finalTiebreak;
  const d=desk(legacy);
  assert.match(d.ui.controls(),/data-action="final-init"/);
  const before=plain(d.ui.state.history);
  await d.click('final-init');
  assert.deepEqual(plain(d.ui.state.finalTiebreak.qualifiers),[0,1,2]);
  assert.deepEqual(plain(d.ui.state.history),before);
  const unique=desk(saved([8,4,4]));await unique.click('next');
  assert.equal(unique.ui.state.finalTiebreak,null);
  assert.match(unique.ui.board(),/OVERALL CHAMPION/);
  assert.doesNotMatch(unique.ui.controls(),/data-action="final-/);
});

test('facilitator finishes tied scores with representative selection, confirmed match outcomes and one champion',async()=>{
  let d=desk(saved());const initial=plain(d.ui.state);
  await d.click('next');
  assert.ok(d.ui.state.finalTiebreak,'finish must initiate title selection');
  assert.match(d.ui.board(),/Overall title undecided/);
  assert.doesNotMatch(d.ui.board(),/SHARED LEAD/);
  assert.match(d.ui.controls(),/data-action="final-start"[^>]*disabled/);
  for(let i=0;i<3;i++) d.change(i,0);
  assert.doesNotMatch(d.ui.controls(),/data-action="final-start"[^>]*disabled/);
  let pending=d.click('final-start');d.confirm(true);await pending;
  const order=plain(d.ui.state.finalTiebreak.order);
  d=desk(plain(d.ui.state)); // localStorage reload does not redraw
  assert.deepEqual(plain(d.ui.state.finalTiebreak.order),order);
  let match=game.finalBracket(d.ui.state.finalTiebreak).current;
  assert.match(d.ui.board(),/Bye/);assert.match(d.ui.board(),/Match /);
  pending=d.click('final-result',{winner:String(match.teams[0])});
  assert.equal(d.ui.state.finalTiebreak.results.length,0);d.confirm(false);await pending;
  assert.equal(d.ui.state.finalTiebreak.results.length,0);
  pending=d.click('final-result',{winner:'draw'});d.confirm(true);await pending;
  assert.equal(game.finalBracket(d.ui.state.finalTiebreak).current.draws,1);
  while((match=game.finalBracket(d.ui.state.finalTiebreak).current)) {
    pending=d.click('final-result',{winner:String(match.teams[0])});d.confirm(true);await pending;
  }
  const winner=game.finalBracket(d.ui.state.finalTiebreak).winner;
  assert.match(d.ui.board(),/OVERALL CHAMPION/);
  assert.match(d.ui.board(),new RegExp(`Team ${winner+1}`));
  assert.match(d.ui.board(),/Scores unchanged/);
  assert.deepEqual(plain(d.ui.state.teams),initial.teams);assert.deepEqual(plain(d.ui.state.history),initial.history);
  pending=d.click('final-undo');d.confirm(true);await pending;
  assert.match(d.ui.board(),/Overall title undecided/);
  assert.equal(d.ui.fresh().finalTiebreak,null);
  pending=d.click('undo');d.confirm(true);await pending;
  assert.equal(d.ui.state.finalTiebreak,null);assert.equal(d.ui.state.phase,'record');
});
