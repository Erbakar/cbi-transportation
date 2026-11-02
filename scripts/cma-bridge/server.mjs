import http from 'node:http';
import fs from 'node:fs';
import {timingSafeEqual,randomUUID} from 'node:crypto';
import {cleanSnapshot,browserStatus} from './protocol.mjs';
const config=JSON.parse(fs.readFileSync(new URL('../../.private/cma-browser/config.json',import.meta.url),'utf8'));
if(!/^[a-f0-9]{64}$/.test(config.key)||!/^[a-p]{32}$/.test(config.extensionId))throw Error('Invalid local bridge configuration');
let pending=null,last=null,heartbeat=0;
function finish(status,value){if(!pending)return;clearTimeout(pending.timer);const {clients}=pending;pending=null;for(const res of clients)if(!res.destroyed){res.writeHead(status);res.end(JSON.stringify(value));}}
const server=http.createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
 const supplied=Buffer.from(req.headers.authorization||''),expected=Buffer.from('Bearer '+config.key);
 if(req.headers.host!=='127.0.0.1:18745'||supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){res.writeHead(401);res.end('{}');return;}
 const origin=req.headers.origin;
 if(origin&&origin!=='chrome-extension://'+config.extensionId){res.writeHead(403);res.end('{}');return;}
 const reply=(status,value)=>{res.writeHead(status);res.end(JSON.stringify(value));};
 try{
  if(req.method==='GET'&&req.url==='/status')return reply(200,browserStatus(last,heartbeat));
  if(req.method==='GET'&&req.url==='/next'){
   heartbeat=Date.now();if(!pending||pending.leased)return reply(200,{job:null});pending.leased=true;
   return reply(200,{job:{id:pending.id,action:'read-vgm-dashboard'}});
  }
  if(req.method==='POST'&&req.url==='/read'){
   if(last&&Date.now()-last.observedAt<60000&&browserStatus(last,heartbeat).connected)return reply(200,{...browserStatus(last,heartbeat),...last.snapshot,scope:last.snapshot.complete?'all_pages':'partial_pages',accountVerified:false});
   if(pending){const job=pending;job.clients.add(res);res.on('close',()=>job.clients.delete(res));return;}
   if(!browserStatus(last,heartbeat).extensionOnline)return reply(503,{error:'CMA tarayıcı eklentisi bağlı değil. Chrome’da yerel eklentiyi etkinleştirin.'});
   const id=randomUUID();pending={id,clients:new Set([res]),leased:false,timer:setTimeout(()=>finish(504,{error:'Tarayıcı yanıt vermedi. CMA oturumunu kontrol edin.'}),55000)};
   res.on('close',()=>{if(pending?.id===id)pending.clients.delete(res);});return;
  }
  if(req.method==='POST'&&req.url==='/result'){
   let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>2500000)return reply(413,{});chunks.push(chunk);}
   const data=JSON.parse(Buffer.concat(chunks));
   if(!pending||!pending.leased||data.id!==pending.id)return reply(409,{});
   const snapshot=cleanSnapshot(data.snapshot);heartbeat=Date.now();last={snapshot,observedAt:Date.now()};
   finish(200,{...browserStatus(last,heartbeat),...snapshot,scope:snapshot.complete?'all_pages':'partial_pages',accountVerified:false});return reply(200,{ok:true});
  }
  return reply(404,{});
 }catch{return reply(400,{error:'Tarayıcı yanıtı doğrulanamadı.'});}
});
server.requestTimeout=60000;server.headersTimeout=10000;
server.listen(18745,'127.0.0.1',()=>console.log('CMA browser bridge ready on loopback. Read-only; no submission endpoint.'));
function stop(){finish(503,{error:'Yerel bağlantı kapatıldı.'});server.close();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
