import {createGameSync} from './sync-engine.mjs';
const endpoint='/api/game';
const recoveryKey='leadership-lab-redblue-unsynced-v1';

export async function connectGame(local,{receive=()=>{},canRefresh=()=>true,confirm=async()=>false}={}) {
  let timer,recovery=null,allowLeave=false;
  try{recovery=JSON.parse(localStorage.getItem(recoveryKey));}catch{}
  const status=document.createElement('div');status.id='sync-status';status.className='sync-status';status.setAttribute('role','status');document.body.append(status);
  const message=document.createElement('span');status.append(message);
  const actions=document.createElement('div');actions.className='sync-actions';status.append(actions);
  const button=(label,action)=>{const el=document.createElement('button');el.textContent=label;el.addEventListener('click',async()=>{el.disabled=true;try{await action();}catch{message.textContent='Unable to save online. Your changes are kept here; please retry.';}finally{el.disabled=false;}});actions.append(el);};
  const show=(text,error=false)=>{message.textContent=text;status.classList.toggle('sync-error',error);actions.replaceChildren();};
  const read=async()=>{const response=await fetch(endpoint+'?manage=1',{cache:'no-store'});if(!response.ok)throw Error('Unable to open shared game');return response.json();};
  show('Connecting to shared game…');
  const initial=await read();
  function backup(value){
    recovery=value;
    try{if(value)localStorage.setItem(recoveryKey,JSON.stringify(value));else localStorage.removeItem(recoveryKey);}catch{}
  }
  const sync=createGameSync({read,revision:initial.revision,
    write:async data=>{const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),keepalive:true});return {ok:response.ok,status:response.status,data:await response.json()};},
    backup,remote:next=>{if(next)receive(next);},
    status:kind=>{
      if(kind==='saved')show('Shared game saved · public view is live');
      else if(kind==='saving')show('Saving shared game…');
      else if(kind==='offline'){show('Not saved online · your changes are kept in this browser.',true);button('Retry save',()=>sync.flush());}
    },
    conflict:code=>{
      if(code===401){show('Your sign-in expired. Your unsaved changes are kept here.',true);button('Sign in again',()=>{allowLeave=true;location.reload();});return;}
      show('Another Manage tab saved changes. Choose which version to continue with.',true);
      button('Load shared game',async()=>{if(await confirm('Load the shared game?','This replaces this tab’s unsaved changes with the game currently shown to public viewers.'))await sync.resolve('remote');});
      button('Save my changes instead',async()=>{if(await confirm('Save your version instead?','This replaces the shared roster, scores and round log with this tab’s version. Other viewers will see your changes.'))await sync.resolve('mine');});
    }
  });
  const desk={state:initial.state||local,save(state,options){sync.save(state,options);clearTimeout(timer);timer=setTimeout(()=>sync.flush().catch(()=>{}),250);},flush:()=>{clearTimeout(timer);return sync.flush();}};
  window.flushSharedGame=desk.flush;
  window.addEventListener('beforeunload',event=>{if(!allowLeave&&sync.hasPending()){event.preventDefault();event.returnValue='';}});
  window.addEventListener('online',()=>sync.flush().catch(()=>{}));
  const refresh=()=>{if(canRefresh())sync.refresh().catch(()=>{});};
  if(!initial.state){desk.save(local);await desk.flush();}
  else if(recovery?.state){
    const savedRecovery=recovery.state;
    show('Unsent changes from this browser are available. The shared game is currently open.',true);
    button('Restore my unsent changes',async()=>{if(await confirm('Restore your unsent changes?','This replaces the shared roster, scores and round log with your saved browser copy.'))await sync.resolve('mine',savedRecovery);});
    button('Keep shared game',()=>{backup(null);show('Shared game connected · public view is live');});
  }else show('Shared game connected · public view is live');
  window.addEventListener('focus',refresh);
  setInterval(()=>{if(sync.hasPending()&&!sync.isBlocked())sync.flush().catch(()=>{});else refresh();},4000);
  return desk;
}

export function followGame(receive,connection) {
  let busy=false,last='',stopped=false;
  async function poll(){
    if(busy||stopped)return;busy=true;
    try{
      const response=await fetch(endpoint,{cache:'no-store'});if(!response.ok)throw Error();
      const data=await response.json();const next=JSON.stringify(data.state);
      if(next!==last){last=next;receive(data.state);}
      connection('Live · updates automatically');
    }catch{connection('Connection interrupted · retrying…',true);}finally{busy=false;}
  }
  poll();const interval=setInterval(poll,2500);
  window.addEventListener('online',poll);window.addEventListener('focus',poll);
  return ()=>{stopped=true;clearInterval(interval);};
}
