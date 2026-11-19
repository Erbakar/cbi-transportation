// myMSC sign-in on the platform gateway (VDS), same steps and answers as the
// Browser Rendering version in workers/carrier-browser.ts. It never submits anything
// and never works around portal checks: a captcha, code or block page stops the run.
import puppeteer from 'puppeteer-core';

const MSC='https://www.mymsc.com/myMSC/';
const WELCOME=MSC+'welcome';
const challenge=/captcha|verification code|doğrulama kodu|one[- ]time|we sent a code|verify (that )?you are human|access denied/i;
const wrongPassword=/(incorrect|invalid|wrong).{0,40}(password|credentials|e-?mail)|password is incorrect|şifre.{0,20}(hatalı|yanlış)/i;
export const MSC_RUN_LIMIT_MS=110000;

async function text(page){return (await page.evaluate(()=>document.body?.innerText||'').catch(()=>'')).slice(0,4000);}
async function clickText(page,pattern){
 return page.evaluate((source,flags)=>{const re=new RegExp(source,flags);const el=[...document.querySelectorAll('button,a,input[type=submit]')].find(e=>re.test(e.innerText||e.value||''));if(el){el.click();return true;}return false;},pattern.source,pattern.flags).catch(()=>false);
}
async function loggedIn(page){if(!/(^|\.)mymsc\.com$/i.test(new URL(page.url()).hostname))return false;const body=await text(page);return !/Sign In Email/i.test(body)&&/Welcome to your Dashboard|Log ?out|Sign ?out|Instant Quote/i.test(body);}

export function validMscInput(body){
 if(!body||typeof body.username!=='string'||typeof body.password!=='string'||!body.username||!body.password||body.username.length>256||body.password.length>1024)return false;
 if(body.cookies!==undefined&&(!Array.isArray(body.cookies)||body.cookies.length>200))return false;
 return true;
}
// Same cookies the Browser Rendering version accepted (they came from an earlier myMSC run); only the shape is checked.
function cookieInput(cookies){return (cookies||[]).filter(c=>c&&typeof c.name==='string'&&typeof c.value==='string'&&typeof c.domain==='string'&&c.domain.length<=253).map(({name,value,domain,path,expires,httpOnly,secure,sameSite})=>({name,value,domain,path:path||'/',expires,httpOnly,secure,...(sameSite?{sameSite}:{})}));}

async function run(input,progress,launch){
 const checkedAt=new Date().toISOString();
 const mark=name=>{progress.step=name;};
 mark('launch');
 let browser;
 try{browser=await launch();progress.browser=browser;}
 catch{return {state:'failed',step:'launch',message:'Sunucudaki tarayıcı başlatılamadı; birazdan yeniden deneyin.',checkedAt};}
 let step='open';mark(step);
 try{
  const page=await browser.newPage();
  page.setDefaultTimeout(20000);
  await page.setViewport({width:1366,height:900});
  const cookies=cookieInput(input.cookies);if(cookies.length)await page.setCookie(...cookies).catch(()=>{});
  const first=await page.goto(WELCOME,{waitUntil:'domcontentloaded',timeout:30000});
  if(first&&first.status()===403)return {state:'blocked',step,message:'myMSC sunucu tarayıcısını engelledi (HTTP 403).',checkedAt};
  await page.waitForFunction(()=>/Sign In Email|Welcome to your Dashboard|Instant Quote/i.test(document.body?.innerText||''),{timeout:25000}).catch(()=>null);
  if(await loggedIn(page))return {state:'ready',step:'session',message:'Kayıtlı myMSC oturumu geçerli.',cookies:await page.cookies(),checkedAt};

  step='cookies';mark(step);
  await clickText(page,/^\s*reject all\s*$/i);

  step='email';mark(step);
  const email=await page.waitForSelector('input[type=email],input[name*=mail i],input[id*=mail i]',{visible:true,timeout:15000}).catch(()=>null);
  if(!email)return {state:'failed',step,message:'myMSC giriş ekranında e-posta alanı bulunamadı.',checkedAt};
  await email.click({clickCount:3});await email.type(input.username,{delay:15});
  await clickText(page,/^\s*next\s*$/i);

  step='password';mark(step);
  const password=await page.waitForSelector('input[type=password]',{visible:true,timeout:30000}).catch(()=>null);
  if(!password){const body=await text(page);
   if(challenge.test(body))return {state:'challenge',step,message:'myMSC ek güvenlik doğrulaması istedi; otomatik giriş durduruldu.',checkedAt};
   return {state:'failed',step,message:'myMSC şifre ekranı açılmadı.',checkedAt};}
  const userField=await page.$('input#signInName,input[name=signInName],input#email,input[type=email]');
  if(userField){const value=await page.evaluate(e=>e.value,userField);if(!value)await userField.type(input.username,{delay:15});}
  await password.type(input.password,{delay:15});
  step='submit';mark(step);
  await page.evaluate(()=>{const b=document.querySelector('button#next,button[type=submit],input[type=submit]');if(b)b.click();else document.querySelector('form')?.requestSubmit();});

  step='verify';mark(step);
  const deadline=Date.now()+35000;let body='';
  while(Date.now()<deadline){
   await new Promise(r=>setTimeout(r,1500));
   if(await loggedIn(page))break;
   body=await text(page);
   if(wrongPassword.test(body)||challenge.test(body))break;
  }
  if(!await loggedIn(page)){
   if(wrongPassword.test(body))return {state:'credentials',step,message:'myMSC kullanıcı adı veya şifreyi kabul etmedi.',checkedAt};
   if(challenge.test(body))return {state:'challenge',step,message:'myMSC ek güvenlik doğrulaması istedi; otomatik giriş durduruldu.',checkedAt};
   return {state:'failed',step,message:'myMSC girişi tamamlanmadı; oturum ekranına ulaşılamadı.',checkedAt};
  }
  return {state:'ready',step,message:'myMSC oturumu sunucuda açıldı.',cookies:await page.cookies(),checkedAt};
 }catch(error){
  console.warn('MSC sign-in failed at step '+step+': '+(error instanceof Error?error.name:'unknown'));
  return {state:'failed',step,message:'myMSC bağlantısı tamamlanamadı ('+step+' adımı).',checkedAt};
 }finally{await browser.close().catch(()=>{});}
}

export function launchChrome(){
 return puppeteer.launch({executablePath:process.env.CHROME_EXECUTABLE_PATH||'/usr/bin/google-chrome-stable',headless:true,timeout:20000});
}

/** One myMSC sign-in with a hard time limit; the browser is closed on every path. */
export async function mscLogin(input,launch=launchChrome,limit=MSC_RUN_LIMIT_MS){
 const progress={step:'start'};let timer;
 const watchdog=new Promise(resolve=>{timer=setTimeout(()=>{
  void progress.browser?.close().catch(()=>{});
  resolve({state:'failed',step:progress.step,message:'Sunucudaki tarayıcı yanıt vermeyi kesti ('+progress.step+' adımı); birazdan yeniden deneyin.',checkedAt:new Date().toISOString()});
 },limit);});
 try{return await Promise.race([run(input,progress,launch),watchdog]);}
 finally{clearTimeout(timer);}
}
