const app=document.querySelector('#app');
const isManage=new URLSearchParams(location.search).has('manage');
let busy=false;
let expiresAt=0;

function loginScreen(message='') {
  document.body.className='access-locked';
  document.title='Facilitator sign-in — Leadership Lab';
  app.innerHTML=`<header class="topbar"><a class="brand" href="/#home" aria-label="Leadership Lab home"><span class="lab-mark" aria-hidden="true">L</span>LEADERSHIP / LAB</a><a class="button" href="/#board">← Back to public view</a></header><main class="access-page"><section class="access-card"><span class="eyebrow">MANAGE RED / BLUE</span><h1>The room is yours to lead.</h1><p>Enter the facilitator passcode to manage the game board and team setup.</p><form id="access-form"><label for="passcode">Facilitator passcode</label><input id="passcode" name="passcode" type="password" autocomplete="current-password" maxlength="128" required placeholder="Enter your passcode"><p id="access-error" class="access-error" role="alert"></p><button class="primary wide" type="submit">Unlock Manage <span aria-hidden="true">→</span></button></form><div class="access-note">The projector view, round log and how-to-play guide are public. Managing the game requires the passcode.</div></section></main>`;
  document.querySelector('#access-error').textContent=message;
}

async function lockDesk() {
  window.dispatchEvent(new Event('facilitator:locking'));
  if(window.flushSharedGame)await window.flushSharedGame();
  const response=await fetch('/api/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'}),credentials:'same-origin'});
  if(!response.ok) throw new Error('Unable to lock the desk. Please retry.');
  try{localStorage.setItem('leadership-access-lock',String(Date.now()));}catch{}
  location.replace('/#board');
}

async function loadDesk(session) {
  expiresAt=session.expiresAt;
  document.body.className='';
  app.innerHTML='<main class="access-page"><p>Opening the facilitator desk…</p></main>';
  const script=document.createElement('script');script.type='module';script.src='/api/access?asset=facilitator';
  script.onerror=()=>loginScreen('Unable to load the facilitator desk. Please reload and try again.');document.head.append(script);
  setTimeout(()=>{window.dispatchEvent(new Event('facilitator:locking'));location.reload();},Math.max(0,expiresAt-Date.now()));
}

if(!isManage) {
  await import('./projector.mjs');
} else {
  try {
    const response=await fetch('/api/access',{credentials:'same-origin',cache:'no-store'});
    if(response.ok) await loadDesk(await response.json());
    else loginScreen(response.status===503?'Facilitator access is temporarily unavailable. Please retry shortly.':'');
  } catch {loginScreen('Unable to check access. Please check your connection and reload.');}

  document.addEventListener('submit',async event=>{
    if(event.target.id!=='access-form')return;
    event.preventDefault();if(busy)return;busy=true;
    const button=event.target.querySelector('button');button.disabled=true;
    const input=document.querySelector('#passcode');
    try {
      const response=await fetch('/api/access',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({action:'login',passcode:input.value})});
      input.value='';
      const data=await response.json();
      if(response.ok) location.reload();
      else document.querySelector('#access-error').textContent=data.error||'Unable to unlock the desk.';
    } catch {document.querySelector('#access-error').textContent='Unable to connect. Please try again.';}
    finally{busy=false;button.disabled=false;}
  });
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-action="lock-facilitator"]');
    if(!button)return;button.disabled=true;
    try{await lockDesk();}catch(error){button.disabled=false;document.querySelector('#toast').textContent=error.message;document.querySelector('#toast').classList.add('visible');}
  });
  window.addEventListener('focus',()=>{if(expiresAt&&Date.now()>=expiresAt){window.dispatchEvent(new Event('facilitator:locking'));location.reload();}});
  window.addEventListener('storage',event=>{if(event.key==='leadership-access-lock'&&expiresAt){window.dispatchEvent(new Event('facilitator:locking'));location.replace('/#board');}});
}
