import {AppError,db,runtime} from './runtime';
import {readCredentials} from './platforms';
const ID='cma-cgm';
const ENTRY='https://www.cma-cgm.com/ebusiness/customer-hub/';
// CMA credentials never enter the HBL/MBL platform selector or their session cache.
export async function saveCmaCredentials(owner:string,username:string,password:string){
 if(!username.trim()||username.length>256||!password||password.length>1024)throw new AppError('Kullanıcı adı ve şifre gerekli.');
 const raw=runtime().ENCRYPTION_KEY;
 if(!raw||!/^[0-9a-f]{64}$/i.test(raw))throw new AppError('Oturum şifreleme anahtarı eksik.',503);
 const key=await crypto.subtle.importKey('raw',new Uint8Array(raw.match(/../g)!.map(h=>parseInt(h,16))),'AES-GCM',false,['encrypt']);
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const body=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify({username:username.trim(),password})));
 const encrypted=JSON.stringify({iv:Array.from(iv),body:Array.from(new Uint8Array(body))});
 await db().batch([
  db().prepare('INSERT INTO platform_credentials (key,encrypted) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET encrypted=excluded.encrypted').bind(owner+':'+ID,encrypted),
  db().prepare('DELETE FROM platform_sessions WHERE key=?').bind(owner+':'+ID),
 ]);
 return cmaConnection(owner);
}
export async function cmaConnection(owner:string){
 const credentials=await readCredentials(owner,ID);
 return {credentialsSaved:!!credentials,connected:false,submissionEnabled:false,entryUrl:ENTRY,
  message:credentials?'CMA CGM hesabı şifreli kaydedildi. Arka planda oturum açma henüz doğrulanmadı; VGM gönderimi kapalı.':'CMA CGM şirket hesabını kaydedin. Hesap, konşimento bağlantılarından ayrı saklanır.'};
}
export async function probeCmaConnection(owner:string){
 const state=await cmaConnection(owner);
 if(!state.credentialsSaved)throw new AppError('Önce CMA CGM şirket hesabını kaydedin.',422);
 // Connectivity only: never send credentials to an unverified login contract,
 // follow redirects, borrow a browser session or treat HTTP 200 as authentication.
 try{
  const r=await fetch(ENTRY,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(15000)});
  await r.body?.cancel();
  return {...state,httpStatus:r.status,checkedAt:new Date().toISOString(),message:
   r.status===403||r.status===429?'CMA CGM sunucudan erişimi reddetti. Hesap kaydedildi ancak otomatik giriş ve VGM aktarımı doğrulanamadı.':
   'CMA CGM adresinden yanıt alındı. Bu sonuç hesap doğrulaması değildir; otomatik giriş ve VGM aktarımı henüz kapalı.'};
 }catch{return {...state,checkedAt:new Date().toISOString(),message:'CMA CGM adresine sunucudan ulaşılamadı. Hesap kaydı korunuyor; otomatik gönderim kapalı.'};}
}
