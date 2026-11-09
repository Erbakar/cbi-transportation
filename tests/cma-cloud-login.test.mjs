import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Load the extension module with its private key import replaced by a test value.
async function loadCloud(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cma-cloud-'));
 const file=path.join(dir,'cloud.mjs');
 fs.writeFileSync(file,fs.readFileSync('browser/cma-bridge/cloud.js','utf8').replace("import {KEY} from './config.js';","const KEY='test';"));
 return import(file+'?'+Date.now());
}

function harness({loginStates,history}){
 const calls=[];let url='https://auth.cma-cgm.com/login',logins=0;
 globalThis.fetch=async(_u,init)=>{const body=JSON.parse(init.body);calls.push(body);
  return {ok:true,json:async()=>body.action==='next'?{job:{id:'00000000-0000-4000-8000-000000000000',mode:'history',credentials:{username:'ops@example.com',password:'x'}}}:{ok:true}};};
 globalThis.chrome={tabs:{
  create:async()=>({id:1}),remove:async()=>{},
  get:async()=>({id:1,url,status:'complete'}),
  update:async(_id,{url:next})=>{url=next;},
  sendMessage:async(_id,msg)=>{
   if(msg.action==='cbi-cma-login'){const state=loginStates[Math.min(logins++,loginStates.length-1)];if(state==='login_started')url='https://www.cma-cgm.com/ebusiness/account/edit';return {state};}
   if(msg.action==='cbi-cma-account')return {state:'account',account:'ops@example.com'};
   if(msg.action==='read-vgm-dashboard')return history;
   return null;
  }}};
 return calls;
}

test('CMA login form that renders late is retried instead of failing immediately',async()=>{
 const calls=harness({loginStates:['login_form_changed','login_form_changed','login_started'],history:{state:'ready',rows:[],total:0,complete:true}});
 const {pollCloud}=await loadCloud();
 await pollCloud();
 const result=calls.find(c=>c.action==='history-result');
 assert.ok(result?.snapshot,'history snapshot is reported');
 assert.equal(result.account,'ops@example.com');
 assert.equal(result.message,undefined);
});

test('CMA incomplete history is still reported as incomplete, never as a full list',async()=>{
 const calls=harness({loginStates:['login_started'],history:{state:'ready',rows:[],total:5,complete:false}});
 const {pollCloud}=await loadCloud();
 await pollCloud();
 const result=calls.find(c=>c.action==='history-result');
 assert.equal(result.snapshot,undefined);
 assert.match(result.message,/history_incomplete/);
});
