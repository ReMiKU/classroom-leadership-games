import { outcome, finalLeaders, finalBracket } from './game.mjs';
import { followGame } from './live-sync.mjs';
const KEY='leadership-lab-redblue-v1-projector-v2';
const isDisplay=true;
let state=null;
const expandedTeams=new Set();
const route=()=>['board','history','guide','home'].includes(location.hash.slice(1))?location.hash.slice(1):(new URLSearchParams(location.search).has('display')?'board':'home');
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const signed=n=>n>0?'+'+n:String(n);
const teamNumber=i=>String(i+1).padStart(2,'0');
const roundNumber=()=>Math.min(state.history.length+(['result','complete'].includes(state.phase)?0:1),state.totalRounds);
const revealed=()=>['tie','preview','result','complete'].includes(state.phase);
const result=()=>state.choices.every(Boolean)?outcome(state.choices,state.champion):null;
const remaining=()=>state.timer.deadline?Math.max(0,Math.ceil((state.timer.deadline-Date.now())/1000)):state.timer.remaining;
const clockText=()=>Math.floor(remaining()/60)+':'+String(remaining()%60).padStart(2,'0');
function header() {
  if(route()==='home') return `<header class="topbar hub-topbar"><a class="brand hub-brand" href="/#home" aria-label="Leadership Lab home"><svg class="lab-logo" viewBox="0 0 48 48" aria-hidden="true"><g transform="rotate(-10 24 24)"><rect x="9" y="10" width="32" height="32" rx="9" fill="#C7901A"/><rect x="5" y="5" width="32" height="32" rx="9" fill="#FFC83D"/><circle cx="13" cy="29" r="2.6" fill="#1A1440"/><circle cx="21" cy="21" r="3.4" fill="#1A1440"/><circle cx="29" cy="13" r="4.2" fill="#1A1440"/></g><path d="M42 1l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" fill="#45E3A6"/></svg>LEADERSHIP <span class="lab-word">LAB</span></a><a class="button" href="#guide">Red / Blue guide <span aria-hidden="true">↗</span></a></header>`;
  return `<header class="topbar"><a class="brand" href="/#board" aria-label="Red Blue public board"><span class="brand-mark"><i></i><i></i></span><span class="red-text">RED</span> <span class="slash">/</span> <span class="blue-text">BLUE</span></a><nav aria-label="Public game navigation"><a class="all-games" href="/#home">← All games</a>${[['board','Projector view'],['history','Round log'],['guide','How to play']].map(([key,label])=>`<a href="#${key}" class="${route()===key?'active':''}" ${route()===key?'aria-current="page"':''}>${label}</a>`).join('')}</nav><div class="top-actions"><a class="button manage-link" href="/?manage=1#board">Manage</a><button data-action="fullscreen">Full screen</button></div></header>`;
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
  // Crown a unique leader only; tied leaders stay unmarked so nobody looks like a shared winner.
  const top=Math.max(...state.teams.map(team=>team.score));
  const leader=t.score===top&&state.teams.filter(team=>team.score===top).length===1;
  const open=expandedTeams.has(i);
  return `<article class="team-card ${show&&choice?`choice-${choice}`:''}${open?' open':''}"><div class="team-summary"><div class="team-heading"><span class="team-index">${teamNumber(i)}</span><h2>${escape(t.name)}</h2>${leader?'<svg class="leader-crown" viewBox="0 0 24 20" role="img" aria-label="Current leader"><path d="M2 6l5 5 5-9 5 9 5-5-2 13H4z"/></svg>':''}${show?`<span class="choice-badge ${choice}">${choice==='red'?'R · RED':'B · BLUE'}</span>`:''}</div>
  <div class="score-line"><strong>${t.score}</strong><span>points</span>${delta!==null&&delta!==undefined?`<span class="score-delta ${delta>0?'positive':delta<0?'negative':'neutral'}">${signed(delta)} this round</span>`:''}</div><button class="team-toggle" data-team-toggle="${i}" aria-expanded="${open}" aria-label="${escape(t.name)} details"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button></div>
  <p class="members">${t.members.length?escape(t.members.join(' · ')):'Members can be added in setup'}</p>
  ${phaseEditable?`<div class="choice-controls" role="group" aria-label="${escape(t.name)} choice"><button class="choose red ${choice==='red'?'selected':''}" data-action="choose" data-index="${i}" data-colour="red" aria-pressed="${choice==='red'}">R <span>Red</span></button><button class="choose blue ${choice==='blue'?'selected':''}" data-action="choose" data-index="${i}" data-colour="blue" aria-pressed="${choice==='blue'}">B <span>Blue</span></button></div>`:!show?`<div class="waiting"><span class="status-dot"></span>${isDisplay?'Choice hidden':state.phase==='record'?'Recording choices':'Waiting for the reveal'}</div>`:''}</article>`;
}

