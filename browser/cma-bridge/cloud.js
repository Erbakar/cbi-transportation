/* global chrome */
import {KEY} from './config.js';
const ORIGIN='https://cbi-transportation.kadirerbakar.workers.dev';
const accountUrl='https://www.cma-cgm.com/ebusiness/account/edit',formUrl='https://www.cma-cgm.com/ebusiness/vgm/declaration';
let running=false;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function api(body){const r=await fetch(ORIGIN+'/api/carriers/cma-cgm/agent',{method:'POST',headers:{Authorization:'Bearer '+KEY,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('agent_unavailable');return r.json();}
async function message(tab,body){try{return await chrome.tabs.sendMessage(tab.id,body);}catch{return null;}}
async function account(tab,credentials){
 let login=false,returned=false;const until=Date.now()+60000;
 while(Date.now()<until){
  const current=await chrome.tabs.get(tab.id),url=new URL(current.url||accountUrl);
  if(url.origin==='https://auth.cma-cgm.com'){
   if(!login){const result=await message(tab,{action:'cbi-cma-login',credentials});if(result?.state==='login_started')login=true;else if(result&&result.state!=='login_required')throw Error(result.state);}
  }else if(url.origin==='https://www.cma-cgm.com'){
   if(url.pathname==='/ebusiness/account/edit'){
    const result=await message(tab,{action:'cbi-cma-account'});
    if(result?.state==='account'){if(result.account.toLowerCase()!==credentials.username.toLowerCase())throw Error('account_mismatch');return result.account;}
    if(result?.state==='verification_required')throw Error('verification_required');
   }
   if(url.pathname!=='/ebusiness/account/edit'&&current.status==='complete'&&!returned){returned=true;await chrome.tabs.update(tab.id,{url:accountUrl});}
  }else throw Error('unexpected_login_origin');
  await delay(800);
 }
 throw Error('login_timeout');
}
export async function pollCloud(){
 if(running)return;running=true;let tab,job,committed=false;
 try{
  ({job}=await api({action:'next',version:'0.2.3'}));if(!job)return;
  tab=await chrome.tabs.create({url:accountUrl,active:false});
  const identity=await account(tab,job.credentials);delete job.credentials;
  if(job.mode==='connect'){await api({action:'connection-result',id:job.id,connected:true,message:'Kayıtlı şirket hesabı arka planda doğrulandı.'});return;}
  if(job.mode==='history'){
   await chrome.tabs.update(tab.id,{url:'https://www.cma-cgm.com/ebusiness/vgm'});
   let snapshot;const end=Date.now()+45000;
   while(Date.now()<end){snapshot=await message(tab,{action:'read-vgm-dashboard'});if(snapshot?.state==='ready')break;if(snapshot?.state==='login_required')throw Error('login_required');await delay(1000);}
   if(!snapshot?.complete)throw Error('history_incomplete');
   await api({action:'history-result',id:job.id,account:identity,snapshot});return;
  }
  // Only our newly-created tab is navigated. Existing user tabs are untouched.
  await chrome.tabs.update(tab.id,{url:formUrl});
  let result;const until=Date.now()+25000;
  while(Date.now()<until){const current=await chrome.tabs.get(tab.id);if(current.url===formUrl&&current.status==='complete'){result=await message(tab,{action:'cbi-cma-prepare',payload:job.payload});if(result&&result.state!=='wrong_page')break;}await delay(800);}
  if(result?.state!=='prepared')throw Error(result?.message||result?.state||'form_timeout');
  if(job.mode==='prepare'){await api({action:'result',id:job.id,lease:job.lease,state:'prepared',message:'CMA hesabı ve VGM alanları doğrulandı. Gönderim yapılmadı.'});return;}
  if(job.mode!=='submit')throw Error('invalid_mode');
  // Durable server-side commit must precede the single carrier click. Never auto-retry a committed job.
  const permission=await api({action:'commit',id:job.id,lease:job.lease,account:identity});if(!permission.permitted)throw Error('not_permitted');committed=true;
  const clicked=await message(tab,{action:'cbi-cma-submit',payload:job.payload});
  if(clicked?.state!=='clicked')throw Error(clicked?.message||'submit_unconfirmed');
  const end=Date.now()+45000;let sent=false,validation='';
  while(Date.now()<end){await delay(800);const result=await message(tab,{action:'cbi-cma-result'});if(result?.state==='submitted'){sent=true;break;}if(result?.state==='validation_failed'){validation=result.message;break;}}
  await api({action:'result',id:job.id,lease:job.lease,state:sent?'submitted':'unknown',message:sent?'CMA: VGM gönderildi, armatör doğrulaması bekleniyor.':validation||'Gönderim sonucu doğrulanamadı. Tekrar gönderilmez; CMA kaydı kontrol edilmeli.'});
 }catch(e){if(job?.mode==='history'){try{await api({action:'history-result',id:job.id,message:'CMA geçmişi güncellenemedi: '+(/^[a-z_]+$/.test(e.message)?e.message:'connection_error')});}catch{/* Keep prior history. */}return;}if(job?.mode==='connect'){try{await api({action:'connection-result',id:job.id,connected:false,message:'Arka plan girişi tamamlanamadı: '+(/^[a-z_]+$/.test(e.message)?e.message:'connection_error')});}catch{/* No credentials logged. */}return;}if(job)try{await api({action:'result',id:job.id,lease:job.lease,state:committed?'unknown':'blocked',message:committed?'Gönderim sonucu belirsiz. Tekrar gönderilmedi.':({'account_mismatch':'Açık CMA hesabı kayıtlı şirket hesabıyla eşleşmiyor.','verification_required':'CMA ek güvenlik doğrulaması istiyor.','login_timeout':'Kayıtlı hesapla otomatik giriş tamamlanamadı.','container_lookup_timeout':'CMA konteyner bilgilerini zamanında getiremedi. Gönderim başlatılmadı.','carrier_required_fields':'CMA ek zorunlu alanlar istiyor.','carrier_validation':'CMA alan kontrolü başarısız.'}[e.message]||'CMA ön kontrolü tamamlanamadı: '+(/^[a-z_]+$/.test(e.message)?e.message:'connection_error'))});}catch{/* Expiry resolves to blocked/unknown; no resend. */}}
 finally{if(tab?.id)try{await chrome.tabs.remove(tab.id);}catch{/* Already closed. */}running=false;}
}
