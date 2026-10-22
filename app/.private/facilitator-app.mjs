import { outcome, applyRound, undoRound, finalLeaders, finishGame, selectFinalRepresentative, startFinalBracket, finalBracket, recordFinalResult, undoFinalResult } from '/game.mjs';

import { connectGame } from '/live-sync.mjs';
const KEY = 'leadership-lab-redblue-v1';
const isDisplay = false;
const sampleNames = Array.from({length:6},(_,i)=>`Team ${i+1}`);
const sampleMembers = sampleNames.map(()=>Array.from({length:5},(_,i)=>`Member ${i+1}`));
const fresh = () => ({ version: 1, session: 'Leadership Lab', totalRounds: 8, duration: 30, startingPoints: 50,
  teams: sampleNames.map((name,i) => ({id: i+1, name, members: sampleMembers[i], score: 50})),
  phase: 'discuss', choices: Array(6).fill(null), champion: null, champions: {red:'',blue:''}, draws:0,
  history: [], finalTiebreak: null, timer: {remaining:30, deadline:null}, sample: true });

let state;
try {
  const saved = JSON.parse(localStorage.getItem(KEY));
  if (!saved || saved.version !== 1 || !Array.isArray(saved.teams) || saved.teams.length < 2 || saved.teams.length > 12 || !Array.isArray(saved.history) || !Array.isArray(saved.choices) || saved.choices.length !== saved.teams.length || !['discuss','record','tie','preview','result','complete'].includes(saved.phase)) throw new Error();
  state = saved;
} catch { state = fresh(); }

let online;
try { online=await connectGame(state,{
  receive:next=>{state=next;setupDraft=null;try{localStorage.setItem(KEY,JSON.stringify(state));}catch{}render();},
  canRefresh:()=>!setupDraft,
  confirm:confirmAction
});state=online.state;localStorage.setItem(KEY,JSON.stringify(state)); }
catch {document.querySelector('#app').innerHTML='<main class="access-page"><section class="access-card"><h1>Unable to connect.</h1><p>Your browser’s saved game is safe. Check your connection, then reload to open the shared game.</p><button onclick="location.reload()">Retry connection</button></section></main>';throw Error('Shared game connection failed');}
const channel = 'BroadcastChannel' in window ? new BroadcastChannel(KEY+'-projector-v2') : null;
let setupDraft = null;
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const signed = n => n > 0 ? `+${n}` : String(n);
const teamNumber = i => String(i+1).padStart(2,'0');
const route = () => location.hash==='#teams'?'teams':'board';
const roundNumber = () => Math.min(state.history.length + (['result','complete'].includes(state.phase) ? 0 : 1), state.totalRounds);
const revealed = () => ['tie','preview','result','complete'].includes(state.phase);
const result = () => state.choices.every(Boolean) ? outcome(state.choices, state.champion) : null;
const remaining = () => state.timer.deadline ? Math.max(0, Math.ceil((state.timer.deadline-Date.now())/1000)) : state.timer.remaining;
const clockText = () => `${Math.floor(remaining()/60)}:${String(remaining()%60).padStart(2,'0')}`;
function toast(message) { const el=document.querySelector('#toast'); el.textContent=message; el.classList.add('visible'); clearTimeout(toast.timeout); toast.timeout=setTimeout(()=>el.classList.remove('visible'),3800); }
function persist(options={}) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { toast('Browser storage is unavailable. Keep this tab open; changes are only in memory.'); }
  const visible=['tie','preview','result','complete'].includes(state.phase);
  const snapshot={...state,choices:visible?[...state.choices]:state.choices.map(()=>null)};
  try {localStorage.setItem(KEY+'-projector-v2',JSON.stringify(snapshot));} catch {}
  channel?.postMessage(snapshot);
  online.save(state,options);
}
function commit(options) { persist(options); render(); }

function header() {
  return `<header class="topbar"><a class="brand" href="/?manage=1#board" aria-label="Red Blue manager board"><span class="brand-mark"><i></i><i></i></span>RED <span class="slash">/</span> BLUE</a><nav aria-label="Manage game navigation"><a href="/#board" class="all-games">← Public view</a>${[['board','Game board'],['teams','Teams & setup']].map(([key,label])=>`<a href="#${key}" class="${route()===key?'active':''}" ${route()===key?'aria-current="page"':''}>${label}</a>`).join('')}</nav><div class="top-actions"><button class="lock-button" data-action="lock-facilitator">Lock</button><a class="button projector-link" href="/?display=1#board" target="_blank" rel="noopener">Projector view <span aria-hidden="true">↗</span></a></div></header>`;
}

