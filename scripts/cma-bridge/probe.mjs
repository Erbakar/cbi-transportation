import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import puppeteer from 'puppeteer-core';

// Diagnostic only: no credentials, shared Chrome profile, job claims or VGM writes.
export function proxyAddress(value){
 if(!value)return undefined;
 let url;try{url=new URL(value);}catch{throw Error('Geçerli bir şirket proxy adresi gerekli.');}
 if(!['http:','https:','socks5:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'&&url.pathname!==''||url.search||url.hash)throw Error('Proxy adresi yalnız protokol, sunucu ve port içermeli; kullanıcı bilgisi içermemeli.');
 return url.protocol+'//'+url.host;
}
export function probeState(status,url,loginVisible,challenge){
 let parsed;try{parsed=new URL(url);}catch{return 'unexpected_origin';}
 if(!['https://www.cma-cgm.com','https://auth.cma-cgm.com'].includes(parsed.origin))return 'unexpected_origin';
 if([403,429].includes(status)||challenge)return 'access_blocked';
 if(status>=400)return 'service_error';
 if(parsed.origin==='https://auth.cma-cgm.com'&&loginVisible)return 'login_available';
 return 'unverified';
}
export async function probe({proxy,executablePath=process.env.CHROME_EXECUTABLE_PATH||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium')}={}){
 const server=proxyAddress(proxy),profile=await fs.mkdtemp(path.join(os.tmpdir(),'cbi-cma-probe-'));let browser;
 try{
  browser=await puppeteer.launch({executablePath,headless:true,userDataDir:profile,timeout:15000,args:server?['--proxy-server='+server]:[]});
  const page=await browser.newPage();
  // Only navigate to CMA; never fill a login form or send a business document.
  const response=await page.goto('https://www.cma-cgm.com/ebusiness/account/edit',{waitUntil:'domcontentloaded',timeout:30000});
  const details=await page.evaluate(()=>({login:!!document.querySelector('input[type=password]'),challenge:!!document.querySelector('iframe[src*="captcha"],input[autocomplete="one-time-code"]')||/verify you are human|access denied|unusual traffic|enable javascript and cookies to continue/i.test(document.body?.innerText||'')}));
  const url=new URL(page.url());
  return {checkedAt:new Date().toISOString(),mode:server?'company-proxy':'direct',state:probeState(response?.status()||0,url.href,details.login,details.challenge),httpStatus:response?.status()||null,origin:url.origin,path:url.pathname,authenticated:false,submitted:false};
 }catch{return {checkedAt:new Date().toISOString(),mode:server?'company-proxy':'direct',state:'connection_failed',authenticated:false,submitted:false};}
 finally{await browser?.close();await fs.rm(profile,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log(JSON.stringify(await probe({proxy:process.env.CMA_PROXY_URL})));}catch{console.error('CMA bağlantı kontrolü başlatılamadı; proxy yapılandırmasını kontrol edin.');process.exitCode=1;}
}
