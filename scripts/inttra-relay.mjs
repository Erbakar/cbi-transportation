import http from 'node:http';
import fs from 'node:fs';
import {timingSafeEqual} from 'node:crypto';
const key=fs.readFileSync(process.env.RELAY_KEY_FILE||'.private/inttra-relay/key','utf8').trim();
if(!/^[a-f0-9]{64}$/.test(key))throw Error('Relay key required');
let active=0;
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 const supplied=Buffer.from(req.headers.authorization||'');const expected=Buffer.from('Bearer '+key);
 if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){res.writeHead(401);res.end();return}
 if(req.method!=='POST'||req.url!=='/auth'){res.writeHead(404);res.end();return}
 if(active>=3){res.writeHead(429);res.end();return}active++;
 try{
  let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>16384){res.writeHead(413);res.end();return}chunks.push(chunk)}
  let payload;try{payload=JSON.parse(Buffer.concat(chunks).toString())}catch{res.writeHead(400);res.end();return}
  if(!payload||typeof payload.username!=='string'||typeof payload.password!=='string'){res.writeHead(400);res.end();return}
  const r=await fetch('https://api.inttra.e2open.com/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),redirect:'manual',signal:AbortSignal.timeout(25000)});
  if(!r.ok){res.writeHead(r.status,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'INTTRA authentication rejected'}));return}
  if(!r.headers.get('content-type')?.includes('json'))throw Error('Invalid response');
  const data=await r.json();res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));
 }catch{if(!res.headersSent)res.writeHead(502);res.end()}
 finally{active--}
});
server.requestTimeout=30000;server.headersTimeout=10000;
server.listen(18744,'127.0.0.1',()=>console.log('INTTRA relay ready on loopback'));
