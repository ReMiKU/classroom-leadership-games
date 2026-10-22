// Failed requests keep their identity until their acknowledgement is recovered.
export function createGameSync({read,write,revision=null,id=()=>crypto.randomUUID(),status=()=>{},conflict=()=>{},remote=()=>{},backup=()=>{}}) {
  let queued=null,active=null,running=null,blocked=null,generation=0,refreshing=false;
  function save(state,{replace=false}={}) {
    generation++;
    if(replace&&blocked){active=null;blocked=null;}
    queued={state:structuredClone(state),mutationId:id(),replace};backup(queued);
    if(blocked)conflict(blocked);else status('saving');
  }
  async function flush() {
    if(running){await running;if(blocked||active||queued)throw Error('Changes have not been saved online.');return;}
    if(blocked)throw Error('Resolve the shared-game conflict before continuing.');
    if(!active&&!queued)return;
    running=(async()=>{
      while(active||queued){
        if(!active){active=queued;queued=null;}
        try{
          // A confirmed new session intentionally replaces the latest old game.
          if(active.replace&&!active.rebased){revision=(await read()).revision;active.rebased=true;}
          const result=await write({state:active.state,mutationId:active.mutationId,revision});
          if(result.status===409&&queued?.replace){active=null;continue;}
          if(result.status===409||result.status===401){blocked=result.status;status('conflict');conflict(blocked);return;}
          if(!result.ok)throw Error('Save failed');
          revision=result.data.revision;active=null;
          if(!queued)backup(null);
          status(queued?'saving':'saved');
        }catch{status('offline');return;}
      }
    })();
    try{await running;}finally{running=null;}
    if(blocked||active||queued)throw Error('Changes have not been saved online. Use the sync controls to retry.');
  }
  async function refresh(){
    if(refreshing||running||active||queued||blocked)return;
    refreshing=true;const started=generation;
    try{
      const latest=await read();
      if(started!==generation||running||active||queued||blocked)return;
      if(latest.revision!==revision){revision=latest.revision;remote(latest.state);status('saved');}
    }finally{refreshing=false;}
  }
  async function resolve(choice,state){
    if(running)await running;
    generation++;
    const latest=await read();const mine=state||queued?.state||active?.state;
    revision=latest.revision;queued=null;active=null;blocked=null;
    if(choice==='remote'){backup(null);remote(latest.state);status('saved');return;}
    if(!mine)throw Error('No local changes to save.');
    save(mine,{replace:true});await flush();remote(mine);
  }
  return {save,flush,refresh,resolve,hasPending:()=>!!(active||queued),isBlocked:()=>!!blocked};
}