function home() {
  const inProgress=state.history.length>0||state.phase!=='discuss'||state.choices.some(Boolean);
  return `<main class="hub"><section class="hub-intro"><div class="hub-kicker"><span class="eyebrow">THE CLASSROOM COLLECTION</span><span class="collection-line"></span><span class="eyebrow">01 READY TO PLAY</span></div><h1>Big decisions.<br><em>Small beginnings.</em></h1><p>A room full of teams. A choice to make.<br>Pick an activity and let the discussion begin.</p><div class="hub-facts"><span>For teams, around a table</span><span>Led by you</span><span>Made for the projector</span></div></section>
  <section class="game-collection" aria-label="Choose a classroom game"><div class="collection-heading"><h2>Choose your activity</h2><span class="eyebrow">A GAME NOW. MORE TO COME.</span></div><div class="game-tiles">
  <a class="game-tile ready-game" href="#board" aria-label="${inProgress?'Continue':'Open'} Red / Blue"><div class="tile-top"><span class="eyebrow">GAME 01</span><span class="ready-badge">READY TO PLAY</span></div><div class="redblue-art" aria-hidden="true"><div class="art-orbit orbit-one"></div><div class="art-orbit orbit-two"></div><span class="art-card art-red">R<small>RED</small></span><span class="art-card art-blue">B<small>BLUE</small></span><span class="art-note">smaller side, bigger move.</span></div><div class="tile-description"><span class="eyebrow">NEGOTIATION · TRUST · ADAPTATION</span><h3>Red <span>/</span> Blue</h3><p>Follow the crowd, or find your own side? A round-based game where the smaller side wins.</p><div class="game-meta"><span>2–12 teams</span><span>Champions settle ties</span></div></div><div class="tile-action"><span>${inProgress?'Continue game':'Open game'}</span><span class="tile-arrow" aria-hidden="true">↗</span></div>${inProgress?`<div class="saved-session-note">Saved on this browser · ${state.phase==='complete'?'Game complete':`Round ${roundNumber()} of ${state.totalRounds}`}</div>`:''}</a>
  <article class="game-tile next-game" aria-label="Second activity, not selected yet"><div class="tile-top"><span class="eyebrow">GAME 02</span><span class="badge">TO BE DECIDED</span></div><div class="next-game-art" aria-hidden="true"><span class="next-corner corner-a"></span><span class="next-corner corner-b"></span><span class="next-symbol">?</span><span class="next-art-label">a little room for possibility.</span></div><div class="tile-description"><span class="eyebrow">THE NEXT CLASSROOM CHALLENGE</span><h3>What comes next?</h3><p>Another way to practise making decisions together. We’ll choose the second activity before adding it here.</p><div class="game-meta"><span>One more game to choose</span></div></div><div class="tile-action unavailable"><span>Coming after we decide</span><span aria-hidden="true">—</span></div></article>
  </div></section><section class="hub-how" aria-label="How to use the activities"><div class="hub-how-intro"><span class="eyebrow">LESS TO MANAGE.<br>MORE ROOM TO LEAD.</span><h2>You lead the room.<br>We keep the score.</h2><p>One laptop and a projector are enough.<br>Students play together, in person.</p></div><ol><li><span>01</span><div><h3>Pick a game</h3><p>Read the rules, then add your teams and members.</p></div></li><li><span>02</span><div><h3>Put it on the big screen</h3><p>Keep your controls on the laptop and open the classroom display on the projector.</p></div></li><li><span>03</span><div><h3>Make the decisions matter</h3><p>Let teams discuss. Reveal the results. Ask what changed their minds.</p></div></li></ol></section><div class="hub-bottom"><span class="eyebrow">DECISION-MAKING & PROBLEM SOLVING</span><span>Sessions are saved in this browser.</span></div></main>`;
}

function board() {
  const finished = state.phase==='complete';
  const details = {
    discuss: ['Discuss. Decide. Reveal.', 'Choose your colour privately. Keep it secret until the countdown.'],
    record: ['Every choice. One reveal.', 'Teams have revealed together. The facilitator is recording the choices.'],
    tie: ['An even split.', 'One champion per side. Rock, paper, scissors decides this round.'],
    preview: ['The result is in.', 'Check the transfer below before the facilitator applies the points.'],
    result: ['Points on the board.', 'Every point gained came from another team. What will you change next round?'],
    complete: ['Every choice tells a story.', finalLeaders(state).length>1&&finalBracket(state.finalTiebreak).winner===null?'Scoring is complete. The tied leaders play for one overall title; points stay unchanged.':'The game is complete. Compare your decisions, then talk about what changed.']
  };
  const [title, subtitle] = details[state.phase];

  return `<main class="workspace"><section class="arena">
    <div class="session-line"><span class="eyebrow">${escape(state.session)}</span><span class="round-tag">${finished?'FINAL SCORES':`ROUND ${roundNumber()} / ${state.totalRounds}`}</span></div>
    <div class="board-intro"><div><h1>${title}</h1><p>${subtitle}</p></div>${!finished?`<div class="timer-box"><span class="eyebrow">${state.phase==='discuss'?'DISCUSSION':'ROUND CLOCK'}</span><strong class="clock ${remaining()===0?'expired':''}">${clockText()}</strong><span class="timer-caption">${state.timer.deadline?(remaining()?'Time to decide':'Time is up'):state.phase==='discuss'?'Ready when you are':'Paused'}</span></div>`:''}</div>
    ${finished ? finalSummary()+finalTiebreakStage() : ''}
    ${finished?'':revealed()?splitBanner():`<div class="sealed-banner"><span class="seal-icon" aria-hidden="true">?</span><div><strong>Keep the choices under wraps.</strong><span>${state.phase==='record'?'The projector will reveal every colour together.':'Talk within your team. Reveal together on the facilitator’s count.'}</span></div><span class="entry-count">${state.phase==='record'?`${state.choices.filter(Boolean).length} / ${state.teams.length} recorded`:`${state.teams.length} teams`}</span></div>`}
    <div class="team-grid">${state.teams.map((t,i)=>teamCard(t,i)).join('')}</div>
    ${state.phase==='tie'?championStage():''}
    ${['preview','result'].includes(state.phase)?calculation():''}
    ${finished?debrief():`<div class="board-footnote"><span>SMALLER SIDE WINS</span><span>Equal sides? Champions decide. All one colour? No transfer.</span></div>`}
  </section>${!isDisplay?controls():`<aside class="display-rule"><span class="eyebrow">THE RULE</span><strong>Less can be more.</strong><p>The smaller colour group wins. Each losing team gives 1 point to every winning team.</p><div class="mini-example"><b>1 vs 5</b><span>Winner +5<br>Others −1 each</span></div><div class="mini-example"><b>2 vs 4</b><span>Winners +4 each<br>Others −2 each</span></div><p class="small">Tied sides send one champion each. The result applies to every team on that side.</p></aside>`}</main>`;
}

