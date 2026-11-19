import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import http from 'node:http';import net from 'node:net';import ts from 'typescript';
import {handleTmaxx,tmaxxTarget} from '../scripts/gateway-tmaxx.mjs';
import {mscLogin,validMscInput} from '../scripts/gateway-msc.mjs';

const uri=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64');

// ---- Gateway side: /tmaxx pass-through -------------------------------------------------
test('gateway forwards method, path, headers and binary body to the fixed ERP origin and marks the answer',async()=>{
 let seen;const erp=http.createServer((req,res)=>{const chunks=[];req.on('data',c=>chunks.push(c)).on('end',()=>{seen={method:req.method,url:req.url,headers:req.headers,body:Buffer.concat(chunks)};res.writeHead(201,{'Content-Type':'application/json','X-Internal':'hidden'});res.end('{"ok":1}');});});
 const erpPort=await listen(erp);
 const gw=http.createServer((req,res)=>void handleTmaxx(req,res,{hostname:'127.0.0.1',port:erpPort}));const gwPort=await listen(gw);
 try{
  const body=Buffer.from([0,255,128,10,13]);
  const r=await fetch(`http://127.0.0.1:${gwPort}/tmaxx`,{method:'POST',headers:{'X-Tmaxx-Method':'post','X-Tmaxx-Path':'/api//document/x?a=1','X-Tmaxx-Headers':b64({Authorization:'Bearer t','Content-Type':'multipart/form-data; boundary=z',Host:'evil.example','Accept-Encoding':'gzip'})},body});
  assert.equal(r.status,201);assert.equal(r.headers.get('x-cbi-gateway'),'tmaxx');assert.equal(r.headers.get('x-internal'),null);assert.equal(await r.text(),'{"ok":1}');
  assert.equal(seen.method,'POST');assert.equal(seen.url,'/api//document/x?a=1');assert.equal(seen.headers.authorization,'Bearer t');assert.equal(seen.headers.host,'127.0.0.1:'+erpPort);assert.equal(seen.headers['accept-encoding'],'identity');assert.deepEqual(seen.body,body);
 }finally{gw.close();erp.close();}
});
test('gateway rejects unsafe descriptions before contacting the ERP',()=>{
 for(const headers of [{'x-tmaxx-method':'CONNECT','x-tmaxx-path':'/a'},{'x-tmaxx-method':'GET','x-tmaxx-path':'http://evil/'},{'x-tmaxx-method':'GET','x-tmaxx-path':'/a b'},{'x-tmaxx-method':'GET','x-tmaxx-path':'/a','x-tmaxx-headers':b64({'X-A':'1\r\nInjected: 1'})},{'x-tmaxx-method':'GET','x-tmaxx-path':'/a','x-tmaxx-headers':'%%%'}])
  assert.throws(()=>tmaxxTarget(headers),e=>e.status===400&&e.forwarded===false);
 assert.equal(tmaxxTarget({'x-tmaxx-method':'POST','x-tmaxx-path':'/api/uploader/upload'}).timeout,40000);
});
test('an unreachable ERP is reported as not forwarded; a reset after connecting as maybe forwarded',async()=>{
 const closed=net.createServer();const closedPort=await listen(closed);closed.close();
 const reset=net.createServer(socket=>socket.destroy());const resetPort=await listen(reset);
 const results=[];
 for(const port of [closedPort,resetPort]){
  const gw=http.createServer((req,res)=>void handleTmaxx(req,res,{hostname:'127.0.0.1',port}));const gwPort=await listen(gw);
  try{const r=await fetch(`http://127.0.0.1:${gwPort}/tmaxx`,{method:'POST',headers:{'X-Tmaxx-Method':'POST','X-Tmaxx-Path':'/api/x'},body:'{}'});results.push([r.status,r.headers.get('x-cbi-gateway'),r.headers.get('x-cbi-forwarded')]);}finally{gw.close();}
 }
 reset.close();
 assert.deepEqual(results,[[502,'tmaxx-error','no'],[502,'tmaxx-error','maybe']]);
});

