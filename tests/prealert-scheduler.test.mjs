import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const js=ts.transpileModule(fs.readFileSync('workers/prealert-scheduler.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace('export default scheduler;','return scheduler;');
const scheduler=new Function('console',js)({log(){},warn(){}});
test('scheduled invocation stays alive until the service-bound queue request finishes',async()=>{
 let finish,done=false,calls=0;
 const response=new Promise(resolve=>{finish=resolve;});
 const pending=scheduler.scheduled({}, {PREALERT_QUEUE_KEY:'test-secret',APP:{fetch:async(url,options)=>{calls++;assert.equal(url,'https://cbi.internal/api/internal/prealert-queue');assert.equal(options.method,'POST');assert.equal(options.headers.Authorization,'Bearer test-secret');return response;}}}).then(()=>{done=true;});
 await Promise.resolve();assert.equal(done,false);assert.equal(calls,1);
 finish(Response.json({status:'waiting'}));await pending;assert.equal(done,true);
});
test('authorization and server errors make the scheduled execution fail visibly without HTTP retries',async()=>{
 let calls=0;await assert.rejects(scheduler.scheduled({}, {PREALERT_QUEUE_KEY:'test-secret',APP:{fetch:async()=>{calls++;return new Response('',{status:401});}}}),/HTTP 401/);assert.equal(calls,1);
 await assert.rejects(scheduler.scheduled({}, {APP:{fetch:async()=>{throw Error('must not send');}}}),/key is missing/);
});
test('the deployed scheduler is private, uses the existing app binding and an independent five-minute schedule',()=>{
 const config=JSON.parse(fs.readFileSync('wrangler.prealert-queue.json','utf8'));
 assert.equal(config.workers_dev,false);assert.equal(config.preview_urls,false);assert.deepEqual(config.services,[{binding:'APP',service:'cbi-transportation'}]);assert.deepEqual(config.triggers.crons,['*/5 * * * *']);
 const producer=JSON.parse(fs.readFileSync('wrangler.production.json','utf8')).queues.producers[0],consumer=config.queues.consumers[0];
 assert.equal(producer.binding,'PREALERT_WAKEUPS');assert.equal(producer.queue,consumer.queue);assert.equal(consumer.max_batch_size,1);assert.equal(consumer.max_concurrency,1);assert.ok(consumer.max_batch_timeout<=1);
});

test('notification consumer validates payloads, scopes dispatch, retries failures and waits until work finishes',async()=>{
 let calls=0,finish;const actions=[];const message={body:{documentId:'11111111-1111-4111-8111-111111111111',enqueuedAt:Date.now()},ack:()=>actions.push('ack'),retry:o=>actions.push(o)};
 const env={PREALERT_QUEUE_KEY:'test-secret',APP:{fetch:async(url,options)=>{calls++;assert.ok(url.endsWith('?documentId='+message.body.documentId));assert.equal(options.headers.Authorization,'Bearer test-secret');return new Promise(resolve=>{finish=resolve;});}}};
 const pending=scheduler.queue({messages:[message]},env);await Promise.resolve();assert.deepEqual(actions,[]);finish(Response.json({status:'complete'}));await pending;assert.deepEqual(actions,['ack']);
 const failed={...env,APP:{fetch:async()=>new Response('',{status:503})}};await scheduler.queue({messages:[message]},failed);assert.deepEqual(actions.at(-1),{delaySeconds:30});
 for(const body of [null,{}, {documentId:'../other',enqueuedAt:1},{...message.body,enqueuedAt:0}])await scheduler.queue({messages:[{...message,body}]},env);
 assert.equal(calls,1);
});
