import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccessHandler } from './access.mjs';

const origin='https://classroom.example';
const passcode='TEST-ONLY-CODE-9247';
const secret='test-only-secret-with-at-least-32-characters';
let time=1792396800000;
const handle=createAccessHandler({passcode,secret,now:()=>time,loadFacilitator:async()=> '/* private facilitator controls */'});
const get=(query='',cookie='')=>new Request(origin+'/api/access'+query,{headers:{cookie}});
const post=(data,extra={})=>new Request(origin+'/api/access',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...extra},body:JSON.stringify(data)});

test('anonymous requests cannot get the controller, including query-string bypasses',async()=>{
  for(const query of ['', '?asset=facilitator','?display=1&asset=facilitator']) {
    const response=await handle(get(query));assert.equal(response.status,401);assert.match(response.headers.get('cache-control'),/no-store/);
    assert.doesNotMatch(await response.text(),/private facilitator controls/);
  }
});
test('wrong passcode and cross-origin login fail without creating cookies',async()=>{
  const wrong=await handle(post({action:'login',passcode:'WRONG'}));assert.equal(wrong.status,401);assert.equal(wrong.headers.get('set-cookie'),null);
  const cross=await handle(post({action:'login',passcode},{Origin:'https://other.example'}));assert.equal(cross.status,403);
});
test('valid login gives a secure HttpOnly session; forgery, expiry and key rotation fail',async()=>{
  const response=await handle(post({action:'login',passcode}));assert.equal(response.status,200);
  const cookieHeader=response.headers.get('set-cookie');assert.match(cookieHeader,/HttpOnly/);assert.match(cookieHeader,/SameSite=Strict/);assert.match(cookieHeader,/Secure/);
  assert.doesNotMatch(cookieHeader,new RegExp(passcode));
  const cookie=cookieHeader.split(';')[0];
  const controller=await handle(get('?asset=facilitator',cookie));assert.equal(controller.status,200);assert.equal(await controller.text(),'/* private facilitator controls */');assert.match(controller.headers.get('cache-control'),/no-store/);
  const forged=cookie.slice(0,-1)+(cookie.endsWith('A')?'B':'A');assert.equal((await handle(get('',forged))).status,401);
  const rotated=createAccessHandler({passcode,secret:secret+'changed',loadFacilitator:async()=>''});assert.equal((await rotated(get('',cookie))).status,401);
  time+=8*60*60*1000+1;assert.equal((await handle(get('',cookie))).status,401);time-=8*60*60*1000+1;
});
test('logout expires the cookie, and missing server secrets fail closed',async()=>{
  const logout=await handle(post({action:'logout'}));assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
  const unconfigured=createAccessHandler({loadFacilitator:async()=>''});assert.equal((await unconfigured(get())).status,503);
});

test('two groups of four characters unlock Manage, while shorter configuration fails closed',async()=>{
  const shortCode='ABCD-2345';
  const shortened=createAccessHandler({passcode:shortCode,secret,now:()=>time,loadFacilitator:async()=> '/* private controls */'});
  const response=await shortened(post({action:'login',passcode:shortCode.toLowerCase()}));assert.equal(response.status,200);
  const cookie=response.headers.get('set-cookie').split(';')[0];
  assert.equal((await shortened(get('?asset=facilitator',cookie))).status,200);
  assert.equal((await shortened(post({action:'login',passcode:shortCode+'-LONG-OLD1'}))).status,401);
  const tooShort=createAccessHandler({passcode:'ABCD-234',secret});assert.equal((await tooShort(get())).status,503);
});