// ---- App side: tmaxxRequest through the gateway ------------------------------------------
let socketUsed=0;
globalThis.__gwSocket=()=>{socketUsed++;let c;return {opened:Promise.resolve(),closed:Promise.resolve(),close:async()=>{try{c.close();}catch{}},writable:new WritableStream({write(){}}),readable:new ReadableStream({start(x){c=x;x.enqueue(Buffer.from('HTTP/1.1 200 OK\r\nContent-Length: 6\r\n\r\ndirect'));x.close();}})};};
const transport=fs.readFileSync('lib/server/tmaxx-transport.ts','utf8')
 .replace("import {connect} from 'cloudflare:sockets';",'const connect=globalThis.__gwSocket;')
 .replace("import {platformGateway,type PlatformGateway} from './platform-gateway';",'const platformGateway=()=>globalThis.__tmaxxGateway||null;type PlatformGateway=any;');
const {tmaxxRequest}=await import(uri(transport));
async function viaGateway(answer,method='POST'){
 socketUsed=0;const calls=[];const original=globalThis.fetch;
 globalThis.__tmaxxGateway={url:new URL('https://relay.example'),key:'k'};
 globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});if(answer instanceof Error)throw answer;return answer();};
 try{const r=await tmaxxRequest('http://95.216.243.19:8090/api/x?y=1',{method,headers:{Authorization:'Bearer s'},body:method==='GET'?undefined:'{"a":1}'});return {status:r.status,text:await r.text(),calls,socketUsed};}
 catch(error){return {error:error.message,calls,socketUsed};}
 finally{globalThis.fetch=original;delete globalThis.__tmaxxGateway;}
}
test('a T-MAXX answer from the gateway is returned without opening the direct socket',async()=>{
 const r=await viaGateway(()=>new Response('{"ok":true}',{status:200,headers:{'Content-Type':'application/json','X-CBI-Gateway':'tmaxx'}}));
 assert.equal(r.status,200);assert.equal(r.text,'{"ok":true}');assert.equal(r.socketUsed,0);
 const h=r.calls[0].init.headers;assert.equal(r.calls[0].url,'https://relay.example/tmaxx');assert.equal(h.Authorization,'Bearer k');assert.equal(h['X-Tmaxx-Method'],'POST');assert.equal(h['X-Tmaxx-Path'],'/api/x?y=1');
 assert.equal(JSON.parse(Buffer.from(h['X-Tmaxx-Headers'],'base64')).authorization,'Bearer s');
});
test('when the gateway did not forward (tunnel down, busy, ERP unreachable) the direct socket is used',async()=>{
 for(const answer of [()=>new Response('Error 1033',{status:530}),()=>new Response(null,{status:429}),()=>new Response('{}',{status:502,headers:{'X-CBI-Gateway':'tmaxx-error','X-CBI-Forwarded':'no'}})]){
  const r=await viaGateway(answer);assert.equal(r.status,200);assert.equal(r.text,'direct');assert.equal(r.socketUsed,1);
 }
});
test('a write whose outcome is unknown is never resent; a read may be',async()=>{
 const maybe=()=>new Response('{}',{status:502,headers:{'X-CBI-Gateway':'tmaxx-error','X-CBI-Forwarded':'maybe'}});
 let r=await viaGateway(maybe);assert.match(r.error,/outcome unknown/);assert.equal(r.socketUsed,0);
 r=await viaGateway(Object.assign(new Error('timeout'),{name:'TimeoutError'}));assert.match(r.error,/outcome unknown/);assert.equal(r.socketUsed,0);
 r=await viaGateway(maybe,'GET');assert.equal(r.text,'direct');assert.equal(r.socketUsed,1);
 r=await viaGateway(new Error('network'),'GET');assert.equal(r.text,'direct');assert.equal(r.socketUsed,1);
});