function finalSummary() {
  const leaders=finalLeaders(state), bracket=finalBracket(state.finalTiebreak);
  const winner=leaders.length===1?leaders[0]:bracket.winner;
  return `<div class="finish-banner"><span class="eyebrow">${winner===null?'FINAL SCORE TIE · TITLE PENDING':'OVERALL CHAMPION'}</span><strong>${winner===null?'Overall title undecided':escape(state.teams[winner].name)}</strong><span>${winner===null?`${leaders.length} teams tied on ${state.teams[leaders[0]].score} points`: `${state.teams[winner].score} points · ${leaders.length===1?'Highest final score':'Knockout winner · Scores unchanged'}`}</span></div>`;
}

function finalRepresentative(team) {
  const member=state.finalTiebreak?.representatives[team];
  return member===undefined?'Representative not selected':state.teams[team].members[member]||'Team representative';
}

function finalTiebreakStage() {
  const t=state.finalTiebreak;
  if(!t)return '';
  const bracket=finalBracket(t);
  return `<section class="calculation final-tiebreak" aria-label="Overall title knockout"><div class="section-heading"><h2>Overall title knockout</h2><span class="badge">${bracket.winner!==null?'COMPLETE':t.order?'PLAY IN PERSON':'SELECT REPRESENTATIVES'}</span></div><p>Only the teams tied for the highest score compete. Rock–paper–scissors decides the title, not points. Scores unchanged.</p>
  ${!t.order?`<ul>${t.qualifiers.map(i=>`<li><b>${escape(state.teams[i].name)}</b> · ${escape(finalRepresentative(i))}</li>`).join('')}</ul><p>Waiting for the facilitator to select every representative and draw the bracket once.</p>`:`${bracket.current?`<div class="equations"><div><span>UP NEXT · STAGE ${bracket.current.stage} · MATCH ${bracket.current.number}</span><strong>${bracket.current.teams.map(i=>`${escape(state.teams[i].name)} (${escape(finalRepresentative(i))})`).join(' vs ')}</strong><p>${bracket.current.draws} draw${bracket.current.draws===1?'':'s'} · Replay draws with the same representatives.</p></div></div>`:''}<div class="table-scroll"><table><thead><tr><th>Stage / match</th><th>Representatives</th><th>Result</th></tr></thead><tbody>${bracket.matches.map(m=>`<tr><th>Stage ${m.stage} · Match ${m.number}</th><td>${m.teams.map(i=>`${escape(state.teams[i].name)} · ${escape(finalRepresentative(i))}`).join('<br>vs<br>')}</td><td>${m.bye?`Bye · ${escape(state.teams[m.winner].name)} advances`:m.winner!==null?`${escape(state.teams[m.winner].name)} wins`:m===bracket.current?'Play now':'Waiting'}${m.draws?` · ${m.draws} draw${m.draws===1?'':'s'}`:''}</td></tr>`).join('')}</tbody></table></div><p class="small">Pairings and first-stage byes were randomized once. Winners advance in bracket order; future stages appear when the current stage is complete.</p>`}</section>`;
}

function finalTiebreakControls() {
  const t=state.finalTiebreak;
  if(!t)return finalLeaders(state).length>1?'<h2>Settle the overall title.</h2><p>This saved game has tied leaders. Keep its scores and history, and play a title knockout.</p><button class="primary wide" data-action="final-init">Start overall tiebreak</button><div class="control-divider"></div>':'';
  const bracket=finalBracket(t);
  let body='';
  if(!t.order)body=`<h2>Choose the title challengers.</h2><p>One representative from each tied first-place team. Select everyone before drawing random pairings and byes.</p>${t.qualifiers.map(i=>`<label class="champion-label">${escape(state.teams[i].name)}<select data-final-representative="${i}"><option value="" disabled ${t.representatives[i]===undefined?'selected':''}>Select a representative</option>${(state.teams[i].members.length?state.teams[i].members:['Team representative']).map((name,j)=>`<option value="${j}" ${t.representatives[i]===j?'selected':''}>${escape(name)}</option>`).join('')}</select></label>`).join('')}<button class="primary wide" data-action="final-start" ${t.qualifiers.some(i=>t.representatives[i]===undefined)?'disabled':''}>Draw knockout bracket</button>`;
  else if(bracket.current)body=`<h2>Stage ${bracket.current.stage} · Match ${bracket.current.number}</h2><p>Play rock–paper–scissors in person, then confirm the outcome. A draw replays this match.</p>${bracket.current.teams.map(i=>`<button class="primary wide" data-action="final-result" data-winner="${i}">${escape(state.teams[i].name)} wins</button>`).join('')}<button class="wide" data-action="final-result" data-winner="draw">Draw — play again</button>`;
  else body='<h2>One overall champion.</h2><p>The knockout title is settled. All scored-round points are unchanged.</p>';
  return body+`${t.results.length?'<button class="text-button" data-action="final-undo">Undo last knockout result</button>':''}<div class="control-divider"></div>`;
}

