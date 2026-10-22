import { randomBytes } from 'node:crypto';
import { writeFile, access, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const action=process.argv[2];
const deploymentOrigin=new URL(process.env.LEADERSHIP_APP_URL||'http://127.0.0.1:4173').origin;
const file=path.join(process.cwd(),'.facilitator-secrets.json');
if(action==='generate') {
  try{await access(file);console.log('Existing facilitator secrets retained.');process.exit(0);}catch{}
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const chars=[...randomBytes(8)].map(b=>alphabet[b%alphabet.length]).join('');
  const passcode=chars.match(/.{4}/g).join('-');
  const secrets={FACILITATOR_PASSCODE:passcode,FACILITATOR_SESSION_SECRET:randomBytes(32).toString('hex')};
  await writeFile(file,JSON.stringify(secrets),{flag:'wx'});
  await writeFile(path.join(process.cwd(),'.facilitator-access.txt'),`Leadership Lab — private facilitator access\n\nFacilitator desk: ${deploymentOrigin}/?manage=1#board\nPasscode: ${passcode}\n\nPublic projector: ${deploymentOrigin}/?display=1\n\nKeep the passcode private. Unlock lasts up to 8 hours in the browser; use Lock when stepping away. The public projector follows the shared game session.\n`,{flag:'wx'});
  console.log('Generated a private facilitator access file. Secret values were not printed.');
} else if(action==='upload'||action==='update') {
  const key=process.argv[3];
  if(!['FACILITATOR_PASSCODE','FACILITATOR_SESSION_SECRET'].includes(key))throw new Error('Unknown secret.');
  const target=action==='update'?process.argv[4]:'production,preview';
  if(!['production','preview','production,preview'].includes(target))throw new Error('Specify production or preview.');
  const secrets=JSON.parse(await readFile(file,'utf8'));
  // Values travel only through stdin, never command arguments or terminal output.
  const child=spawn('npx.cmd',['--yes','vercel@64.5.0','env',action==='update'?'update':'add',key,target,'--sensitive','--yes','--non-interactive'],{shell:true,stdio:['pipe','pipe','pipe'],windowsHide:true});
  child.stdin.end(secrets[key]);
  let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
  child.on('exit',code=>{if(code===0)console.log(`Configured ${key} for ${target}.`);else{console.error(output.replaceAll(secrets[key],'[redacted]'));process.exitCode=code||1;}});
} else throw new Error('Use generate, upload or update.');
