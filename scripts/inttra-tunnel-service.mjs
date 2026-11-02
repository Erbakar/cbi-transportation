import {syncLocalRelay} from './inttra-relay-config.mjs';
import {restartingProcess} from './restarting-process.mjs';
// Supervised by launchd. Only refreshes the relay URL; never builds or deploys application code.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const relayKey=fs.readFileSync(process.env.RELAY_KEY_FILE||path.join(root,'.private/inttra-relay/key'),'utf8').trim();
let stopping=false,updater,timer,pending='',saved='',healthFailures=0,discoveredAt=0;
let tunnel;
function sync(){
 if(stopping||updater||!pending||pending===saved)return;
 const target=pending;
 // An expired CLI login must not hold every future tunnel address indefinitely.
 // Repeating this one-setting update is safe even if the prior result was lost.
 updater=spawn(process.execPath,[path.join(root,'node_modules/wrangler/bin/wrangler.js'),'secret','put','INTTRA_RELAY_URL','--config','wrangler.production.json'],{cwd:root,stdio:['pipe','ignore','ignore'],timeout:60000,killSignal:'SIGKILL',env:{...process.env,CI:'true',PATH:path.dirname(process.execPath)+':'+(process.env.PATH||'/usr/bin:/bin')}});
 updater.stdin.on('error',()=>{});updater.stdin.end(target+'\n');
 updater.on('error',()=>{console.error('Relay address update could not start.');});
 updater.on('close',code=>{updater=null;if(stopping)return;if(code===0){saved=target;console.log('Relay address synchronized with live Worker.');if(pending!==saved)sync();}else{console.error('Relay address update failed; retrying in 60 seconds.');timer=setTimeout(sync,60000);}});
}
const supervisor=restartingProcess(()=>{
 pending='';healthFailures=0;
 tunnel=spawn(process.env.CLOUDFLARED_BIN||'/opt/homebrew/bin/cloudflared',['tunnel','--url','http://127.0.0.1:18744','--no-autoupdate'],{stdio:['ignore','pipe','pipe']});
 for(const stream of [tunnel.stdout,tunnel.stderr]){let buffer='';stream.on('data',chunk=>{buffer=(buffer+chunk.toString()).slice(-16384);const match=buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(match&&match[0]!==pending){pending=match[0];discoveredAt=Date.now();healthFailures=0;syncLocalRelay(root,pending);console.log('Relay address synchronized with local preview.');sync();}});}
 return tunnel;
},{onRetry:delay=>{pending='';console.error('Tunnel stopped; retrying in '+delay/1000+' seconds.');}});
const healthTimer=setInterval(async()=>{
 if(stopping||!pending||Date.now()-discoveredAt<60000)return;
 try{const response=await fetch(pending+'/health',{method:'POST',headers:{Authorization:'Bearer '+relayKey},redirect:'manual',signal:AbortSignal.timeout(10000)});healthFailures=response.status!==200?healthFailures+1:0;}
 catch{healthFailures++;}
 if(healthFailures>=3){console.error('Relay tunnel is unreachable; restarting.');tunnel.kill('SIGTERM');}
},10000);
healthTimer.unref();
function stop(){stopping=true;clearTimeout(timer);clearInterval(healthTimer);supervisor.stop();updater?.kill('SIGTERM');setTimeout(()=>process.exit(0),1000).unref();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