function splitBanner() {
  const r=result();
  const message = !r.red || !r.blue ? 'No opposing side. No points move.' : r.red===r.blue ? state.champion ? `${state.champion==='red'?'Red':'Blue'} champions win the tiebreak.` : 'A champion moment. Pick one representative per side.' : `${r.winner==='red'?'Red':'Blue'} is the smaller side and wins.`;
  return `<div class="split-banner"><div class="split-count red-text"><span>RED</span><strong>${r.red}</strong></div><span class="versus">vs</span><div class="split-count blue-text"><span>BLUE</span><strong>${r.blue}</strong></div><div class="split-summary"><strong>${message}</strong><span>${state.phase==='preview'?'Preview only · points not applied yet':state.phase==='tie'?'Play in person, then record the outcome.':'Choices are locked for this round.'}</span></div></div>`;
}

function teamCard(t,i) {
  const show = revealed();
  const choice=state.choices[i];
  const delta=['result','complete'].includes(state.phase) ? state.history.at(-1)?.deltas[i] : null;
  const phaseEditable = state.phase==='record' && !isDisplay;
  return `<article class="team-card ${show&&choice?`choice-${choice}`:''}"><div class="team-heading"><span class="team-index">${teamNumber(i)}</span><h2>${escape(t.name)}</h2>${show?`<span class="choice-badge ${choice}">${choice==='red'?'R · RED':'B · BLUE'}</span>`:''}</div>
  <div class="score-line"><strong>${t.score}</strong><span>points</span>${delta!==null&&delta!==undefined?`<span class="score-delta ${delta>0?'positive':delta<0?'negative':'neutral'}">${signed(delta)} this round</span>`:''}</div>
  <p class="members">${t.members.length?escape(t.members.join(' · ')):'Members can be added in setup'}</p>
  ${phaseEditable?`<div class="choice-controls" role="group" aria-label="${escape(t.name)} choice"><button class="choose red ${choice==='red'?'selected':''}" data-action="choose" data-index="${i}" data-colour="red" aria-pressed="${choice==='red'}">R <span>Red</span></button><button class="choose blue ${choice==='blue'?'selected':''}" data-action="choose" data-index="${i}" data-colour="blue" aria-pressed="${choice==='blue'}">B <span>Blue</span></button></div>`:!show?`<div class="waiting"><span class="status-dot"></span>${isDisplay?'Choice hidden':state.phase==='record'?'Recording choices':'Waiting for the reveal'}</div>`:''}</article>`;
}

function calculation() {
  const r=result();
  const winners=state.teams.filter((_,i)=>state.choices[i]===r.winner);
  const losers=state.teams.filter((_,i)=>state.choices[i]!==r.winner);
  return `<section class="calculation"><div class="section-heading"><h2>Follow the points</h2><span class="badge">${state.phase==='preview'?'PREVIEW':'APPLIED'}</span></div>
  ${!r.winner?'<p>Every team chose the same colour. There is nobody on the other side, so every score stays the same.</p>':`<div class="equations"><div><span>Each winning team receives</span><strong>${losers.length} losing team${losers.length===1?'':'s'} × 1 = <b class="positive">+${losers.length}</b></strong></div><span class="equation-divider">/</span><div><span>Each losing team gives</span><strong>${winners.length} winning team${winners.length===1?'':'s'} × 1 = <b class="negative">−${winners.length}</b></strong></div></div><p class="conservation">${winners.length} × ${losers.length} = ${winners.length*losers.length} points gained · ${losers.length} × ${winners.length} = ${winners.length*losers.length} points given. The class total stays at ${state.teams.reduce((s,t)=>s+t.score,0)}.</p>`}</section>`;
}

function championOptions(side) {
  return state.teams.flatMap((t,i)=>state.choices[i]===side ? (t.members.length?t.members:['Team representative']).map((m,j)=>{const value=`${t.id}:${j}`;return `<option value="${value}" ${state.champions[side]===value?'selected':''}>${escape(t.name)} · ${escape(m)}</option>`;}):[]).join('');
}

