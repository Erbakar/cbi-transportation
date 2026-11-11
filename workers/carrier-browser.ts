/**
 * Server-side browser for carrier portals that offer no programmatic login (myMSC).
 * Runs in Cloudflare Browser Rendering, reachable only through the app's service binding.
 * It never retries a submission and never works around portal security checks: a captcha,
 * one-time code or block page stops the run and is reported as such.
 */
import puppeteer, {type Page} from '@cloudflare/puppeteer';

type Env={BROWSER:Fetcher;BUCKET:R2Bucket};
type Cookie={name:string;value:string;domain:string;path:string;expires:number;httpOnly:boolean;secure:boolean;sameSite?:'Strict'|'Lax'|'None'};
type LoginInput={username:string;password:string;cookies?:Cookie[]};
export type LoginResult={state:'ready'|'credentials'|'challenge'|'blocked'|'failed';message:string;step:string;cookies?:Cookie[];account?:string;checkedAt:string};

const MSC='https://www.mymsc.com/myMSC/';
const WELCOME=MSC+'welcome';
const challenge=/captcha|verification code|doğrulama kodu|one[- ]time|we sent a code|verify (that )?you are human|access denied/i;
const wrongPassword=/(incorrect|invalid|wrong).{0,40}(password|credentials|e-?mail)|password is incorrect|şifre.{0,20}(hatalı|yanlış)/i;

async function text(page:Page){return (await page.evaluate(()=>document.body?.innerText||'').catch(()=>'')).slice(0,4000);}
async function snapshot(env:Env,page:Page,name:string){try{await env.BUCKET.put(`carrier-browser/msc/${name}.jpg`,await page.screenshot({type:'jpeg',quality:60,fullPage:false}),{httpMetadata:{contentType:'image/jpeg'}});}catch{/* Diagnostics only. */}}
async function clickText(page:Page,pattern:RegExp){
 return page.evaluate((source:string,flags:string)=>{const re=new RegExp(source,flags);const el=[...document.querySelectorAll('button,a,input[type=submit]')].find(e=>re.test((e as HTMLElement).innerText||(e as HTMLInputElement).value||''));if(el){(el as HTMLElement).click();return true;}return false;},pattern.source,pattern.flags).catch(()=>false);
}
/** Signed in when myMSC shows its dashboard rather than the sign-in form. */
async function loggedIn(page:Page){if(!/(^|\.)mymsc\.com$/i.test(new URL(page.url()).hostname))return false;const body=await text(page);return !/Sign In Email/i.test(body)&&/Welcome to your Dashboard|Log ?out|Sign ?out|Instant Quote/i.test(body);}

async function mscLogin(env:Env,input:LoginInput):Promise<LoginResult>{
 const checkedAt=new Date().toISOString();
 const browser=await puppeteer.launch(env.BROWSER);
 let step='open';
 try{
  const page=await browser.newPage();
  await page.setViewport({width:1366,height:900});
  if(input.cookies?.length){await page.setCookie(...input.cookies).catch(()=>{});}
  const first=await page.goto(WELCOME,{waitUntil:'networkidle2',timeout:45000});
  if(first&&first.status()===403){await snapshot(env,page,'blocked');return {state:'blocked',step,message:'myMSC sunucu tarayıcısını engelledi (HTTP 403).',checkedAt};}
  if(await loggedIn(page)){const cookies=await page.cookies() as Cookie[];return {state:'ready',step:'session',message:'Kayıtlı myMSC oturumu geçerli.',cookies,checkedAt};}

  step='cookies';
  await clickText(page,/^\s*reject all\s*$/i);
  await new Promise(r=>setTimeout(r,500));

  step='email';
  const email=await page.waitForSelector('input[type=email],input[name*=mail i],input[id*=mail i],input[type=text]',{timeout:20000}).catch(()=>null);
  if(!email){await snapshot(env,page,'no-email');return {state:'failed',step,message:'myMSC giriş ekranında e-posta alanı bulunamadı.',checkedAt};}
  await email.click({clickCount:3});await email.type(input.username,{delay:20});
  await Promise.all([page.waitForNavigation({waitUntil:'networkidle2',timeout:45000}).catch(()=>null),clickText(page,/^\s*next\s*$/i)]);

  step='password';
  const password=await page.waitForSelector('input[type=password]',{timeout:30000}).catch(()=>null);
  if(!password){const body=await text(page);await snapshot(env,page,'no-password');
   if(challenge.test(body))return {state:'challenge',step,message:'myMSC ek güvenlik doğrulaması istedi; otomatik giriş durduruldu.',checkedAt};
   return {state:'failed',step,message:'myMSC şifre ekranı açılmadı.',checkedAt};}
  const userField=await page.$('input[type=email],input#signInName,input[name=signInName],input#email');
  if(userField){const value=await page.evaluate(e=>(e as HTMLInputElement).value,userField);if(!value){await userField.type(input.username,{delay:20});}}
  await password.type(input.password,{delay:20});
  step='submit';
  await Promise.all([
   page.waitForNavigation({waitUntil:'networkidle2',timeout:60000}).catch(()=>null),
   page.evaluate(()=>{const b=document.querySelector('button#next,button[type=submit],input[type=submit]') as HTMLElement|null;if(b)b.click();else (document.querySelector('form') as HTMLFormElement|null)?.requestSubmit();}),
  ]);
  for(let i=0;i<20&&!await loggedIn(page);i++)await new Promise(r=>setTimeout(r,1000));

  step='verify';
  const body=await text(page);
  if(!await loggedIn(page)){
   await snapshot(env,page,'after-submit');
   if(wrongPassword.test(body))return {state:'credentials',step,message:'myMSC kullanıcı adı veya şifreyi kabul etmedi.',checkedAt};
   if(challenge.test(body))return {state:'challenge',step,message:'myMSC ek güvenlik doğrulaması istedi; otomatik giriş durduruldu.',checkedAt};
   return {state:'failed',step,message:'myMSC girişi tamamlanmadı; oturum ekranına ulaşılamadı.',checkedAt};
  }
  await snapshot(env,page,'ready');
  const cookies=await page.cookies() as Cookie[];
  return {state:'ready',step,message:'myMSC oturumu sunucuda açıldı.',cookies,checkedAt};
 }catch(error){
  return {state:'failed',step,message:'myMSC bağlantısı tamamlanamadı: '+(error instanceof Error?error.name:'hata'),checkedAt};
 }finally{await browser.close().catch(()=>{});}
}

const worker={
 async fetch(request:Request,env:Env){
  const url=new URL(request.url);
  if(request.method!=='POST')return new Response('Not found',{status:404});
  let body:LoginInput;
  try{body=await request.json() as LoginInput;}catch{return Response.json({error:'Geçersiz istek.'},{status:400});}
  if(typeof body?.username!=='string'||typeof body?.password!=='string'||!body.username||!body.password)return Response.json({error:'Kullanıcı adı ve şifre gerekli.'},{status:400});
  if(url.pathname==='/msc/login')return Response.json(await mscLogin(env,body));
  return new Response('Not found',{status:404});
 },
};
export default worker;
