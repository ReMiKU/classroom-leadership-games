import test from 'node:test';
import assert from 'node:assert/strict';
import { outcome, applyRound, undoRound } from './game.mjs';
import * as game from './game.mjs';

const finalState = (scores=[5,5,1]) => ({version:1,session:'Test',totalRounds:1,duration:30,startingPoints:0,
  teams:scores.map((score,i)=>({id:i+1,name:`Team ${i+1}`,members:i===0?['Alex','Jo']:[],score})),
  phase:'result',choices:scores.map(()=>'red'),champion:null,champions:{red:'',blue:''},draws:0,
  history:[{round:1,choices:scores.map(()=>'red'),champion:null,champions:{red:'',blue:''},draws:0,deltas:scores.map(()=>0),before:[...scores],after:[...scores]}],
  timer:{remaining:30,deadline:null},sample:false});

test('finish offers only tied first-place teams a title tiebreak without changing scores or history', () => {
  assert.equal(typeof game.finishGame,'function');
  const s=finalState();const finished=game.finishGame(s);
  assert.equal(finished.phase,'complete');
  assert.deepEqual(finished.finalTiebreak,{qualifiers:[0,1],representatives:{},order:null,results:[]});
  assert.deepEqual(finished.teams,s.teams);assert.deepEqual(finished.history,s.history);
  assert.equal(s.phase,'result');
  assert.equal(game.finishGame(finalState([7,5,5])).finalTiebreak,null);
  assert.deepEqual(game.finishGame({...s,phase:'complete'}),finished); // legacy save
  assert.deepEqual(game.finishGame(finished),finished);
  assert.throws(()=>game.finishGame({...s,history:[]}));
  assert.throws(()=>game.finishGame({...s,phase:'preview'}));
});

test('all qualifiers must select a valid representative before a bracket is randomized exactly once', () => {
  assert.equal(typeof game.selectFinalRepresentative,'function');
  let s=game.finishGame(finalState());
  assert.throws(()=>game.startFinalBracket(s));
  assert.throws(()=>game.selectFinalRepresentative(s,2,0));
  assert.throws(()=>game.selectFinalRepresentative(s,0,2));
  assert.throws(()=>game.selectFinalRepresentative(s,1,1));
  s=game.selectFinalRepresentative(s,0,1);
  assert.throws(()=>game.startFinalBracket(s));
  s=game.selectFinalRepresentative(s,1,0); // roster-free team representative
  let calls=0;const started=game.startFinalBracket(s,()=>{calls++;return 0;});
  assert.deepEqual(started.finalTiebreak.order,[1,0]);assert.equal(calls,1);
  assert.equal(s.finalTiebreak.order,null);
  const restored=JSON.parse(JSON.stringify(started));
  assert.deepEqual(game.startFinalBracket(restored,()=>{throw Error('must not rerandomize');}),started);
  assert.throws(()=>game.selectFinalRepresentative(started,0,0));
  assert.deepEqual(game.finishGame(restored),restored);
});

test('knockout resolves every 2–12 team field with fair first-round byes and replayed draws', () => {
  assert.equal(typeof game.finalBracket,'function');
  for(let count=2;count<=12;count++) for(let tied=2;tied<=count;tied++) {
    const original=finalState(Array.from({length:count},(_,i)=>i<tied?-2:-9));
    let s=game.finishGame(original);
    for(let i=0;i<tied;i++) s=game.selectFinalRepresentative(s,i,0);
    s=game.startFinalBracket(s,()=>0.5);
    const order=[...s.finalTiebreak.order];let wins=0;
    while(game.finalBracket(s.finalTiebreak).winner===null) {
      const match=game.finalBracket(s.finalTiebreak).current;
      assert.ok(match);assert.equal(match.teams.length,2);assert.notEqual(match.teams[0],match.teams[1]);
      assert.throws(()=>game.recordFinalResult(s,99));
      const before=JSON.stringify(s);
      const drawn=game.recordFinalResult(game.recordFinalResult(s,null),null);
      assert.equal(JSON.stringify(s),before);
      assert.deepEqual(game.finalBracket(drawn.finalTiebreak).current.teams,match.teams);
      assert.equal(game.finalBracket(drawn.finalTiebreak).current.draws,2);
      s=game.recordFinalResult(drawn,match.teams[wins%2]);wins++;
      assert.ok(wins<tied);
      s=JSON.parse(JSON.stringify(s));
      assert.deepEqual(s.finalTiebreak.order,order);
    }
    const bracket=game.finalBracket(s.finalTiebreak);
    assert.equal(wins,tied-1);
    assert.ok(bracket.winner<tied);assert.equal(bracket.current,null);
    assert.equal(bracket.matches.filter(m=>m.bye).length,2**Math.ceil(Math.log2(tied))-tied);
    assert.deepEqual(s.teams,original.teams);assert.deepEqual(s.history,original.history);
    assert.throws(()=>game.recordFinalResult(s,bracket.winner));
  }
});

