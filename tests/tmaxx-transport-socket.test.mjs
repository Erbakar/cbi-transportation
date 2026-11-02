import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import fs from 'node:fs';
import crypto from 'node:crypto';
import ts from 'typescript';
import {Miniflare} from 'miniflare';

test('real Worker sockets preserve a PDF-sized request and retain an early HTTP rejection',async()=>{
 let profile='accept',requests=0;const peers=new Set();
 const server=net.createServer(socket=>{
  peers.add(socket);socket.on('close',()=>peers.delete(socket));socket.on('error',()=>{});
  let chunks=[],length=0,expected,cut,done=false;
  socket.on('data',bytes=>{
   if(done)return;chunks.push(bytes);length+=bytes.length;let all=Buffer.concat(chunks);
   if(expected===undefined){cut=all.indexOf('\r\n\r\n');if(cut<0)return;expected=Number(all.subarray(0,cut).toString().match(/content-length:\s*(\d+)/i)?.[1]);requests++;}
   if(profile==='reject'){done=true;socket.end('HTTP/1.1 413 Payload Too Large\r\nContent-Length: 8\r\n\r\nrejected');socket.pause();setTimeout(()=>socket.destroy(),100);return;}
   if(profile==='reset'){done=true;socket.destroy();return;}
   if(length<cut+4+expected)return;done=true;
   const body=all.subarray(cut+4),response=JSON.stringify({bytes:body.length,hash:crypto.createHash('sha256').update(body).digest('hex')});
   socket.end('HTTP/1.1 200 OK\r\nContent-Length: '+Buffer.byteLength(response)+'\r\n\r\n'+response);
  });
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=server.address().port,origin='http://127.0.0.1:'+port;
 let source=fs.readFileSync('lib/server/tmaxx-transport.ts','utf8').replaceAll('http://95.216.243.19:8090',origin).replace('port:8090','port:'+port);
 source=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 source+=`\nexport default {async fetch(req){try{const r=await tmaxxRequest('${origin}/api/uploader/upload',{method:'POST',body:await req.arrayBuffer()});return Response.json({status:r.status,body:await r.text()});}catch(e){return Response.json({error:e.message,transport:e.transport});}}};`;
 const worker=new Miniflare({modules:true,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],script:source});
 const body=Buffer.alloc(2_270_778,173);
 try{
  for(profile of ['accept','reject','reset']){
   const before=requests,response=await worker.dispatchFetch('http://localhost',{method:'POST',body}),result=await response.json();assert.equal(requests,before+1);
   if(profile==='accept'){assert.equal(result.status,200);assert.deepEqual(JSON.parse(result.body),{bytes:body.length,hash:crypto.createHash('sha256').update(body).digest('hex')});}
   if(profile==='reject'){assert.equal(result.status,413);assert.equal(result.body,'rejected');}
   if(profile==='reset'){assert.match(result.error,/Network connection lost/);assert.equal(result.transport.stage,'write-request');assert.ok(result.transport.writtenBytes<result.transport.requestBytes);assert.equal(result.transport.responseBytes,0);}
  }
 }finally{for(const peer of peers)peer.destroy();server.close();await worker.dispose();}
});
