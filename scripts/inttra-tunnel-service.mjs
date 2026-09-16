// Supervised by launchd. Only refreshes the relay URL; never builds or deploys application code.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
let stopping=false,updater,timer,pending='',saved='';
const tunnel=spawn(process.env.CLOUDFLARED_BIN||'/opt/homebrew/bin/cloudflared',['tunnel','--url','http://127.0.0.1:18744','--no-autoupdate'],{stdio:['ignore','pipe','pipe']});
function sync(){
 if(stopping||updater||!pending||pending===saved)return;
 const target=pending;
 updater=spawn(process.execPath,[path.join(root,'node_modules/wrangler/bin/wrangler.js'),'secret','put','INTTRA_RELAY_URL','--config','wrangler.production.json'],{cwd:root,stdio:['pipe','ignore','ignore'],env:{...process.env,PATH:path.dirname(process.execPath)+':'+(process.env.PATH||'/usr/bin:/bin')}});
 updater.stdin.on('error',()=>{});updater.stdin.end(target+'\n');
 updater.on('error',()=>{console.error('Relay address update could not start.');});
 updater.on('close',code=>{updater=null;if(stopping)return;if(code===0){saved=target;const file=path.join(root,'.private/inttra-relay/secrets.json');const current=JSON.parse(fs.readFileSync(file,'utf8'));current.INTTRA_RELAY_URL=target;fs.writeFileSync(file,JSON.stringify(current),{mode:0o600});console.log('Relay address synchronized with live Worker.');if(pending!==saved)sync();}else{console.error('Relay address update failed; retrying in 60 seconds.');timer=setTimeout(sync,60000);}});
}
for(const stream of [tunnel.stdout,tunnel.stderr]){let buffer='';stream.on('data',chunk=>{buffer=(buffer+chunk.toString()).slice(-16384);const match=buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(match&&match[0]!==pending){pending=match[0];sync();}});}
tunnel.on('error',()=>{console.error('Tunnel could not start.');process.exit(1)});
tunnel.on('close',()=>{if(!stopping){console.error('Tunnel stopped; launchd will restart it.');updater?.kill('SIGTERM');process.exit(1)}});
function stop(){stopping=true;clearTimeout(timer);tunnel.kill('SIGTERM');updater?.kill('SIGTERM');setTimeout(()=>process.exit(0),1000).unref();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
