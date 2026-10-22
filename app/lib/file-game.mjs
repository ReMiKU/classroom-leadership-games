import {readFile,writeFile,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
// Local preview only. Production uses the private Blob store.
export function fileGameStore(filename){
  let queue=Promise.resolve();
  const read=async()=>{try{return JSON.parse(await readFile(filename,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}};
  return {read,write(data,revision){
    const operation=queue.then(async()=>{
      const current=await read();if((current?.revision??null)!==revision){const error=Error('Concurrent change');error.code='CONFLICT';throw error;}
      const saved={...data,revision:randomUUID()};await writeFile(filename+'.tmp',JSON.stringify(saved));await rename(filename+'.tmp',filename);return saved;
    });
    queue=operation.catch(()=>{});return operation;
  }};
}