test('undo removes exactly the last knockout outcome, reopens the final and keeps the original bracket', () => {
  assert.equal(typeof game.undoFinalResult,'function');
  let s=game.finishGame(finalState([4,4,4]));
  for(let i=0;i<3;i++)s=game.selectFinalRepresentative(s,i,0);
  s=game.startFinalBracket(s,()=>0.99);
  assert.throws(()=>game.undoFinalResult(s));
  const initial=s;
  s=game.recordFinalResult(s,null);
  assert.deepEqual(game.undoFinalResult(s),initial);
  s=game.recordFinalResult(s,0);
  const beforeFinal=s;
  s=game.recordFinalResult(s,2);
  assert.equal(game.finalBracket(s.finalTiebreak).winner,2);
  assert.deepEqual(game.undoFinalResult(s),beforeFinal);
  const changed=game.recordFinalResult(game.undoFinalResult(s),0);
  assert.equal(game.finalBracket(changed.finalTiebreak).winner,0);
  assert.deepEqual(changed.finalTiebreak.order,initial.finalTiebreak.order);
  const undone=undoRound(changed);
  assert.equal(undone.finalTiebreak,null);assert.equal(undone.phase,'record');
  assert.deepEqual(undone.teams.map(t=>t.score),[4,4,4]);
});

test('minority wins for both colours; 3–3 needs a champion; unanimous choices transfer nothing', () => {
  assert.deepEqual(outcome(['red', 'blue', 'blue', 'blue', 'blue', 'blue']).deltas, [5,-1,-1,-1,-1,-1]);
  assert.deepEqual(outcome(['red','red','red','red','blue','blue']).deltas, [-2,-2,-2,-2,4,4]);
  assert.equal(outcome(['red','red','red','blue','blue','blue']).deltas, null);
  assert.deepEqual(outcome(['red','red','red','blue','blue','blue'], 'blue').deltas, [-3,-3,-3,3,3,3]);
  assert.deepEqual(outcome(Array(6).fill('red')).deltas, [0,0,0,0,0,0]);
  assert.throws(() => outcome(['red', null]));
});

test('every split for 2–12 teams conserves points and treats colours symmetrically', () => {
  for (let count = 2; count <= 12; count++) {
    for (let reds = 0; reds <= count; reds++) {
      const choices = Array.from({length: count}, (_,i) => i < reds ? 'red' : 'blue');
      const inverse = choices.map(c => c === 'red' ? 'blue' : 'red');
      for (const champion of ['red','blue']) {
        const a = outcome(choices, champion);
        const b = outcome(inverse, champion === 'red' ? 'blue' : 'red');
        assert.equal(a.deltas.reduce((s,n) => s+n,0), 0);
        assert.deepEqual(a.deltas, b.deltas);
        if (reds && reds !== count && reds !== count/2) assert.equal(a.winner, reds < count/2 ? 'red' : 'blue');
      }
    }
  }
});

test('round can only be scored once, and undo restores every score and choice', () => {
  const state = { phase: 'preview', duration: 30, teams: Array.from({length:6}, (_,i) => ({id:i, score:50})), choices: ['red','blue','blue','blue','blue','blue'], champion: null, champions: {red:'',blue:''}, draws:0, history: [] };
  const scored = applyRound(state);
  assert.deepEqual(scored.teams.map(t=>t.score), [55,49,49,49,49,49]);
  assert.throws(() => applyRound(scored));
  const restored = undoRound(scored);
  assert.deepEqual(restored.teams.map(t=>t.score), Array(6).fill(50));
  assert.deepEqual(restored.choices, state.choices);
  assert.equal(restored.history.length, 0);
  assert.equal(restored.phase, 'record');
});