function toggleTeam(button) {
  const i=Number(button.dataset.teamToggle);
  const open=!expandedTeams.has(i);
  if(open) expandedTeams.add(i); else expandedTeams.delete(i);
  button.setAttribute('aria-expanded',String(open));
  button.closest('.team-card').classList.toggle('open',open);
}

function calculation() {
  const r=result();
  const winners=state.teams.filter((_,i)=>state.choices[i]===r.winner);
  const losers=state.teams.filter((_,i)=>state.choices[i]!==r.winner);
  return `<section class="calculation"><div class="section-heading"><h2>Follow the points</h2><span class="badge">${state.phase==='preview'?'PREVIEW':'APPLIED'}</span></div>
  ${!r.winner?'<p>Every team chose the same colour. There is nobody on the other side, so every score stays the same.</p>':`<div class="equations"><div><span>Each winning team receives</span><strong>${losers.length} losing team${losers.length===1?'':'s'} × 1 = <b class="positive">+${losers.length}</b></strong></div><span class="equation-divider">/</span><div><span>Each losing team gives</span><strong>${winners.length} winning team${winners.length===1?'':'s'} × 1 = <b class="negative">−${winners.length}</b></strong></div></div><p class="conservation">${winners.length} × ${losers.length} = ${winners.length*losers.length} points gained · ${losers.length} × ${winners.length} = ${winners.length*losers.length} points given. The class total stays at ${state.teams.reduce((s,t)=>s+t.score,0)}.</p>`}</section>`;
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

function debrief() { return `<section class="debrief"><span class="eyebrow">BEYOND THE SCORE</span><h2>What changed your mind?</h2><div><p><b>01</b> Which promise did you trust, and why?</p><p><b>02</b> When did following the crowd work against you?</p><p><b>03</b> How did your team resolve a disagreement?</p><p><b>04</b> What would you do differently in an organisation?</p></div></section>`; }
function home() {
  const inProgress=false;
  const star=name=>`<svg class="sparkle ${name}" viewBox="0 0 24 24"><polygon points="12,2 15,9 22,9 16.5,13.5 18.5,21 12,16.5 5.5,21 7.5,13.5 2,9 9,9"/></svg>`;
  // Featured games rotate in the spotlight. Add a slide here when a new game is ready.
  const slides=[
    {label:'Red / Blue',theme:'redblue',html:`<div class="slide-copy"><div class="slide-meta"><span class="slide-badge">${inProgress?'IN PROGRESS':'NOW PLAYING'}</span><span class="eyebrow">GAME 01</span></div><h2 class="slide-title"><span class="red-text">Red</span> <span class="slash">/</span> <span class="blue-text">Blue</span></h2><p>The smaller side wins. Follow the crowd, or break away and grab the points?</p><div class="slide-tags"><span>Negotiation</span><span>Trust</span><span>Adaptation</span><span>2–12 teams</span></div><div class="slide-actions"><a class="button primary play-button" href="#board"><svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="6,3 21,12 6,21"/></svg>${inProgress?'Continue game':'Play'}</a><a class="slide-link" href="#guide">Read the rules</a></div>${inProgress?`<p class="saved-session-note">Saved on this browser · ${state.phase==='complete'?'Game complete':`Round ${roundNumber()} of ${state.totalRounds}`}</p>`:''}</div><div class="slide-art" aria-hidden="true"><span class="art-ring ring-outer"></span><span class="art-ring ring-inner"></span><span class="art-card art-red">R</span><span class="art-card art-blue">B</span>${star('sparkle-gold')}${star('sparkle-mint')}</div>`},
    {label:'Game 02, coming soon',theme:'mystery',html:`<div class="slide-copy"><div class="slide-meta"><span class="slide-badge soon">COMING SOON</span><span class="eyebrow">GAME 02</span></div><h2 class="slide-title">Mystery game</h2><p>A new challenge is on its way. We’ll choose the second game before it unlocks here.</p><div class="slide-actions"><button class="play-button" disabled>Unlocks soon</button></div></div><div class="slide-art" aria-hidden="true"><span class="art-ring ring-outer"></span><span class="mystery-die">?</span><span class="mystery-lock"><svg viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></span></div>`}
  ];
  const spotlightNav=slides.length<2?'':`<div class="spotlight-controls"><div class="spotlight-dots">${slides.map((s,i)=>`<button class="spotlight-dot${i?'':' is-active'}" data-spotlight="${i}" aria-label="Show ${s.label}"${i?'':' aria-current="true"'}><span></span></button>`).join('')}<span class="spotlight-count" aria-hidden="true">1 / ${slides.length}</span></div><div class="spotlight-buttons"><button class="round-button" data-spotlight="pause" aria-label="Pause slideshow"><svg class="icon-pause" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg><svg class="icon-play" viewBox="0 0 24 24" aria-hidden="true"><polygon points="7,4 20,12 7,20"/></svg></button><button class="round-button" data-spotlight="prev" aria-label="Previous game"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button><button class="round-button" data-spotlight="next" aria-label="Next game"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button></div></div>`;
  return `<main class="hub"><section class="hub-intro"><div><span class="hub-chip">${star('chip-star')}DECISION-MAKING · PROBLEM SOLVING · LEADERSHIP</span><h1>Ready. Set. <span>LEAD!</span></h1></div><div><p>Classroom games that get teams talking, deciding and leading together. Pick a game, put it on the big screen, and run the room.</p><div class="hub-facts"><span>For teams around a table</span><span>Led by you</span><span>Made for the projector</span></div></div></section>
  <section class="spotlight" aria-roledescription="carousel" aria-label="Featured games"><div class="spotlight-stage">${slides.map((s,i)=>`<article class="spotlight-slide slide-${s.theme}${i?'':' is-active'}" aria-roledescription="slide" aria-label="${i+1} of ${slides.length}: ${s.label}">${s.html}</article>`).join('')}</div>${spotlightNav}</section>
  <section class="library" aria-labelledby="library-title"><div class="section-heading"><h2 id="library-title">Game library</h2><span class="eyebrow">1 READY · 1 UNLOCKING SOON</span></div><div class="library-grid">
  <a class="library-card" href="#board" aria-label="${inProgress?'Continue':'Open'} Red / Blue"><div class="library-art" aria-hidden="true"><span class="art-card art-red">R</span><span class="art-card art-blue">B</span></div><div class="library-body"><div class="slide-meta"><span class="slide-badge">READY</span><span class="eyebrow">2–12 TEAMS</span></div><h3>Red / Blue</h3><p>The smaller side wins the round.</p><span class="library-action">${inProgress?'Continue game':'Open game'} <span aria-hidden="true">→</span></span></div></a>
  <article class="library-card locked" aria-label="Second game, not selected yet"><div class="library-art" aria-hidden="true"><span class="mystery-die">?</span></div><div class="library-body"><div class="slide-meta"><span class="slide-badge soon">LOCKED</span></div><h3>Mystery game</h3><p>Game 02 unlocks once we’ve chosen it.</p></div></article>
  </div></section><section class="levels" aria-labelledby="levels-title"><h2 id="levels-title">How a game night works</h2><p>You lead the room. The board keeps score. One laptop and a projector are enough.</p><ol><li><span>1</span><b>LEVEL 1</b><h3>Pick a game</h3><p>Read the rules, then add your teams and players.</p></li><li><span>2</span><b>LEVEL 2</b><h3>Light up the big screen</h3><p>Controls stay on your laptop. The board goes on the projector.</p></li><li><span>3</span><b>LEVEL 3</b><h3>Play & debrief</h3><p>Teams decide and reveal together. Then talk about what changed their minds.</p></li></ol></section></main>`;
}
function guide() {
  return `<main class="page-content guide"><span class="eyebrow">FACILITATOR-LED · PROJECTOR-FRIENDLY</span><h1>One room. Six decisions.</h1><p class="lead">Teams play in person. The app keeps the choices hidden until the reveal, counts the points, and makes the result easy to explain.</p><div class="guide-steps"><section><span>01</span><h2>Set the room up</h2><p>The facilitator opens Manage, enters the passcode, then adds teams and chooses the session length. Sample names are provided only to demonstrate the layout.</p></section><section><span>02</span><h2>Decide, then reveal</h2><p>Start the timer. Teams agree privately: closed fist for red, open palm for blue. On your countdown, every team reveals together and holds its signal.</p></section><section><span>03</span><h2>Record and check</h2><p>Record each choice on your laptop. The separate projector view hides entries until you click Reveal the split. A timer ending never reveals or chooses automatically.</p></section><section><span>04</span><h2>Explain the transfer</h2><p>The smaller side wins. Every losing team gives 1 point to every winning team. Show the calculation, then apply the points once.</p></section></div><section class="guide-rule"><div><span class="eyebrow">THE SMALLER SIDE WINS</span><h2>A crowd is not a guarantee.</h2><p>For six teams, a lone red takes 1 point from each of five blue teams: red +5, each blue −1. Reverse the colours and the same rule applies.</p><p>If two choose red and four blue, each red gets +4 and each blue loses 2. If everyone chooses one colour, no points move.</p><p><b>Equal sides:</b> select one champion per colour, play rock–paper–scissors in person, and replay draws. For 3 vs 3, every winning team gets +3 and every losing team gets −3.</p><p>No bonus multipliers. Scores can go below zero; nobody is eliminated during the scored rounds. A unique highest final score wins.</p><p><b>One overall champion:</b> if the highest final scores are tied, each tied team selects one representative. Draw a randomized knockout bracket once, with fair first-stage byes when needed. Representatives play rock–paper–scissors in person; replay draws, then have the facilitator confirm each match winner. Winners advance until one team wins the title. Scores stay unchanged.</p><p>Undo the latest knockout result to correct a draw or winner; repeat undo to reach an earlier match. Pairings stay fixed. Undoing the final scored round clears the knockout, and saving a fresh setup clears the whole session.</p></div><img src="./assets/three-v-three.png" alt="Three red and three blue teams select champions. Blue's scissors beats red's paper. Each blue gains three and each red loses three." loading="lazy"></section><section class="guide-bottom"><div><h2>Use the projector as the public board.</h2><p>Open Projector view in a second tab in the same browser, move it onto the projector, and select Full screen. Keep the facilitator desk on your laptop. Both tabs update together.</p><p>If you mirror one screen, students can see colours as you enter them. Only begin entry after every team has physically revealed. A second display gives a cleaner simultaneous on-screen reveal.</p></div><div><h2>Keep student involvement light.</h2><p>No phones, accounts, room codes, or online joining are needed in this mockup. Members help with discussions and can act as champions. Agree on when cross-team negotiation is allowed before starting.</p><p>The game saves locally in this browser. It does not connect devices, upload names, or sync across different browsers. Download a CSV to keep your results.</p></div></section></main>`;
}
function history() {
  const rounds=state?.history||[];
  const teams=state?.teams||[];
  return `<main class="page-content"><div class="page-heading"><div><span class="eyebrow">THE DECISIONS BEHIND THE SCORES</span><h1>A round at a time.</h1><p>${rounds.length} scored rounds${state?`. Class total: ${teams.reduce((sum,t)=>sum+t.score,0)} points.`:'. Results appear here after the facilitator scores a round.'}</p></div><span class="badge">PUBLIC · READ-ONLY</span></div>${state?.phase==='complete'?finalSummary()+finalTiebreakStage():''}${rounds.length?`<div class="table-scroll"><table><thead><tr><th>Round</th><th>Result</th>${teams.map(t=>`<th>${escape(t.name)}</th>`).join('')}</tr></thead><tbody>${rounds.map(r=>{const o=outcome(r.choices,r.champion);return `<tr><th>${String(r.round).padStart(2,'0')}</th><td>${o.winner?`${o.winner==='red'?'Red':'Blue'} wins${o.tie?' · champions':''}`:'No transfer'}</td>${r.choices.map((c,i)=>`<td><span class="choice-badge ${c}">${c==='red'?'R':'B'}</span><b class="${r.deltas[i]>0?'positive':r.deltas[i]<0?'negative':''}">${signed(r.deltas[i])}</b><span class="small">${r.after[i]} total</span></td>`).join('')}</tr>`;}).join('')}</tbody></table></div>`:'<div class="empty-state"><span class="eyebrow">A CLEAN SLATE</span><h2>No scored rounds yet.</h2><p>The facilitator’s recorded rounds will appear here.</p><a class="button primary" href="#board">Back to projector view</a></div>'}</main>`;
}
function render() {
  const page=route();
  document.body.classList.toggle('projector',page==='board');
  document.body.classList.toggle('home-page',page==='home');
  document.title=page==='home'?'Leadership Lab — Classroom games':page==='history'?'Round log — Red / Blue':page==='guide'?'How to play — Red / Blue':'Red / Blue — Public projector';
  let content;
  if(page==='home')content=home();
  else if(page==='history')content=history();
  else if(page==='guide')content=guide();
  else content=state?board():`<main class="access-page"><section class="access-card"><span class="eyebrow">PUBLIC PROJECTOR VIEW</span><h1>Waiting for the facilitator.</h1><p>The game board will appear here when the facilitator opens Manage and starts a shared session.</p><p>Read the rules or round log above. To run the activity, open Manage and enter the facilitator passcode.</p><a class="button primary" href="/?manage=1#board">Manage this game <span aria-hidden="true">→</span></a><p class="small access-note">This view updates automatically across browsers and devices.</p></section></main>`;
  document.querySelector('#app').innerHTML=header()+content+'<footer class="site-footer"><span>LEADERSHIP LAB · Games for better discussions</span><span>Public view · Read-only</span></footer>';
  if(page==='home')showSpotlight();
}
function receive(next){state=next;render();}
function startSpotlight() {
  let index=0,paused=!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  function show(next=index) {
    const root=document.querySelector('.spotlight');
    const slides=root?root.querySelectorAll('.spotlight-slide'):[];
    if(!slides.length)return;
    index=(next+slides.length)%slides.length;
    slides.forEach((slide,i)=>slide.classList.toggle('is-active',i===index));
    root.querySelectorAll('.spotlight-dot').forEach((dot,i)=>{dot.classList.toggle('is-active',i===index);if(i===index)dot.setAttribute('aria-current','true');else dot.removeAttribute('aria-current');});
    const count=root.querySelector('.spotlight-count');if(count)count.textContent=`${index+1} / ${slides.length}`;
    root.classList.toggle('is-paused',paused);
    root.querySelector('[data-spotlight="pause"]')?.setAttribute('aria-label',paused?'Play slideshow':'Pause slideshow');
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-spotlight]');if(!button)return;
    const action=button.dataset.spotlight;
    if(action==='pause'){paused=!paused;show();return;}
    paused=true; // Choosing a slide stops the rotation so it stays put while people read.
    show(action==='next'?index+1:action==='prev'?index-1:Number(action));
  });
  setInterval(()=>{if(!paused&&!document.hidden&&!document.querySelector('.spotlight:hover,.spotlight:focus-within'))show(index+1);},7000);
  return show;
}
const showSpotlight=startSpotlight();
const connection=document.createElement('div');connection.className='sync-status';connection.setAttribute('role','status');document.body.append(connection);
connection.textContent='Connecting to the shared game…';
followGame(receive,(message,error=false)=>{connection.textContent=message;connection.classList.toggle('sync-error',error);});
window.addEventListener('hashchange',()=>{render();window.scrollTo(0,0);});
document.addEventListener('click',event=>{const toggle=event.target.closest('[data-team-toggle]');if(toggle)toggleTeam(toggle);});
document.addEventListener('click',async event=>{if(event.target.closest('[data-action="fullscreen"]')){if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}});
setInterval(()=>{if(!state)return;document.querySelectorAll('.clock').forEach(el=>el.textContent=clockText());},250);
render();
