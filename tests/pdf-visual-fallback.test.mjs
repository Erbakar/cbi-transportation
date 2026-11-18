import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleAt,AppError} from './helpers/prealert-upload-fixture.mjs';

// Where PDF page images come from: the connection server while it answers, otherwise the Cloudflare browser.
const page=n=>({page:n,mime:'image/jpeg',data:'/9j/'+n});
const ok=(n=1)=>({ok:true,status:200,json:async()=>({pageCount:n,pages:Array.from({length:n},(_,i)=>page(i+1))})});
const status=s=>({ok:false,status:s,json:async()=>({error:'x'})});
function load({relay,browser,env={INTTRA_RELAY_URL:'https://relay.test',INTTRA_RELAY_KEY:'k'},service=true}){
 const calls=[];
 const fetch=async()=>{calls.push('relay');if(relay instanceof Error)throw relay;return relay;};
 const CARRIER_BROWSER=service?{fetch:async(url)=>{calls.push('browser:'+new URL(url).pathname);if(browser instanceof Error)throw browser;return browser;}}:undefined;
 const api=moduleAt('lib/server/pdf-visual-pages.ts',{AppError,runtime:()=>({...env,CARRIER_BROWSER}),fetch,console:{warn(){}}},'pdfVisualPages');
 return {calls,run:()=>api.pdfVisualPages(new ArrayBuffer(8))};
}
test('the connection server renders while it answers; the browser is not used',async()=>{
 const s=load({relay:ok(2),browser:ok()});assert.equal((await s.run()).length,2);assert.deepEqual(s.calls,['relay']);
});
for(const [name,relay] of [['unreachable',new TypeError('fetch failed')],['tunnel gone (530)',status(530)],['busy (429)',status(429)],['server error (502)',status(502)]])
 test(`connection server ${name}: the Cloudflare browser renders the pages`,async()=>{
  const s=load({relay,browser:ok(3)});assert.equal((await s.run()).length,3);assert.deepEqual(s.calls,['relay','browser:/pdf-pages']);
 });
test('no connection server configured: only the Cloudflare browser is used',async()=>{
 const s=load({env:{},browser:ok()});assert.equal((await s.run()).length,1);assert.deepEqual(s.calls,['browser:/pdf-pages']);
});
test('a PDF the renderer rejects (password, too large) is not sent a second time',async()=>{
 for(const code of [413,422]){const s=load({relay:status(code),browser:ok()});await assert.rejects(s.run(),e=>e.status===422);assert.deepEqual(s.calls,['relay']);}
});
test('incomplete page images from either renderer stop the reading',async()=>{
 const bad={ok:true,status:200,json:async()=>({pageCount:2,pages:[page(1)]})};
 await assert.rejects(load({env:{},browser:bad}).run(),/eksik veya geçersiz/);
 const s=load({relay:status(530),browser:status(502)});await assert.rejects(s.run(),/HTTP 502/);
});
