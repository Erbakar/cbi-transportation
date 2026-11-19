import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleAt} from './helpers/prealert-upload-fixture.mjs';

// Gemini calls repeat temporary failures (overload, rate limit, dropped connection) and nothing else.
function load(answers){
 const calls=[],waits=[];
 const fetch=async()=>{calls.push(1);const a=answers.shift();if(a instanceof Error)throw a;return new Response('{}',{status:a.status,headers:a.headers||{}});};
 const api=moduleAt('lib/server/gemini.ts',{fetch,setTimeout,console:{warn(){}}},'geminiFetch,retryDelay');
 return {calls,waits,call:(init={})=>api.geminiFetch('https://gemini.test',{method:'POST',body:'{}',...init},{sleep:async ms=>{waits.push(ms);}}),api};
}
test('503 and 429 are repeated and the later success is returned',async()=>{
 const s=load([{status:503},{status:429},{status:200}]);
 assert.equal((await s.call()).status,200);assert.equal(s.calls.length,3);assert.equal(s.waits.length,2);
});
test('after two repeats the last failure is returned to the caller',async()=>{
 const s=load([{status:503},{status:503},{status:503},{status:200}]);
 assert.equal((await s.call()).status,503);assert.equal(s.calls.length,3);
});
test('a request the model rejects (400, 403) is not repeated',async()=>{
 for(const status of [400,401,403,404]){const s=load([{status},{status:200}]);assert.equal((await s.call()).status,status);assert.equal(s.calls.length,1);}
});
test('a dropped connection is repeated; the caller\'s own timeout is not',async()=>{
 const s=load([new TypeError('network'),{status:200}]);assert.equal((await s.call()).status,200);assert.equal(s.calls.length,2);
 const c=new AbortController();c.abort();const t=load([new DOMException('timeout','TimeoutError'),{status:200}]);
 await assert.rejects(t.call({signal:c.signal}));assert.equal(t.calls.length,1);
});
test('Retry-After is honoured up to 20 s; otherwise 2 s then 6 s with jitter',async()=>{
 const s=load([{status:429,headers:{'retry-after':'5'}},{status:200}]);await s.call();assert.deepEqual(s.waits,[5000]);
 assert.equal(s.api.retryDelay(0,'120'),20000);
 assert.equal(s.api.retryDelay(0,null,0.5),2000);assert.equal(s.api.retryDelay(1,null,0.5),6000);
 assert.ok(s.api.retryDelay(0,null,0)>=1500&&s.api.retryDelay(0,null,1)<=2500);
});
