import {createAccessHandler} from '../lib/access.mjs';
import {createGameHandler} from '../lib/live-game.mjs';
import {blobGameStore} from '../lib/blob-game.mjs';
const access=createAccessHandler({passcode:process.env.FACILITATOR_PASSCODE,secret:process.env.FACILITATOR_SESSION_SECRET});
const handle=createGameHandler({store:blobGameStore,authenticate:async request=>(await access(new Request(new URL('/api/access',request.url),{headers:request.headers}))).ok});
export const GET=handle;
export const POST=handle;