function championStage() {
  const name = side => {
    const value=state.champions[side];
    if(!value) return 'Choose your champion';
    const [id,member]=value.split(':');
    const team=state.teams.find(t=>String(t.id)===id);
    return team ? `${team.members[Number(member)]||'Team representative'} · ${team.name}` : 'Choose your champion';
  };
  return `<section class="calculation"><div class="section-heading"><h2>The champions</h2><span class="badge">PLAY IN PERSON</span></div><div class="equations"><div><span class="red-text">RED SIDE</span><strong>${escape(name('red'))}</strong></div><span class="equation-divider">vs</span><div><span class="blue-text">BLUE SIDE</span><strong>${escape(name('blue'))}</strong></div></div><p class="conservation">Rock, paper, scissors. Replay a draw. ${state.draws?`${state.draws} draw${state.draws===1?'':'s'} so far.`:'The winner decides the result for every team on their side.'}</p></section>`;
}

function controls() {
  const p=state.phase;
  const phases=['discuss','record',...(['tie'].includes(p)||result()?.tie?['tie']:[]),'preview','result'];
  const labels={discuss:'Team discussion',record:'Record the reveal',tie:'Champions play',preview:'Review the transfer',result:'Apply & continue'};
  let body='';
  if(p==='discuss') body=`<h2>Give them a moment.</h2><p>Teams choose privately. When everyone is ready, count down and reveal together.</p><div class="timer-actions"><button class="primary" data-action="timer">${state.timer.deadline?'Pause timer':remaining()===0?'Restart timer':'Start timer'}</button><button data-action="reset-timer">Reset</button></div><div class="control-divider"></div><button class="primary wide" data-action="begin-record">Teams have revealed <span>→</span></button><p class="hint">Record colours after the physical reveal. The projector keeps entries hidden until you confirm.</p>`;
  if(p==='record') body=`<h2>Enter every choice.</h2><p>Use the red and blue buttons on each team card. Check all entries before revealing the split.</p><div class="record-progress"><strong>${state.choices.filter(Boolean).length}</strong><span>of ${state.teams.length} choices recorded</span></div><button class="primary wide" data-action="lock" ${state.choices.some(c=>!c)?'disabled':''}>Reveal the split <span>→</span></button><button class="text-button" data-action="back-discuss">Back to discussion</button>`;
  if(p==='tie') body=`<h2>Send your champions.</h2><p>Each side chooses one person. Play rock–paper–scissors in the room; record who won.</p><label class="champion-label red-text">Red champion<select data-champion="red"><option value="">Select a representative</option>${championOptions('red')}</select></label><label class="champion-label blue-text">Blue champion<select data-champion="blue"><option value="">Select a representative</option>${championOptions('blue')}</select></label><div class="champion-result"><button class="red" data-action="champion-win" data-colour="red" ${!state.champions.red||!state.champions.blue?'disabled':''}>Red wins</button><button class="blue" data-action="champion-win" data-colour="blue" ${!state.champions.red||!state.champions.blue?'disabled':''}>Blue wins</button></div><button class="text-button" data-action="draw">Draw — play again${state.draws?` (${state.draws} draw${state.draws===1?'':'s'})`:''}</button><p class="hint">The result applies to every team on the winning side.</p><button class="text-button" data-action="edit-choices">Correct colour entries</button>`;
  if(p==='preview') body=`<h2>Ready to move the points?</h2><p>The calculation is visible to the class. Check the split and result, then confirm once.</p><button class="primary wide" data-action="apply">Apply points <span>→</span></button>${result()?.tie?'<button class="text-button" data-action="back-tie">Correct champion result</button>':''}<button class="text-button" data-action="edit-choices">Correct colour entries</button>`;
  if(p==='result') body=`<h2>Round ${state.history.length}, recorded.</h2><p>Give the class a moment to read the scores before moving on.</p><button class="primary wide" data-action="next">${state.history.length>=state.totalRounds?'Finish & debrief':'Next round'} <span>→</span></button><button class="text-button" data-action="undo">Undo this round</button>`;
  if(p==='complete') body=`${finalTiebreakControls()}<h2>Leave room for reflection.</h2><p>Use the questions on the board, then look back through the round log.</p><a class="button primary wide" href="/#history">View round log</a><button class="text-button" data-action="download">Download results CSV</button><button class="text-button" data-action="undo">Undo final round</button><a class="button wide" href="#teams">Set up another session</a>`;
  return `<aside class="controls"><div class="control-top"><span class="eyebrow">FACILITATOR DESK</span><span class="host-dot"></span></div><ol class="phase-list">${phases.map((phase,i)=>`<li class="${phase===p?'current':''}"><span>${i+1}</span>${labels[phase]}</li>`).join('')}</ol><div class="control-body">${body}</div><div class="round-tracker"><span class="eyebrow">${state.history.length} OF ${state.totalRounds} ROUNDS SCORED</span><div>${Array.from({length:state.totalRounds},(_,i)=>`<i class="${i<state.history.length?'done':''}" title="Round ${i+1}"></i>`).join('')}</div></div></aside>`;
}

function debrief() { return `<section class="debrief"><span class="eyebrow">BEYOND THE SCORE</span><h2>What changed your mind?</h2><div><p><b>01</b> Which promise did you trust, and why?</p><p><b>02</b> When did following the crowd work against you?</p><p><b>03</b> How did your team resolve a disagreement?</p><p><b>04</b> What would you do differently in an organisation?</p></div></section>`; }

