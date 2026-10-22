import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
if(!process.env.LEADERSHIP_APP_URL)throw new Error('Set LEADERSHIP_APP_URL to the deployment origin to check.');
const origin=new URL(process.env.LEADERSHIP_APP_URL).origin;
const secrets=JSON.parse(await readFile('.facilitator-secrets.json','utf8'));
const request=(url,options={})=>fetch(origin+url,{redirect:'error',...options});
const anonymous=await request('/api/game');assert.equal(anonymous.status,200);assert.match(anonymous.headers.get('cache-control'),/no-store/);
const publicData=await anonymous.json();assert.ok('state'in publicData);assert.equal(publicData.revision,undefined);
assert.equal((await request('/api/game?manage=1')).status,401);
assert.equal((await request('/api/game',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:'{}'})).status,401);
const login=await request('/api/access',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({action:'login',passcode:secrets.FACILITATOR_PASSCODE})});assert.equal(login.status,200);
const cookie=login.headers.get('set-cookie').split(';')[0];
const manager=await request('/api/game?manage=1',{headers:{cookie}});assert.equal(manager.status,200);
const privateData=await manager.json();assert.equal(!!privateData.state,!!publicData.state);
if(privateData.state){
  assert.equal(typeof privateData.revision,'string');
  assert.ok(!privateData.revision.startsWith('W/'),'Manager must receive a strong revision usable for conditional writes');
  assert.deepEqual(publicData.state.teams,privateData.state.teams);
  if(['discuss','record'].includes(privateData.state.phase))assert.ok(publicData.state.choices.every(c=>c===null));
}
assert.equal((await request('/api/game',{method:'POST',headers:{cookie,origin:'https://other.example','Content-Type':'application/json'},body:'{}'})).status,403);
assert.equal((await request('/api/game',{method:'POST',headers:{cookie,origin,'Content-Type':'application/json'},body:'{}'})).status,400);
await request('/api/access',{method:'POST',headers:{cookie,origin,'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});
console.log('Production shared API: anonymous read works; manager state requires signed login; anonymous, cross-origin and malformed writes rejected. Existing game was not modified. Shared session '+(publicData.state?'present.':'awaits first migration from Manage.'));
