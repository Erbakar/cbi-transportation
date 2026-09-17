import puppeteer from 'puppeteer-core';

export class DocumentError extends Error {constructor(message,status=502){super(message);this.status=status;}}
export function documentUrl(reference){if(typeof reference!=='string'||!/^\d{1,15}$/.test(reference))throw new DocumentError('Geçersiz INTTRA SI numarası.',400);return 'https://ship.inttra.e2open.com/siact/printSIview#/printPreview?id='+reference+'&locale=1&page=viewPrint';}
export function documentCookies(cookie){
 if(typeof cookie!=='string'||!cookie||cookie.length>65536||/[\r\n]/.test(cookie))throw new DocumentError('INTTRA oturumu geçersiz.',401);
 const entries=new Map();for(const part of cookie.split(';')){const i=part.indexOf('='),name=part.slice(0,i).trim();if(i<1||!/^[-\w]+$/.test(name))throw new DocumentError('INTTRA oturumu geçersiz.',401);entries.set(name,{name,value:part.slice(i+1).trim(),url:'https://ship.inttra.e2open.com',secure:true});}return [...entries.values()];
}
export function allowedPrintRequest(url,method){try{const u=new URL(url);return u.protocol==='data:'||u.protocol==='https:'&&u.hostname==='ship.inttra.e2open.com'&&(['GET','HEAD'].includes(method)||method==='POST'&&u.pathname==='/siact/view');}catch{return false;}}
export function verifyPrintedRecord(data,reference){const s=data?.ShipmentInstruction;if(String(s?.SiId)!==reference||!Array.isArray(s.Containers)||!s.Containers.length)throw new DocumentError('INTTRA belgesi bu SI kaydıyla eşleşmiyor.');return s;}

// Render INTTRA's own print view in an isolated, short-lived browser. No review,
// submit, amend, delete or arbitrary destination is allowed in this browser.
export async function renderInttraDocument({cookie,reference}){
 const url=documentUrl(reference),cookies=documentCookies(cookie);
 const executablePath=process.env.CHROME_EXECUTABLE_PATH||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium');
 let browser;
 try{
  browser=await puppeteer.launch({executablePath,headless:true,timeout:15000});const page=await browser.newPage();
  await page.setCookie(...cookies);await page.setRequestInterception(true);
  page.on('request',request=>{if(allowedPrintRequest(request.url(),request.method()))void request.continue();else void request.abort();});
  const viewResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/siact/view'&&r.request().method()==='POST',{timeout:45000});
  // Handle both promises together so navigation failure cannot leave an unhandled wait.
  const [,response]=await Promise.all([page.goto(url,{waitUntil:'domcontentloaded',timeout:45000}),viewResponse]);
  if([401,403].includes(response.status()))throw new DocumentError('INTTRA oturumu yenilenmeli.',401);
  if(!response.ok())throw new DocumentError('INTTRA belge bilgisi alınamadı.');
  const shipment=verifyPrintedRecord(await response.json(),reference);
  await page.waitForFunction((id,container)=>{const form=document.getElementById('printViewForm');return form&&getComputedStyle(form).visibility!=='hidden'&&form.innerText.includes(id)&&form.innerText.includes(container)&&!form.innerText.includes('{{');},{timeout:20000},reference,String(shipment.Containers[0].ContainerNumber));
  await page.evaluate(async()=>{await Promise.race([Promise.all([document.fonts.ready,...Array.from(document.images).map(image=>image.complete?Promise.resolve():new Promise(resolve=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true});}))]),new Promise(resolve=>setTimeout(resolve,5000))]);});
  const bytes=await page.pdf({format:'A4',printBackground:true,margin:{top:'12mm',bottom:'12mm',left:'10mm',right:'10mm'},timeout:20000});
  if(bytes.length<1000||bytes.length>20*1024*1024||Buffer.from(bytes.subarray(0,5)).toString()!=='%PDF-')throw new DocumentError('INTTRA PDF çıktısı doğrulanamadı.');
  return bytes;
 }catch(error){if(error instanceof DocumentError)throw error;throw new DocumentError('INTTRA PDF çıktısı hazırlanamadı. Bağlantıyı kontrol edip yeniden deneyin.');}
 finally{await browser?.close();}
}