function setup() {
  setupDraft ??= { teams:structuredClone(state.teams), totalRounds:state.totalRounds, duration:state.duration, startingPoints:state.startingPoints, session:state.session };
  const d=setupDraft;
  return `<main class="page-content"><div class="page-heading"><div><span class="eyebrow">BEFORE THE FIRST REVEAL</span><h1>A place for every team.</h1><p>One laptop runs the game. Students discuss and reveal at their tables.</p></div><span class="badge">${state.sample?'SAMPLE ROSTER · EDIT BEFORE CLASS':'LOCAL ROSTER'}</span></div><form id="setup-form"><section class="settings-panel"><label>Session name<input name="session" maxlength="60" required value="${escape(d.session)}"></label><label>Rounds<input name="totalRounds" type="number" min="1" max="20" required value="${d.totalRounds}"></label><label>Discussion (seconds)<input name="duration" type="number" min="10" max="300" required value="${d.duration}"></label><label>Starting points<input name="startingPoints" type="number" min="0" max="500" required value="${d.startingPoints}"></label></section><div class="section-heading"><h2>${d.teams.length} teams <span class="muted">/ ${d.teams.reduce((sum,t)=>sum+t.members.length,0)} members</span></h2><button type="button" data-action="add-team" ${d.teams.length>=12?'disabled':''}>+ Add team</button></div><div class="setup-grid">${d.teams.map((t,i)=>`<section class="roster-card"><div class="section-heading"><span class="eyebrow">TEAM ${teamNumber(i)}</span><button type="button" class="text-button" data-action="remove-team" data-index="${i}" ${d.teams.length<=2?'disabled':''}>Remove</button></div><label>Team name<input data-roster="name" data-index="${i}" required maxlength="28" value="${escape(t.name)}"></label><label>Members <span class="muted">· one per line, optional</span><textarea data-roster="members" data-index="${i}" rows="5" maxlength="600">${escape(t.members.join('\n'))}</textarea></label></section>`).join('')}</div><div class="setup-footer"><p>Saving setup starts a fresh game and clears the round log. Names stay in this browser.</p><button class="primary" type="submit">Save setup & start fresh <span>→</span></button></div></form></main>`;
}

function history() {
  return `<main class="page-content"><div class="page-heading"><div><span class="eyebrow">THE DECISIONS BEHIND THE SCORES</span><h1>A round at a time.</h1><p>${state.history.length} scored rounds. Class total: ${state.teams.reduce((sum,t)=>sum+t.score,0)} points.</p></div><button data-action="download" ${!state.history.length?'disabled':''}>Download CSV</button></div>${state.phase==='complete'?finalSummary()+finalTiebreakStage():''}${!state.history.length?'<div class="empty-state"><span class="eyebrow">A CLEAN SLATE</span><h2>Your first decision is still ahead.</h2><p>Scored rounds will appear here with every choice and points transfer.</p><a class="button primary" href="#board">Go to the game board</a></div>':`<div class="table-scroll"><table><thead><tr><th>Round</th><th>Result</th>${state.teams.map(t=>`<th>${escape(t.name)}</th>`).join('')}</tr></thead><tbody>${state.history.map(r=>{const o=outcome(r.choices,r.champion);return `<tr><th>${String(r.round).padStart(2,'0')}</th><td>${o.winner?`${o.winner==='red'?'Red':'Blue'} wins${o.tie?' · champions':''}`:'No transfer'}</td>${r.choices.map((c,i)=>`<td><span class="choice-badge ${c}">${c==='red'?'R':'B'}</span><b class="${r.deltas[i]>0?'positive':r.deltas[i]<0?'negative':''}">${signed(r.deltas[i])}</b><span class="small">${r.after[i]} total</span></td>`).join('')}</tr>`;}).join('')}</tbody></table></div><p class="small">${state.phase==='result'||state.phase==='complete'?'You can undo the latest round from the game board.':'To correct an older round, undo the latest scored rounds in order. This also replaces any unscored choices.'}</p>${state.history.length?'<button data-action="undo">Undo latest scored round</button>':''}`}</main>`;
}

