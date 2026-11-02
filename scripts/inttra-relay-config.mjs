import fs from 'node:fs';
import path from 'node:path';
function atomicPrivateWrite(file,text){
 const temp=file+'.refresh-'+process.pid;
 fs.writeFileSync(temp,text,{mode:0o600});fs.renameSync(temp,file);fs.chmodSync(file,0o600);
}
export function syncLocalRelay(root,target){
 if(!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(target))throw new Error('Invalid relay address');
 const file=path.join(root,'.private/inttra-relay/secrets.json');
 const current=JSON.parse(fs.readFileSync(file,'utf8'));current.INTTRA_RELAY_URL=target;
 atomicPrivateWrite(file,JSON.stringify(current));
 const envFile=path.join(root,'.env.local');
 if(fs.existsSync(envFile)){
  const env=fs.readFileSync(envFile,'utf8'),line='INTTRA_RELAY_URL='+target;
  const next=/^INTTRA_RELAY_URL=.*$/m.test(env)?env.replace(/^INTTRA_RELAY_URL=.*$/m,line):env+'\n'+line+'\n';
  if(next!==env)atomicPrivateWrite(envFile,next);
 }
}
