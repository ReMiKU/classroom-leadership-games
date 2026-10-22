import { readFile } from 'node:fs/promises';
import { createAccessHandler } from '../lib/access.mjs';

const handle=createAccessHandler({
  passcode:process.env.FACILITATOR_PASSCODE,
  secret:process.env.FACILITATOR_SESSION_SECRET,
  // Resolve from this file, not process.cwd(): Git deployments with a Root Directory run from the repository root.
  loadFacilitator:()=>readFile(new URL('../.private/facilitator-app.mjs',import.meta.url),'utf8')
});

async function dispatch(request) {
  try {return await handle(request);} catch {console.error('Facilitator access request failed.');return Response.json({error:'Unable to verify facilitator access. Please retry.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
export const GET=dispatch;
export const POST=dispatch;