function guide() {
  return `<main class="page-content guide"><span class="eyebrow">FACILITATOR-LED · PROJECTOR-FRIENDLY</span><h1>One room. Six decisions.</h1><p class="lead">Teams play in person. The app keeps the choices hidden until the reveal, counts the points, and makes the result easy to explain.</p><div class="guide-steps"><section><span>01</span><h2>Set the room up</h2><p>Enter 2–12 teams, add members if useful, and choose your session length. Sample names are provided only to demonstrate the layout.</p></section><section><span>02</span><h2>Decide, then reveal</h2><p>Start the timer. Teams agree privately: closed fist for red, open palm for blue. On your countdown, every team reveals together and holds its signal.</p></section><section><span>03</span><h2>Record and check</h2><p>Record each choice on your laptop. The separate projector view hides entries until you click Reveal the split. A timer ending never reveals or chooses automatically.</p></section><section><span>04</span><h2>Explain the transfer</h2><p>The smaller side wins. Every losing team gives 1 point to every winning team. Show the calculation, then apply the points once.</p></section></div><section class="guide-rule"><div><span class="eyebrow">THE SMALLER SIDE WINS</span><h2>A crowd is not a guarantee.</h2><p>For six teams, a lone red takes 1 point from each of five blue teams: red +5, each blue −1. Reverse the colours and the same rule applies.</p><p>If two choose red and four blue, each red gets +4 and each blue loses 2. If everyone chooses one colour, no points move.</p><p><b>Equal sides:</b> select one champion per colour, play rock–paper–scissors in person, and replay draws. For 3 vs 3, every winning team gets +3 and every losing team gets −3.</p><p>No bonus multipliers. Scores can go below zero; nobody is eliminated during the scored rounds. A unique highest final score wins.</p><p><b>One overall champion:</b> if the highest final scores are tied, each tied team selects one representative. Draw a randomized knockout bracket once, with fair first-stage byes when needed. Representatives play rock–paper–scissors in person; replay draws, then have the facilitator confirm each match winner. Winners advance until one team wins the title. Scores stay unchanged.</p><p>Undo the latest knockout result to correct a draw or winner; repeat undo to reach an earlier match. Pairings stay fixed. Undoing the final scored round clears the knockout, and saving a fresh setup clears the whole session.</p></div><img src="./assets/three-v-three.png" alt="Three red and three blue teams select champions. Blue's scissors beats red's paper. Each blue gains three and each red loses three." loading="lazy"></section><section class="guide-bottom"><div><h2>Use the projector as the public board.</h2><p>Open Projector view in a second tab in the same browser, move it onto the projector, and select Full screen. Keep the facilitator desk on your laptop. Both tabs update together.</p><p>If you mirror one screen, students can see colours as you enter them. Only begin entry after every team has physically revealed. A second display gives a cleaner simultaneous on-screen reveal.</p></div><div><h2>Keep student involvement light.</h2><p>No phones, accounts, room codes, or online joining are needed in this mockup. Members help with discussions and can act as champions. Agree on when cross-team negotiation is allowed before starting.</p><p>The game saves locally in this browser. It does not connect devices, upload names, or sync across different browsers. Download a CSV to keep your results.</p></div></section></main>`;
}

function render() {
  document.body.classList.toggle('projector',isDisplay);
  document.body.classList.toggle('home-page',route()==='home');
  document.title=route()==='home'?'Leadership Lab — Classroom games':isDisplay?'Red / Blue — Classroom display':'Red / Blue — Leadership Lab';
  document.querySelector('#app').innerHTML=header()+({home,board,teams:setup,history,guide}[route()]())+`<footer class="site-footer"><span>LEADERSHIP LAB <span class="muted">·</span> Games for better discussions</span><span>${isDisplay?'Live classroom board':'Facilitator-led · Shared online'}</span></footer>`;
  updateClock();
}
function updateClock() {
  document.querySelectorAll('.clock').forEach(el=>{el.textContent=clockText();el.classList.toggle('expired',remaining()===0);});
  const caption=document.querySelector('.timer-caption');
  if(caption) caption.textContent=state.timer.deadline ? remaining()?'Time to decide':'Time is up' : state.phase==='discuss'?'Ready when you are':'Paused';
}
setInterval(updateClock,250);
window.addEventListener('hashchange',render);

async function confirmAction(title,copy) {
  const d=document.querySelector('#confirm-dialog');
  document.querySelector('#confirm-title').textContent=title;
  document.querySelector('#confirm-copy').textContent=copy;
  d.returnValue='cancel';d.showModal();
  return new Promise(resolve=>d.addEventListener('close',()=>resolve(d.returnValue==='confirm'),{once:true}));
}

