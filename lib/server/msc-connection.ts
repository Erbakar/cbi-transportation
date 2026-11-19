import {AppError,db,runtime} from './runtime';
import {readCredentials} from './platforms';
import {platformGateway} from './platform-gateway';

export const MSC_ID='msc';
const SESSION_MS=30*60000;
type Cookie={name:string;value:string;domain:string;path:string;expires:number;httpOnly:boolean;secure:boolean;sameSite?:string};
type LoginResult={state:'ready'|'credentials'|'challenge'|'blocked'|'failed';message:string;step:string;cookies?:Cookie[];checkedAt:string};
export type MscState={credentialsSaved:boolean;connected:boolean;message:string;checkedAt?:string;state?:LoginResult['state']};

async function key(usage:'encrypt'|'decrypt'){
 const raw=runtime().ENCRYPTION_KEY;
 if(!raw||!/^[0-9a-f]{64}$/i.test(raw))throw new AppError('Oturum şifreleme anahtarı eksik.',503);
 return crypto.subtle.importKey('raw',new Uint8Array(raw.match(/../g)!.map(h=>parseInt(h,16))),'AES-GCM',false,[usage]);
}
async function seal(data:unknown){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const body=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key('encrypt'),new TextEncoder().encode(JSON.stringify(data)));
 return JSON.stringify({iv:Array.from(iv),body:Array.from(new Uint8Array(body))});
}
async function unseal<T>(data:string):Promise<T>{
 const {iv,body}=JSON.parse(data) as {iv:number[];body:number[]};
 return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(iv)},await key('decrypt'),new Uint8Array(body))));
}

/** MSC credentials live beside the CMA account, outside the HBL/MBL platform selector. */
export async function saveMscCredentials(owner:string,username:string,password:string){
 if(!username.trim()||username.length>256||!password||password.length>1024)throw new AppError('Kullanıcı adı ve şifre gerekli.');
 await db().batch([
  db().prepare('INSERT INTO platform_credentials (key,encrypted) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET encrypted=excluded.encrypted').bind(owner+':'+MSC_ID,await seal({username:username.trim(),password})),
  db().prepare('DELETE FROM platform_sessions WHERE key=?').bind(owner+':'+MSC_ID),
 ]);
 return mscConnection(owner);
}

export async function mscConnection(owner:string):Promise<MscState>{
 const credentials=await readCredentials(owner,MSC_ID);
 const session=await db().prepare('SELECT expires FROM platform_sessions WHERE key=?').bind(owner+':'+MSC_ID).first<{expires:number}>();
 const connected=!!session&&session.expires>Date.now();
 return {credentialsSaved:!!credentials,connected,
  message:!credentials?'myMSC şirket hesabını kaydedin. Giriş, sunucudaki tarayıcıda arka planda yapılır.':connected?'myMSC oturumu sunucuda açık.':'myMSC hesabı kayıtlı. Oturum gerektiğinde arka planda açılır.'};
}

/** Opens (or reuses) the myMSC session in the server browser; nothing is submitted. */
export async function mscSession(owner:string,force=false):Promise<MscState&{cookies?:Cookie[]}>{
 const credentials=await readCredentials(owner,MSC_ID);
 if(!credentials)throw new AppError('Önce myMSC şirket hesabını kaydedin.',422);
 const service=runtime().CARRIER_BROWSER,gateway=platformGateway(MSC_ID);
 if(!service&&!gateway)throw new AppError('Sunucu tarayıcısı bağlantısı yapılandırılmadı.',503);
 const cached=force?null:await db().prepare('SELECT encrypted,expires FROM platform_sessions WHERE key=?').bind(owner+':'+MSC_ID).first<{encrypted:string;expires:number}>();
 const previous=cached?await unseal<{cookies:Cookie[]}>(cached.encrypted).catch(()=>null):null;
 const payload=JSON.stringify({...credentials,cookies:previous?.cookies});
 let result:LoginResult|null=null;
 // The VDS gateway's Chrome first; Cloudflare's browser only when the gateway did not take the run
 // (unreachable or busy). A run the gateway started is never repeated elsewhere.
 if(gateway){
  let answer:Response|null=null;
  try{answer=await fetch(new URL('/msc/login',gateway.url),{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json',Authorization:'Bearer '+gateway.key},body:payload,signal:AbortSignal.timeout(100000)});}
  catch(error){if(error instanceof Error&&error.name==='TimeoutError')throw new AppError('Sunucu tarayıcısı zamanında yanıt vermedi.',504);}
  // 524: Cloudflare stopped waiting while the gateway may still be signing in; do not start a second run.
  if(answer?.status===524)throw new AppError('Sunucu tarayıcısı zamanında yanıt vermedi.',504);
  if(answer?.headers.get('x-cbi-gateway')==='msc'){if(!answer.ok)throw new AppError('Sunucu tarayıcısı yanıt vermedi.',502);result=await answer.json() as LoginResult;}
  else{await answer?.body?.cancel().catch(()=>{});console.log(JSON.stringify({event:'msc-gateway-fallback',status:answer?.status??0}));}
 }
 if(!result){
  if(!service)throw new AppError('Sunucu tarayıcısı yanıt vermedi.',502);
  const response=await service.fetch('https://carrier-browser/msc/login',{method:'POST',headers:{'Content-Type':'application/json'},body:payload,signal:AbortSignal.timeout(150000)}).catch(()=>{throw new AppError('Sunucu tarayıcısı zamanında yanıt vermedi.',504);});
  if(!response.ok)throw new AppError('Sunucu tarayıcısı yanıt vermedi.',502);
  result=await response.json() as LoginResult;
 }
 if(result.state==='ready'&&result.cookies?.length){
  await db().prepare('INSERT INTO platform_sessions (key,encrypted,expires) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET encrypted=excluded.encrypted,expires=excluded.expires').bind(owner+':'+MSC_ID,await seal({cookies:result.cookies}),Date.now()+SESSION_MS).run();
 }else{
  await db().prepare('DELETE FROM platform_sessions WHERE key=?').bind(owner+':'+MSC_ID).run();
 }
 console.log(JSON.stringify({event:'msc-login',state:result.state,step:result.step}));
 return {credentialsSaved:true,connected:result.state==='ready',state:result.state,message:result.message,checkedAt:result.checkedAt,...(result.state==='ready'?{cookies:result.cookies}:{})};
}
