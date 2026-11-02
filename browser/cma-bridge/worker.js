/* global chrome */
import {KEY} from './config.js';
import {pollCloud} from './cloud.js';
let busy=false;
async function call(path,body){const r=await fetch('http://127.0.0.1:18745'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+KEY,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Local bridge unavailable');return r.json();}
async function poll(){
 if(busy)return;busy=true;let tab;
 try{
  const {job}=await call('/next');if(!job)return;
  if(job.action!=='read-vgm-dashboard')return;
  // Only an agent-created inactive tab is used. Existing tabs are never changed.
  tab=await chrome.tabs.create({url:'https://www.cma-cgm.com/ebusiness/vgm',active:false});
  let snapshot={state:'unavailable'};
  const until=Date.now()+20000;
  while(Date.now()<until){
   await new Promise(r=>setTimeout(r,700));
   const current=await chrome.tabs.get(tab.id);
   if(current.url&&new URL(current.url).origin!=='https://www.cma-cgm.com'){snapshot={state:'login_required'};break;}
   try{const result=await chrome.tabs.sendMessage(tab.id,{action:'read-vgm-dashboard'});if(result?.state){snapshot=result;break;}}catch{/* Content script not ready. */}
  }
  await call('/result',{id:job.id,snapshot});
 }catch{/* No credentials, page contents or URLs are logged. */}
 finally{if(tab?.id)try{await chrome.tabs.remove(tab.id);}catch{/* Already closed. */}busy=false;}
}
chrome.alarms.create('cma-read',{periodInMinutes:0.5});
chrome.alarms.onAlarm.addListener(a=>{if(a.name==='cma-read')void poll();});
chrome.runtime.onInstalled.addListener(()=>void poll());
chrome.runtime.onStartup.addListener(()=>void poll());
void poll();

chrome.alarms.create('cma-cloud',{periodInMinutes:0.5});
chrome.alarms.onAlarm.addListener(a=>{if(a.name==='cma-cloud')void pollCloud();});
void pollCloud();
