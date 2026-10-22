// These functions are emitted as browser code by prepare-access-layout.mjs.
// Their state and route helpers are supplied by the generated browser modules.
export function publicHeader() {
  if(route()==='home') return `<header class="topbar hub-topbar"><a class="brand hub-brand" href="/#home" aria-label="Leadership Lab home"><svg class="lab-logo" viewBox="0 0 48 48" aria-hidden="true"><g transform="rotate(-10 24 24)"><rect x="9" y="10" width="32" height="32" rx="9" fill="#C7901A"/><rect x="5" y="5" width="32" height="32" rx="9" fill="#FFC83D"/><circle cx="13" cy="29" r="2.6" fill="#1A1440"/><circle cx="21" cy="21" r="3.4" fill="#1A1440"/><circle cx="29" cy="13" r="4.2" fill="#1A1440"/></g><path d="M42 1l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" fill="#45E3A6"/></svg>LEADERSHIP <span class="lab-word">LAB</span></a></header>`;
  return `<header class="topbar"><a class="brand" href="/#board" aria-label="Red Blue public board"><span class="brand-mark"><i></i><i></i></span><span class="red-text">RED</span> <span class="slash">/</span> <span class="blue-text">BLUE</span></a><nav aria-label="Public game navigation"><a class="all-games" href="/#home">← All games</a>${[['board','Projector view'],['history','Round log'],['guide','How to play']].map(([key,label])=>`<a href="#${key}" class="${route()===key?'active':''}" ${route()===key?'aria-current="page"':''}>${label}</a>`).join('')}</nav><div class="top-actions"><a class="button manage-link" href="/?manage=1#board">Manage</a><button data-action="fullscreen">Full screen</button></div></header>`;
}

export function privateHeader() {
  return `<header class="topbar"><a class="brand" href="/?manage=1#board" aria-label="Red Blue manager board"><span class="brand-mark"><i></i><i></i></span><span class="red-text">RED</span> <span class="slash">/</span> <span class="blue-text">BLUE</span></a><nav aria-label="Manage game navigation"><a href="/#board" class="all-games">← Public view</a>${[['board','Game board'],['teams','Teams & setup']].map(([key,label])=>`<a href="#${key}" class="${route()===key?'active':''}" ${route()===key?'aria-current="page"':''}>${label}</a>`).join('')}</nav><div class="top-actions"><button class="lock-button" data-action="lock-facilitator">Lock</button><a class="button projector-link" href="/?display=1#board" target="_blank" rel="noopener">Projector view <span aria-hidden="true">↗</span></a></div></header>`;
}

export function publicHistory() {
  const rounds=state?.history||[];
  const teams=state?.teams||[];
  return `<main class="page-content"><div class="page-heading"><div><span class="eyebrow">THE DECISIONS BEHIND THE SCORES</span><h1>A round at a time.</h1><p>${rounds.length} scored rounds${state?`. Class total: ${teams.reduce((sum,t)=>sum+t.score,0)} points.`:'. Results appear here after the facilitator scores a round.'}</p></div><span class="badge">PUBLIC · READ-ONLY</span></div>${state?.phase==='complete'?finalSummary()+finalTiebreakStage():''}${rounds.length?`<div class="table-scroll"><table><thead><tr><th>Round</th><th>Result</th>${teams.map(t=>`<th>${escape(t.name)}</th>`).join('')}</tr></thead><tbody>${rounds.map(r=>{const o=outcome(r.choices,r.champion);return `<tr><th>${String(r.round).padStart(2,'0')}</th><td>${o.winner?`${o.winner==='red'?'Red':'Blue'} wins${o.tie?' · champions':''}`:'No transfer'}</td>${r.choices.map((c,i)=>`<td><span class="choice-badge ${c}">${c==='red'?'R':'B'}</span><b class="${r.deltas[i]>0?'positive':r.deltas[i]<0?'negative':''}">${signed(r.deltas[i])}</b><span class="small">${r.after[i]} total</span></td>`).join('')}</tr>`;}).join('')}</tbody></table></div>`:'<div class="empty-state"><span class="eyebrow">A CLEAN SLATE</span><h2>No scored rounds yet.</h2><p>The facilitator’s recorded rounds will appear here.</p><a class="button primary" href="#board">Back to projector view</a></div>'}</main>`;
}

export function publicRender() {
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

// Rotates the home page's featured games. The slide index lives here, so a live
// re-render of the home page keeps the slide that viewers are looking at.
export function publicSpotlight() {
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
