import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
let written,socketFactory,writes=[];
globalThis.__binarySocket=(...args)=>socketFactory(...args);
const source=fs.readFileSync('lib/server/tmaxx-transport.ts','utf8').replace("import {connect} from 'cloudflare:sockets';",'const connect=globalThis.__binarySocket;');
const {tmaxxRequest}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
function socket(response,delay=0){let controller,closed=false;return {opened:Promise.resolve(),closed:Promise.resolve(),close:async()=>{if(!closed){closed=true;controller.close();}},writable:new WritableStream({write(bytes){writes.push(bytes);written=Buffer.concat(writes);}}),readable:new ReadableStream({start(c){controller=c;const send=()=>{if(!closed){c.enqueue(Buffer.from(response));closed=true;c.close();}};if(delay)setTimeout(send,delay);else if(response)send();}})};}
test('ERP multipart binary bytes and content length are preserved without UTF8 conversion',async()=>{
 writes=[];socketFactory=()=>socket('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}');
 const bytes=new Uint8Array([0,255,128,65,10]);const r=await tmaxxRequest('http://95.216.243.19:8090/api/uploader/upload',{method:'POST',headers:{'Content-Type':'multipart/form-data; boundary=test'},body:bytes.buffer});
 const cut=written.indexOf('\r\n\r\n');assert.deepEqual(written.subarray(cut+4),Buffer.from(bytes));assert.match(written.subarray(0,cut).toString(),/content-length: 5/i);assert.equal(r.status,200);
});
test('archive receives the server MongoDB error after 30 seconds instead of losing it at 25 seconds',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const body='MongoSocketOpenException 127.0.0.1:27017 Connection refused';socketFactory=()=>socket(`HTTP/1.1 400 Bad Request\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,30000);
 const pending=tmaxxRequest('http://95.216.243.19:8090/api/uploader/upload',{method:'POST'});t.mock.timers.tick(30000);const r=await pending;assert.equal(r.status,400);assert.equal(await r.text(),body);
});
test('ordinary requests keep their deadline and a silent archive still has a bounded timeout',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});socketFactory=()=>socket('');
 for(const [path,deadline] of [['/api//sea/seaPosition/1',25000],['/api/uploader/getByID/abc',40000]]){const pending=tmaxxRequest('http://95.216.243.19:8090'+path,{method:'GET'});const rejection=assert.rejects(pending,/timed out/);t.mock.timers.tick(deadline);await rejection;}
});

test('large binary requests survive a streaming sink and retain the exact declared body length',async()=>{writes=[];socketFactory=()=>socket('HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}');const body=Buffer.alloc(2_270_778);for(let i=0;i<body.length;i++)body[i]=i%256;const r=await tmaxxRequest('http://95.216.243.19:8090/api/uploader/upload',{method:'POST',body});assert.equal(r.status,200);assert.ok(writes.length>1);const split=written.indexOf('\r\n\r\n');assert.deepEqual(written.subarray(split+4),body);assert.match(written.subarray(0,split).toString(),/content-length: 2270778/i);});


test('archive accepts the base64 response for the maximum supported 10 MiB PDF',async()=>{
 const pdf=Buffer.alloc(10*1024*1024,91),encoded=pdf.toString('base64');
 for(const [path,payload] of [['/api/uploader/upload',{res:{uid:'archive-10mb',file:encoded}}],['/api/uploader/getByID/archive-10mb',{obj:{file:{data:encoded}}}]]){
  writes=[];const body=JSON.stringify(payload);socketFactory=()=>socket(`HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  const r=await tmaxxRequest('http://95.216.243.19:8090'+path,{method:'GET'}),data=await r.json();assert.deepEqual(Buffer.from(data.res?.file||data.obj.file.data,'base64'),pdf);
 }
});
test('ordinary responses keep the 8 MiB limit and archive responses remain bounded',async()=>{
 for(const [path,size] of [['/api//sea/seaPosition/1',8*1024*1024+1],['/api/uploader/getList',8*1024*1024+1],['/api/uploader/getByID/abc',16*1024*1024+1]]){
  writes=[];socketFactory=()=>socket('HTTP/1.1 200 OK\r\n\r\n'+'x'.repeat(size));await assert.rejects(tmaxxRequest('http://95.216.243.19:8090'+path,{method:'GET'}),/ERP response too large/);
 }
});

test('a complete early rejection survives a failed write, with no request replay',async()=>{
 let controller,closed=false,calls=0,written=0;
 socketFactory=()=>{calls++;return {opened:Promise.resolve(),closed:Promise.resolve(),close:async()=>{if(!closed){closed=true;controller.close();}},readable:new ReadableStream({start(c){controller=c;}}),writable:new WritableStream({write(bytes){written+=bytes.length;controller.enqueue(Buffer.from('HTTP/1.1 413 Payload Too Large\r\nContent-Length: 8\r\n\r\nrejected'));throw Error('Network connection lost.');}})};};
 const trace={},r=await tmaxxRequest('http://95.216.243.19:8090/api/uploader/upload',{method:'POST',body:Buffer.alloc(2_270_778)},trace);
 assert.equal(r.status,413);assert.equal(await r.text(),'rejected');assert.equal(calls,1);assert.ok(written<2_270_778);assert.equal(trace.status,413);assert.equal(trace.stage,'complete');
});
test('response framing works across packets and informational responses without waiting for EOF',async()=>{
 for(const framing of ['Content-Length: 5\r\n\r\nhello','Transfer-Encoding: chunked\r\n\r\n2;ext=yes\r\nhe\r\n3\r\nllo\r\n0\r\nTrace: ignored\r\n\r\n']){
  const response='HTTP/1.1 100 Continue\r\n\r\nHTTP/1.1 200 OK\r\n'+framing;let c,closed=false;
  socketFactory=()=>({opened:Promise.resolve(),closed:Promise.resolve(),close:async()=>{if(!closed){closed=true;c.close();}},writable:new WritableStream({write(){}}),readable:new ReadableStream({start(controller){c=controller;for(const byte of Buffer.from(response))c.enqueue(new Uint8Array([byte]));}})});
  const r=await tmaxxRequest('http://95.216.243.19:8090/api/uploader/upload',{method:'POST'});assert.equal(r.status,200);assert.equal(await r.text(),'hello');assert.equal(closed,true);
 }
});
test('truncated or malformed replies remain uncertain instead of becoming a retryable rejection',async()=>{
 for(const response of ['HTTP/1.1 400 Bad Request\r\nContent-Length: 20\r\n\r\nshort','HTTP/1.1 400 Bad Request\r\nTransfer-Encoding: chunked\r\n\r\n2\r\nOK\r\n0\r\n','HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\nzz\r\n']){
  socketFactory=()=>socket(response);await assert.rejects(tmaxxRequest('http://95.216.243.19:8090/api/uploader/upload',{method:'POST'}),e=>{assert.match(e.message,/Incomplete ERP|Invalid ERP/);assert.equal(e.transport.stage,'read-response');assert.ok(e.transport.responseBytes>0);return true;});
 }
});
test('connection failures record the stage without recording request headers or PDF bytes',async()=>{
 socketFactory=()=>{throw Error('connection refused');};await assert.rejects(tmaxxRequest('http://95.216.243.19:8090/api/uploader/upload',{method:'POST',headers:{Authorization:'Bearer private-value'},body:'private-pdf'}),e=>{assert.equal(e.transport.stage,'connect');assert.equal(e.transport.writtenBytes,0);assert.doesNotMatch(JSON.stringify(e.transport),/private-value|private-pdf/);return true;});
});
