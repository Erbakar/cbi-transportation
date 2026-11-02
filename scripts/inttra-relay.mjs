import {readInttraHistory} from './inttra-history.mjs';
import {checkInttraBooking} from './inttra-booking-check.mjs';
import {renderPdfPages,PdfPagesError} from './pdf-pages.mjs';
import {readInttraVgmMenu} from './inttra-vgm.mjs';
import {startInttraSession} from './inttra-session.mjs';
import {renderInttraDocument,DocumentError} from './inttra-document.mjs';
import http from 'node:http';
import {readInttraResponse} from './inttra-response.mjs';
import fs from 'node:fs';
import {timingSafeEqual} from 'node:crypto';
const key=fs.readFileSync(process.env.RELAY_KEY_FILE||'.private/inttra-relay/key','utf8').trim();
if(!/^[a-f0-9]{64}$/.test(key))throw Error('Relay key required');
const paths=new Set(['/siact/createPageParams','/siact/userParams','/siact/geographySi','/siact/checkDuplicateSIName','/siact/review','/siact/submit','/siact/saveDocument']);
let active=0,documentBusy=false,pdfBusy=false;
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 const supplied=Buffer.from(req.headers.authorization||'');const expected=Buffer.from('Bearer '+key);
 if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){console.warn('Relay shared-key authorization rejected.');res.writeHead(401);res.end();return}
 if(req.method==='POST' && req.url==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true}));return}
 if(req.method!=='POST'||!['/auth','/request','/document','/vgm-access','/history','/pdf-pages','/booking-check'].includes(req.url)){res.writeHead(404);res.end();return}
 if(active>=3){res.writeHead(429);res.end();return}active++;
 try{
  let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>(req.url==='/pdf-pages'?30*1024*1024:req.url==='/auth'?16384:2*1024*1024)){res.writeHead(413);res.end();return}chunks.push(chunk)}
  if(req.url==='/pdf-pages'){
   if(pdfBusy){res.writeHead(429);res.end();return;}pdfBusy=true;
   try{const pages=await renderPdfPages(Buffer.concat(chunks));res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(pages));}finally{pdfBusy=false;}return;
  }
  let payload;try{payload=JSON.parse(Buffer.concat(chunks).toString())}catch{res.writeHead(400);res.end();return}
  let r;
  if(req.url==='/auth'){
   if(!payload||typeof payload.username!=='string'||typeof payload.password!=='string'){res.writeHead(400);res.end();return}
   r=await fetch('https://api.inttra.e2open.com/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),redirect:'manual',signal:AbortSignal.timeout(25000)});
   if(!r.ok){console.warn('INTTRA upstream login rejected: HTTP '+r.status);res.writeHead(r.status,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'INTTRA authentication rejected'}));return}
   const data=await r.json();const web=await startInttraSession(data);data.webCookie=web.cookie;res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));return;
  }
  if(req.url==='/history'){const data=await readInttraHistory(payload||{});res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));return;}
  if(req.url==='/booking-check'){const data=await checkInttraBooking(payload);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));return;}
  if(req.url==='/vgm-access'){const items=await readInttraVgmMenu(payload?.cookie);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(items));return;}
  if(req.url==='/document'){
   if(documentBusy){res.writeHead(429);res.end();return;}documentBusy=true;
   try{const pdf=await renderInttraDocument(payload||{});res.writeHead(200,{'Content-Type':'application/pdf','Content-Length':pdf.length});res.end(pdf);}finally{documentBusy=false;}return;
  }
  if((!paths.has(payload?.path)&&!/^\/siact\/(?:view\?siId=\d{1,15}&searchOrViewFlag=view|amend\?siId=\d{1,15}&originalSiId=\d{1,15})$/.test(payload?.path||''))||typeof payload.cookie!=='string'||!payload.cookie||/[\r\n]/.test(payload.cookie)||typeof payload.body!=='string'){res.writeHead(400);res.end();return}
  r=await fetch('https://ship.inttra.e2open.com'+payload.path,{method:'POST',headers:{Cookie:payload.cookie,'Content-Type':'application/json;charset=UTF-8',Origin:'https://ship.inttra.e2open.com',Referer:'https://ship.inttra.e2open.com/siact/create'},body:payload.body,redirect:'manual',signal:AbortSignal.timeout(25000)});
  if(r.status>=300&&r.status<400){res.writeHead(502);res.end();return}
  const data=await readInttraResponse(r,payload.path);res.writeHead(r.status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));
 }catch(error){const known=error instanceof DocumentError||error instanceof PdfPagesError;if(!res.headersSent)res.writeHead(known?error.status:502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:known?error.message:'INTTRA bağlantısı tamamlanamadı.'}))}
 finally{active--}
});
server.requestTimeout=60000;server.headersTimeout=10000;
server.listen(18744,'127.0.0.1',()=>console.log('INTTRA relay ready on loopback'));