// ---- App side: MSC sign-in through the gateway ----------------------------------------------
const msc=fs.readFileSync('lib/server/msc-connection.ts','utf8')
 .replace("import {AppError,db,runtime} from './runtime';",'class AppError extends Error{constructor(m,s){super(m);this.status=s}};const db=()=>globalThis.__gwDB;const runtime=()=>globalThis.__gwEnv;')
 .replace("import {readCredentials} from './platforms';",'const readCredentials=async()=>({username:"ops@example.com",password:"secret"});')
 .replace("import {platformGateway} from './platform-gateway';",'const platformGateway=()=>({url:new URL("https://relay.example"),key:"k"});');
const {mscSession}=await import(uri(msc));
async function mscRun(answer){
 const browser=[];const original=globalThis.fetch;
 globalThis.__gwEnv={ENCRYPTION_KEY:'a'.repeat(64),CARRIER_BROWSER:{fetch:async()=>{browser.push(1);return Response.json({state:'failed',message:'cf',step:'open',checkedAt:'t'});}}};
 globalThis.__gwDB={prepare(){return {bind(){return {first:async()=>null,run:async()=>({meta:{changes:1}})};}};}};
 globalThis.fetch=async()=>answer();
 try{const s=await mscSession('o',true);return {message:s.message,browser:browser.length};}catch(e){return {error:e.status,browser:browser.length};}
 finally{globalThis.fetch=original;}
}
test('myMSC signs in on the gateway; Cloudflare browser only when the gateway did not take the run',async()=>{
 assert.deepEqual(await mscRun(()=>Response.json({state:'failed',message:'gw',step:'email',checkedAt:'t'},{headers:{'X-CBI-Gateway':'msc'}})),{message:'gw',browser:0});
 assert.deepEqual(await mscRun(()=>new Response(null,{status:429})),{message:'cf',browser:1});
 assert.deepEqual(await mscRun(()=>new Response('x',{status:530})),{message:'cf',browser:1});
 assert.deepEqual(await mscRun(()=>new Response('x',{status:524})),{error:504,browser:0});
 assert.deepEqual(await mscRun(()=>{throw Object.assign(new Error('t'),{name:'TimeoutError'});}),{error:504,browser:0});
});

// ---- Gateway side: myMSC input and limits ----------------------------------------------------
test('gateway myMSC run validates input, reports a failed launch and stops at its time limit',async()=>{
 assert.equal(validMscInput({username:'a',password:'b'}),true);
 assert.equal(validMscInput({username:'a',password:''}),false);
 assert.equal(validMscInput({username:'a',password:'b',cookies:'x'}),false);
 const failed=await mscLogin({username:'a',password:'b'},async()=>{throw new Error('no chrome');});assert.equal(failed.state,'failed');assert.equal(failed.step,'launch');
 let closed=false;const hung={newPage:()=>new Promise(()=>{}),close:async()=>{closed=true;}};
 const slow=await mscLogin({username:'a',password:'b'},async()=>hung,50);assert.equal(slow.state,'failed');assert.equal(slow.step,'open');assert.equal(closed,true);
});

// ---- Gateway request log ------------------------------------------------------------------
test('gateway log lines name the endpoint, never keys, cookies, bodies or query strings',async()=>{
 const {requestLogLine}=await import('../scripts/gateway-log.mjs');
 assert.equal(requestLogLine({method:'POST',url:'/tmaxx',headers:{authorization:'Bearer secret','x-tmaxx-method':'post','x-tmaxx-path':'/api/login?token=abc','x-tmaxx-headers':'c2VjcmV0'}},200,12),'POST /tmaxx POST /api/login 200 12ms');
 assert.equal(requestLogLine({method:'POST',url:'/auth',headers:{authorization:'Bearer secret'}},401,3,false),'POST /auth 401 aborted 3ms');
 assert.equal(requestLogLine({method:'GET',url:'/?x=secret',headers:{}},404,1),'GET other 404 1ms');
});