document.addEventListener('click',async e=>{
  const button=e.target.closest('[data-action]');if(!button||button.disabled)return;
  const action=button.dataset.action;
  if(isDisplay&&action!=='fullscreen')return;
  try {
    if(action==='fullscreen') { if(document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen();return; }
    if(action==='timer'&&state.phase==='discuss') { const secs=remaining();state.timer=state.timer.deadline?{remaining:secs,deadline:null}:{remaining:secs||state.duration,deadline:Date.now()+(secs||state.duration)*1000}; }
    else if(action==='reset-timer') state.timer={remaining:state.duration,deadline:null};
    else if(action==='begin-record'&&state.phase==='discuss') {state.timer={remaining:remaining(),deadline:null};state.phase='record';}
    else if(action==='back-discuss') state.phase='discuss';
    else if(action==='choose'&&state.phase==='record') state.choices[Number(button.dataset.index)]=button.dataset.colour;
    else if(action==='lock'&&state.phase==='record') {const r=result();if(!r) return;state.phase=r.tie?'tie':'preview';}
    else if(action==='champion-win'&&state.phase==='tie'&&state.champions.red&&state.champions.blue) {state.champion=button.dataset.colour;state.phase='preview';}
    else if(action==='draw'&&state.phase==='tie') {state.draws++;toast('Draw recorded. The same champions play again.');}
    else if(action==='edit-choices') {state.phase='record';state.champion=null;state.champions={red:'',blue:''};state.draws=0;}
    else if(action==='back-tie') {state.phase='tie';state.champion=null;}
    else if(action==='apply') state=applyRound(state);
    else if(action==='next'&&state.phase==='result') {
      if(state.history.length>=state.totalRounds) state=finishGame(state);
      else Object.assign(state,{phase:'discuss',choices:state.teams.map(()=>null),champion:null,champions:{red:'',blue:''},draws:0,timer:{remaining:state.duration,deadline:null}});
    }
    else if(action==='final-init'&&state.phase==='complete') state=finishGame(state);
    else if(action==='final-start') {
      if(!await confirmAction('Draw the knockout bracket?','Representatives will be locked. Random pairings and first-stage byes are saved once and will not change on refresh. Scores stay unchanged.'))return;
      state=startFinalBracket(state);
    }
    else if(action==='final-result') {
      const winner=button.dataset.winner==='draw'?null:Number(button.dataset.winner);
      if(!await confirmAction(winner===null?'Record a draw?':`Record ${state.teams[winner]?.name} as the match winner?`,winner===null?'The same representatives play again. No points change.':'The winner advances in the title knockout. No points change. You can undo the last knockout result.'))return;
      state=recordFinalResult(state,winner);
    }
    else if(action==='final-undo') {
      if(!await confirmAction('Undo the last knockout result?','Remove the most recently recorded draw or winner. The saved bracket and all scored-round points stay unchanged.'))return;
      state=undoFinalResult(state);
    }
    else if(action==='undo') {
      if(!await confirmAction('Undo the latest scored round?','Its points will be restored, and its choices will reopen for correction. Any unscored choices and the entire overall-title knockout will be cleared.'))return;
      state=undoRound(state);location.hash='board';
    }
    else if(action==='add-team') { if(setupDraft.teams.length>=12)return;setupDraft.teams.push({id:Date.now(),name:`Team ${setupDraft.teams.length+1}`,members:[],score:setupDraft.startingPoints});render();return; }
    else if(action==='remove-team') {if(setupDraft.teams.length<=2)return;setupDraft.teams.splice(Number(button.dataset.index),1);render();return;}
    else if(action==='download') {download();return;}
    else return;
    commit();
  } catch(err) {toast(err.message||'That action could not be completed.');}
});

document.addEventListener('change',e=>{
  if(e.target.dataset.finalRepresentative!==undefined&&!isDisplay&&e.target.value!=='') {
    try {state=selectFinalRepresentative(state,Number(e.target.dataset.finalRepresentative),Number(e.target.value));commit();} catch(err) {toast(err.message);}
  }
  if(e.target.dataset.champion&&!isDisplay) {state.champions[e.target.dataset.champion]=e.target.value;commit();}
});
document.addEventListener('input',e=>{
  if(!e.target.closest('#setup-form'))return;
  const el=e.target;
  if(el.dataset.roster) setupDraft.teams[Number(el.dataset.index)][el.dataset.roster]=el.dataset.roster==='members'?el.value.split('\n').map(s=>s.trim()).filter(Boolean):el.value;
  else setupDraft[el.name]=el.name==='session'?el.value:Number(el.value);
});
document.addEventListener('submit',async e=>{
  if(e.target.id!=='setup-form')return;e.preventDefault();
  if(setupDraft.teams.some(t=>!t.name.trim())) {toast('Give every team a name.');return;}
  if(new Set(setupDraft.teams.map(t=>t.name.trim().toLowerCase())).size!==setupDraft.teams.length) {toast('Use a different name for each team.');return;}
  if(state.history.length||state.phase!=='discuss'||state.choices.some(Boolean)) if(!await confirmAction('Start a fresh session?','This clears the current scores and round log. Download the results first if you want to keep them.'))return;
  const d=setupDraft;
  state={...fresh(),...d,teams:d.teams.map(t=>({...t,name:t.name.trim(),score:d.startingPoints})),choices:d.teams.map(()=>null),timer:{remaining:d.duration,deadline:null},sample:false};
  setupDraft=null;location.hash='board';commit({replace:true});
  try {await window.flushSharedGame?.();toast('Session ready. Teams can begin their first discussion.');}
  catch {toast('Session not saved online yet. Use the sync controls to retry.');}
});

function download() {
  const cell = v => {const text=String(v??'');return '"'+(/^[=+@\-\t\r]/.test(text)?"'":'')+text.replaceAll('"','""')+'"';};
  const rows=[['Round','Team','Choice','Point change','Total after round','Champion winning side','Draws','Record type','Stage','Match','Opponent','Title result']];
  for(const r of state.history) state.teams.forEach((t,i)=>rows.push([r.round,t.name,r.choices[i],r.deltas[i],r.after[i],r.champion||'',r.draws,'Scored round','','','','']));
  if(state.phase==='complete') {
    const leaders=finalLeaders(state),bracket=finalBracket(state.finalTiebreak);
    for(const m of bracket.matches) rows.push(['',state.teams[m.teams[0]].name,'',0,'','',m.draws,'Title knockout',m.stage,m.number,m.teams.length>1?state.teams[m.teams[1]].name:'',m.bye?'Bye':m.winner===null?'Pending':`${state.teams[m.winner].name} wins`]);
    const winner=leaders.length===1?leaders[0]:bracket.winner;
    rows.push(['',winner===null?'':state.teams[winner].name,'',0,winner===null?'':state.teams[winner].score,'','','Overall title','','','',winner===null?'Pending':leaders.length===1?'Champion - highest score':'Champion - knockout']);
  }
  const blob=new Blob(['\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='red-blue-rounds.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

render();


window.addEventListener('facilitator:locking',()=>{if(state.timer.deadline)state.timer={remaining:remaining(),deadline:null};persist();});
