import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createAccessHandler } from '../lib/access.mjs';

const handle=createAccessHandler({
  passcode:process.env.FACILITATOR_PASSCODE,
  secret:process.env.FACILITATOR_SESSION_SECRET,
  loadFacilitator:()=>readFile(path.join(process.cwd(),'.private','facilitator-app.mjs'),'utf8')
});

async function dispatch(request) {
  try {return await handle(request);} catch {console.error('Facilitator access request failed.');return Response.json({error:'Unable to verify facilitator access. Please retry.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
export const GET=dispatch;
export const POST=dispatch;
