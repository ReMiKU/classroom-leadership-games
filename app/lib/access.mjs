import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const LIFETIME = 8 * 60 * 60;
const equal = (a,b) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

export function createAccessHandler({passcode, secret, loadFacilitator, now = Date.now}) {
  const configured = typeof passcode === 'string' && passcode.trim().replaceAll('-','').length >= 8 && typeof secret === 'string' && secret.length >= 32;
  const sign = value => createHmac('sha256', secret).update(`leadership-facilitator.v1.${value}`).digest('base64url');
  return async function handle(request) {
    const url=new URL(request.url);
    const secure=url.protocol==='https:';
    const name=secure?'__Host-leadership_facilitator':'leadership_facilitator';
    const headers=new Headers({'Cache-Control':'private, no-store, max-age=0','Vercel-CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'});
    const json=(data,status=200)=>{const h=new Headers(headers);h.set('Content-Type','application/json');return new Response(JSON.stringify(data),{status,headers:h});};
    if(!configured) return json({error:'Facilitator access is not configured yet.'},503);
    const cookie=(request.headers.get('cookie')||'').split(';').map(p=>p.trim()).find(p=>p.startsWith(name+'='))?.slice(name.length+1)||'';
    const parts=cookie.split('.');
    let expires=0;
    if(parts.length===3 && /^\d{10,13}$/.test(parts[0]) && /^[A-Za-z0-9_-]{16}$/.test(parts[1]) && /^[A-Za-z0-9_-]{43}$/.test(parts[2])) {
      const expiration=Number(parts[0]);
      if(equal(parts[2],sign(`${parts[0]}.${parts[1]}`)) && expiration>now() && expiration<=now()+(LIFETIME+60)*1000) expires=expiration;
    }
    if(request.method==='GET') {
      if(!expires) return json({authenticated:false},401);
      if(url.searchParams.get('asset')==='facilitator') {
        headers.set('Content-Type','text/javascript; charset=utf-8');
        return new Response(await loadFacilitator(),{headers});
      }
      return json({authenticated:true,expiresAt:expires});
    }
    if(request.method!=='POST') {headers.set('Allow','GET, POST');return json({error:'Method not allowed.'},405);}
    // Only the same-origin sign-in form can create or clear a browser session.
    if(request.headers.get('origin')!==url.origin || request.headers.get('sec-fetch-site')==='cross-site') return json({error:'Request origin not allowed.'},403);
    if(!request.headers.get('content-type')?.startsWith('application/json')) return json({error:'Use JSON.'},415);
    if(Number(request.headers.get('content-length'))>1024) return json({error:'Request too large.'},413);
    let data;
    try {const body=await request.text();if(Buffer.byteLength(body)>1024)return json({error:'Request too large.'},413);data=JSON.parse(body);} catch {return json({error:'Invalid request.'},400);}
    const attributes=`Path=/; HttpOnly; SameSite=Strict${secure?'; Secure':''}`;
    if(data?.action==='logout') {
      headers.set('Set-Cookie',`${name}=; ${attributes}; Max-Age=0`);
      return json({authenticated:false});
    }
    if(data?.action!=='login'||typeof data.passcode!=='string'||data.passcode.length>128) return json({error:'Invalid request.'},400);
    if(!equal(data.passcode.trim().toUpperCase(),passcode.trim().toUpperCase())) return json({error:'That passcode is not correct. Please try again.'},401);
    expires=now()+LIFETIME*1000;
    const payload=`${expires}.${randomBytes(12).toString('base64url')}`;
    headers.set('Set-Cookie',`${name}=${payload}.${sign(payload)}; ${attributes}; Max-Age=${LIFETIME}`);
    return json({authenticated:true,expiresAt:expires});
  };
}
