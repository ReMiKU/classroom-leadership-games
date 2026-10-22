import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

if(!process.env.LEADERSHIP_APP_URL)throw new Error('Set LEADERSHIP_APP_URL to the deployment origin to check.');
const base=new URL(process.env.LEADERSHIP_APP_URL).origin;
const secrets=JSON.parse(await readFile('.facilitator-secrets.json','utf8'));
const request=(path,options={})=>fetch(base+path,{redirect:'error',...options});
const post=(data,origin=base)=>request('/api/access',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(data)});
const checks=[];
let response=await request('/api/access?asset=facilitator');assert.equal(response.status,401);checks.push('Anonymous controller request rejected (401).');
for(const path of ['/app.mjs','/.private/facilitator-app.mjs','/lib/access.mjs','/.facilitator-access.txt','/.facilitator-secrets.json']){
  response=await request(path);assert.equal(response.status,404,`Private path must not be published: ${path}`);
}
checks.push('Old controller, server source and local secret paths are not public (404).');
response=await request('/projector.mjs');assert.equal(response.status,200);checks.push('Public projector script available (200).');
response=await post({action:'login',passcode:'incorrect-code'});assert.equal(response.status,401);assert.equal(response.headers.get('set-cookie'),null);checks.push('Wrong passcode rejected without a session.');
response=await post({action:'login',passcode:secrets.FACILITATOR_PASSCODE},'https://other.example');assert.equal(response.status,403);checks.push('Cross-origin login rejected (403).');
response=await post({action:'login',passcode:secrets.FACILITATOR_PASSCODE});assert.equal(response.status,200);
const cookieHeader=response.headers.get('set-cookie');assert.match(cookieHeader,/HttpOnly/);assert.match(cookieHeader,/SameSite=Strict/);assert.match(cookieHeader,/Secure/);
const cookie=cookieHeader.split(';')[0];
response=await request('/api/access?asset=facilitator',{headers:{Cookie:cookie}});assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
const source=await response.text();assert.match(source,/function controls\(/);assert.equal(source.includes(secrets.FACILITATOR_PASSCODE),false);assert.equal(source.includes(secrets.FACILITATOR_SESSION_SECRET),false);
checks.push('Correct passcode unlocks a no-store controller through a secure HttpOnly session; server secrets are absent from its source.');
response=await post({action:'logout'});assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/Max-Age=0/);checks.push('Lock expires the browser session cookie.');
console.log(JSON.stringify({passed:true,checks},null,2));
