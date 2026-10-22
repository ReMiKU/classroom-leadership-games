import {finalLeaders,finalBracket} from '../game.mjs';
const phases=['discuss','record','tie','preview','result','complete'];
const colour=c=>c===null||c==='red'||c==='blue';
const text=(s,max)=>typeof s==='string'&&s.length<=max;
const number=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;

function finalTiebreak(s) {
  const t=s.finalTiebreak;
  if(t==null)return null; // Version-one legacy saves remain valid.
  const leaders=finalLeaders(s);
  const invalid=()=>{throw Error('Invalid final tiebreak.');};
  if(s.phase!=='complete'||s.history.length<s.totalRounds||leaders.length<2||!Array.isArray(t.qualifiers)||JSON.stringify(t.qualifiers)!==JSON.stringify(leaders))invalid();
  if(!t.representatives||typeof t.representatives!=='object'||Array.isArray(t.representatives))invalid();
  for(const [key,member] of Object.entries(t.representatives)) {
    const i=Number(key);
    if(String(i)!==key||!leaders.includes(i)||!Number.isInteger(member)||member<0||member>=Math.max(1,s.teams[i].members.length))invalid();
  }
  if(!Array.isArray(t.results)||t.results.length>10000||!t.results.every(r=>r&& (r.winner===null||Number.isInteger(r.winner)&&leaders.includes(r.winner))))invalid();
  if(t.order===null) {if(t.results.length)invalid();}
  else {
    if(!Array.isArray(t.order)||t.order.length!==leaders.length||new Set(t.order).size!==leaders.length||!t.order.every(i=>leaders.includes(i))||leaders.some(i=>!Object.hasOwn(t.representatives,i)))invalid();
    finalBracket(t); // Replay verifies opponents, advancement and no post-final results.
  }
  return {qualifiers:[...t.qualifiers],representatives:Object.fromEntries(t.qualifiers.filter(i=>Object.hasOwn(t.representatives,i)).map(i=>[i,t.representatives[i]])),order:t.order?[...t.order]:null,results:t.results.map(r=>({winner:r.winner}))};
}

export function validateGame(s) {
  if(!s||s.version!==1||!text(s.session,200)||!phases.includes(s.phase)||!Array.isArray(s.teams)||s.teams.length<2||s.teams.length>12)throw Error('Invalid game.');
  const n=s.teams.length;
  if(!s.teams.every(t=>text(t.name,200)&&Array.isArray(t.members)&&t.members.length<=100&&t.members.every(m=>text(m,200))&&number(t.score,-1000000,1000000)))throw Error('Invalid teams.');
  if(!Array.isArray(s.choices)||s.choices.length!==n||!s.choices.every(colour)||!colour(s.champion)||!s.champions||!text(s.champions.red,300)||!text(s.champions.blue,300))throw Error('Invalid choices.');
  if(!number(s.totalRounds,1,100)||!number(s.duration,1,3600)||!number(s.startingPoints,0,100000)||!number(s.draws,0,10000)||!s.timer||!number(s.timer.remaining,0,3600)||(s.timer.deadline!==null&&!number(s.timer.deadline,0,1e14)))throw Error('Invalid settings.');
  if(!Array.isArray(s.history)||s.history.length>100||!s.history.every(r=>number(r.round,1,100)&&colour(r.champion)&&number(r.draws,0,10000)&&['choices','deltas','before','after'].every(k=>Array.isArray(r[k])&&r[k].length===n)&&r.choices.every(c=>c==='red'||c==='blue')&&['deltas','before','after'].every(k=>r[k].every(v=>number(v,-1000000,1000000)))))throw Error('Invalid round log.');
  const knockout=finalTiebreak(s);
  // Copy known game fields only. Never let incidental browser data become public.
  return {version:1,finalTiebreak:knockout,session:s.session,totalRounds:s.totalRounds,duration:s.duration,startingPoints:s.startingPoints,teams:s.teams.map((t,i)=>({id:t.id??i+1,name:t.name,members:[...t.members],score:t.score})),phase:s.phase,choices:[...s.choices],champion:s.champion,champions:{red:s.champions.red,blue:s.champions.blue},draws:s.draws,history:s.history.map(r=>({round:r.round,choices:r.choices,champion:r.champion,champions:{red:r.champions?.red||'',blue:r.champions?.blue||''},draws:r.draws,deltas:r.deltas,before:r.before,after:r.after})),timer:{remaining:s.timer.remaining,deadline:s.timer.deadline},sample:!!s.sample};
}

export function publicGame(s) {
  if(!s)return null;
  const visible=['tie','preview','result','complete'].includes(s.phase);
  return {...s,choices:visible?s.choices:s.choices.map(()=>null),champion:visible?s.champion:null,champions:visible?s.champions:{red:'',blue:''},draws:visible?s.draws:0};
}

export function createGameHandler({store,authenticate,now=Date.now}) {
  return async request=>{
    const url=new URL(request.url);
    const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store, max-age=0','Vercel-CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    try {
      if(request.method==='GET') {
        const manage=url.searchParams.has('manage');
        if(manage&&!await authenticate(request))return json({error:'Please unlock Manage again.'},401);
        const saved=await store.read();
        return json({state:manage?saved?.state??null:publicGame(saved?.state),revision:manage?saved?.revision??null:undefined,updatedAt:saved?.updatedAt??null});
      }
      if(request.method!=='POST')return json({error:'Method not allowed.'},405);
      if(!await authenticate(request))return json({error:'Please unlock Manage again.'},401);
      if(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Request origin not allowed.'},403);
      if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Use JSON.'},415);
      if(Number(request.headers.get('content-length'))>131072)return json({error:'Game is too large.'},413);
      const raw=await request.text();if(Buffer.byteLength(raw)>131072)return json({error:'Game is too large.'},413);
      let data,state;
      try{data=JSON.parse(raw);state=validateGame(data.state);if(!text(data.mutationId,100)||!data.mutationId||!(data.revision===null||text(data.revision,200)))throw Error();}catch{return json({error:'Invalid game data.'},400);}
      const current=await store.read();
      if(current?.mutationId===data.mutationId)return json({revision:current.revision,updatedAt:current.updatedAt});
      if((current?.revision??null)!==data.revision)return json({error:'This game changed in another Manage tab. Reload to continue.'},409);
      try {
        const saved=await store.write({state,mutationId:data.mutationId,updatedAt:now()},data.revision);
        return json({revision:saved.revision,updatedAt:saved.updatedAt});
      } catch(error) {if(error.code==='CONFLICT')return json({error:'This game changed in another Manage tab. Reload to continue.'},409);throw error;}
    }catch {console.error('Shared game request failed.');return json({error:'Unable to reach the shared game. Please retry.'},503);}
  };
}
