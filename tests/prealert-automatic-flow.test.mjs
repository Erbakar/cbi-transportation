import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {z} from 'zod';
import {setup,moduleAt,AppError} from './helpers/prealert-upload-fixture.mjs';

// The actual upload route, private worker route, scheduler and durable queue are
// wired together. Only external ERP/storage/auth dependencies use test fixtures.
function automaticFlow(){
 const s=setup(),clock={value:1_000_000},state=Object.assign(s.state,{loggedIn:true,probeDown:false,failEnqueue:false,failPublish:false}),key='a'.repeat(64),events=[],notifications=[];
 class Clock extends Date{constructor(...args){super(...(args.length?args:[clock.value]));}static now(){return clock.value;}}
 const env={PREALERT_QUEUE_ENABLED:'true',PREALERT_QUEUE_KEY:key,PREALERT_WAKEUPS:{send:async body=>{if(state.failPublish)throw Error('notification unavailable');notifications.push(body);}}};
 const queue=moduleAt('lib/server/prealert-queue.ts',{AppError,db:s.db,runtime:()=>env,Date:Clock,syncPrealert:s.api.syncPrealert,readTmaxxArchiveFile:async()=>{if(state.probeDown)throw new AppError('archive unavailable',503);}},'enqueuePrealert,runPrealertQueue,requirePrealertQueueKey');
 const json=(data,status=200)=>Response.json(data,{status}),errorResponse=e=>json({error:e.message},e.status||500);
 const route=moduleAt('app/api/prealert/route.ts',{z,AppError,json,errorResponse,sameOrigin:req=>assert.equal(req.headers.get('Origin'),'https://app.test'),requireUser:async req=>{if(!state.loggedIn||req.headers.get('Cookie')!=='cbi_session=test')throw new AppError('signed out',401);return 'alice';},documentForm:req=>req.formData(),boundedJSON:req=>req.json(),createPrealert:s.api.createPrealert,prealertList:s.api.prealertList,enqueuePrealert:async(...args)=>{if(state.failEnqueue)throw new AppError('request ended after save',503);return queue.enqueuePrealert(...args);}},'POST');
 const internal=moduleAt('app/api/internal/prealert-queue/route.ts',{AppError,json,errorResponse,requirePrealertQueueKey:queue.requirePrealertQueueKey,runPrealertQueue:queue.runPrealertQueue},'POST');
 const compiled=ts.transpileModule(fs.readFileSync('workers/prealert-scheduler.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace('export default scheduler;','return scheduler;');
 const scheduler=new Function('console',compiled)({log:message=>events.push(JSON.parse(message)),warn:message=>events.push(JSON.parse(message))});
 const schedulerEnv={PREALERT_QUEUE_KEY:key,APP:{fetch:async(url,options)=>{const req=new Request(url,options);assert.equal(req.headers.get('Cookie'),null);assert.equal(req.headers.get('Authorization'),'Bearer '+key);return internal.POST(req);}}};
 const scheduled=()=>scheduler.scheduled({cron:'*/5 * * * *',scheduledTime:clock.value},schedulerEnv);
 const deliver=async(body=notifications.shift())=>{const result={ack:0,retry:[]};await scheduler.queue({messages:[{body,ack:()=>result.ack++,retry:options=>result.retry.push(options)}]},schedulerEnv);return result;};
 const upload=()=>route.POST(new Request('https://app.test/api/prealert',{method:'POST',headers:{Origin:'https://app.test',Cookie:'cbi_session=test'},body:s.form()}));
 const row=()=>s.sql.prepare('SELECT * FROM prealert_queue').get();
 const canary=()=>s.sql.prepare("INSERT INTO prealert_uploads(id,owner,position_id,position_reference,filename,size,hash,object_key,type_id,state,remote_id,created_at,updated_at) VALUES('canary','alice',99,'S.E.OLD','old.pdf',10,'old','old',8,'synced',99,'old','old')").run();
 return {...s,state,clock,events,notifications,upload,scheduled,deliver,row,canary};
}

test('user upload returns queued; scheduled service transfers after logout with no manual queue call',async()=>{
 const s=automaticFlow(),response=await s.upload(),saved=await response.json();assert.equal(response.status,202);assert.equal(saved.archive.status,'queued');assert.equal(s.row().state,'queued');assert.deepEqual(s.counts(),{uploadCount:0,linkCount:0});
 s.state.loggedIn=false;await s.scheduled();assert.equal(s.events.at(-1).status,'complete');assert.equal(s.row().state,'complete');assert.equal((await s.api.prealertList('alice'))[0].state,'synced');assert.deepEqual(s.counts(),{uploadCount:1,linkCount:1});
 // Later scheduled ticks and the same user upload both retain the same record.
 s.clock.value+=300000;await s.scheduled();assert.equal(s.events.at(-1).status,'idle');s.state.loggedIn=true;const duplicate=await (await s.upload()).json();assert.equal(duplicate.id,saved.id);assert.equal(duplicate.duplicate,true);assert.equal(duplicate.archive.status,'synced');assert.equal(s.objects.size,1);assert.deepEqual(s.counts(),{uploadCount:1,linkCount:1});
});

test('the scheduler recovers a saved PDF when the upload HTTP request cannot finish enqueueing',async()=>{
 const s=automaticFlow();s.state.failEnqueue=true;assert.equal((await s.upload()).status,503);assert.equal(s.objects.size,1);assert.equal(s.row(),undefined);
 s.state.loggedIn=false;await s.scheduled();assert.equal(s.events.at(-1).status,'complete');assert.equal(s.row().state,'complete');assert.deepEqual(s.counts(),{uploadCount:1,linkCount:1});
});

test('archive recovery needs only a later scheduled tick, not another user request or backoff reset',async()=>{
 const s=automaticFlow();await s.upload();s.canary();s.state.probeDown=true;s.state.loggedIn=false;await s.scheduled();assert.equal(s.events.at(-1).status,'waiting');assert.deepEqual(s.counts(),{uploadCount:0,linkCount:0});
 const due=s.row().next_at;s.state.probeDown=false;await s.scheduled();assert.deepEqual(s.counts(),{uploadCount:0,linkCount:0});
 s.clock.value=due;await s.scheduled();assert.equal(s.events.at(-1).status,'complete');assert.deepEqual(s.counts(),{uploadCount:1,linkCount:1});
});

test('scheduled execution retains an ambiguous upload for review without duplicating it',async()=>{
 const s=automaticFlow();await s.upload();s.state.loggedIn=false;s.state.failUpload=true;await s.scheduled();assert.equal(s.row().state,'review');s.state.failUpload=false;
 s.clock.value=s.row().next_at;await s.scheduled();assert.equal(s.row().state,'review');assert.deepEqual(s.counts(),{uploadCount:1,linkCount:0});assert.equal(s.objects.size,1);
});

test('normal upload publishes a durable notification and transfers after logout without waiting for cron',async()=>{
 const s=automaticFlow(),response=await s.upload(),saved=await response.json();assert.equal(response.status,202);
 assert.deepEqual(s.notifications,[{documentId:saved.id,enqueuedAt:s.clock.value}]);assert.deepEqual(s.counts(),{uploadCount:0,linkCount:0});
 const message=s.notifications[0];s.state.loggedIn=false;assert.deepEqual(await s.deliver(),{ack:1,retry:[]});
 assert.equal(s.row().state,'complete');assert.equal(s.row().attempts,1);assert.deepEqual(s.counts(),{uploadCount:1,linkCount:1});
 const completeRow={...s.row()};await s.deliver(message);await s.scheduled();assert.deepEqual({...s.row()},completeRow);assert.deepEqual(s.counts(),{uploadCount:1,linkCount:1});
 s.state.loggedIn=true;const duplicate=await (await s.upload()).json();assert.equal(duplicate.id,saved.id);assert.equal(s.notifications.length,0);
});

test('notification publishing failure still returns saved/queued and the unchanged cron recovers the PDF',async()=>{
 const s=automaticFlow();s.state.failPublish=true;const response=await s.upload();assert.equal(response.status,202);assert.equal(s.notifications.length,0);assert.equal(s.row().state,'queued');
 await s.scheduled();assert.equal(s.row().state,'complete');assert.deepEqual(s.counts(),{uploadCount:1,linkCount:1});
});

test('simultaneous notification redelivery and cron share the same lease and write once',async()=>{
 const s=automaticFlow();await s.upload();const message=s.notifications[0];
 await Promise.all([s.deliver(message),s.deliver(message),s.scheduled()]);
 assert.deepEqual(s.counts(),{uploadCount:1,linkCount:1});assert.equal(s.row().state,'complete');
 await s.deliver(message);assert.deepEqual(s.counts(),{uploadCount:1,linkCount:1});
});

test('fast delivery respects archive outage cooldown and retries automatically when due',async()=>{
 const s=automaticFlow();await s.upload();s.canary();s.state.probeDown=true;const message=s.notifications[0];
 assert.deepEqual(await s.deliver(message),{ack:0,retry:[{delaySeconds:300}]});assert.deepEqual(s.counts(),{uploadCount:0,linkCount:0});
 s.state.probeDown=false;await s.deliver(message);assert.deepEqual(s.counts(),{uploadCount:0,linkCount:0});
 s.clock.value=s.row().next_at;assert.deepEqual(await s.deliver(message),{ack:1,retry:[]});assert.deepEqual(s.counts(),{uploadCount:1,linkCount:1});
});

test('an ambiguous fast upload is reconciled on redelivery and is never sent twice',async()=>{
 const s=automaticFlow();await s.upload();const message=s.notifications[0];s.state.failUpload=true;
 assert.deepEqual(await s.deliver(message),{ack:0,retry:[{delaySeconds:1800}]});assert.equal(s.row().state,'review');
 s.state.failUpload=false;s.clock.value=s.row().next_at;await s.deliver(message);await s.scheduled();
 assert.deepEqual(s.counts(),{uploadCount:1,linkCount:0});assert.equal(s.row().state,'review');
});

test('a notification is restricted to its own document and never drains an unrelated pending upload',async()=>{
 const s=automaticFlow();await s.upload();await s.deliver({documentId:'11111111-1111-4111-8111-111111111111',enqueuedAt:s.clock.value});
 assert.equal(s.row().state,'queued');assert.equal(s.row().attempts,0);assert.deepEqual(s.counts(),{uploadCount:0,linkCount:0});
});
