import * as tmaxxFormat from '../lib/tmaxx-hbl-format.ts';globalThis.__tmaxxFormat=tmaxxFormat;
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createHash} from 'node:crypto';
import {tmaxxValueEqual} from '../lib/tmaxx-values.ts';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const uri=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
let serial=0;
async function harness({write}={}){
 const entities=new Map(),calls=[],journal=new Map();
 const mocks={tmaxxValueEqual,contracts:()=>[{id:'tmaxx',verified:true}],platformSession:async()=>({token:'test',cookie:''}),fetchJson:async(path,options)=>{calls.push({path,method:options.method});if(options.method!=='GET'){if(write)return {data:await write(path,options)};throw Error('Unexpected write');}return {data:structuredClone(entities.get(path.replace('http://95.216.243.19:8090','')))};},runStep:async(run,platform,step,request,send)=>{
  const old=journal.get(step);if(old){assert.equal(old.request_hash,hash(request),'the original request hash must survive resume');assert.equal(old.status,'complete');return JSON.parse(old.result);}
  const result=await send();journal.set(step,{step,status:'complete',request_hash:hash(request),result:JSON.stringify(result)});return result;
 }};
 globalThis.__checkpointMocks=mocks;
 const workflow=fs.readFileSync('lib/server/tmaxx-workflow.ts','utf8').replace("import {descriptionHasNetWeight,resolveTmaxxPacking,tmaxxHblPortName,type TmaxxPackingOption} from '../tmaxx-hbl-format';",'const {descriptionHasNetWeight,resolveTmaxxPacking,tmaxxHblPortName}=globalThis.__tmaxxFormat;').replace("import {tmaxxValueEqual} from '../tmaxx-values';",'const {tmaxxValueEqual}=globalThis.__checkpointMocks;').replace("import {cargoPrint} from '../shipment-rules';",'const cargoPrint=c=>({description:c.description.value});').replace("import {AppError} from './runtime';",'class AppError extends Error{constructor(m,status){super(m);this.status=status;}}').replace("import {contracts,fetchJson,platformSession} from './platforms';",'const {contracts,fetchJson,platformSession}=globalThis.__checkpointMocks;').replace("const {runStep}=await import('./platform-journal');",'const {runStep}=globalThis.__checkpointMocks;');
 const w=await import(uri(workflow+'\nexport {AppError};\n//'+serial++));
 globalThis.__checkpointMocks={...mocks,...w};
 const checkpoint=fs.readFileSync('lib/server/tmaxx-checkpoint.ts','utf8').replace("import {tmaxxValueEqual} from '../tmaxx-values';",'const {tmaxxValueEqual}=globalThis.__checkpointMocks;').replace("import {AppError,db,digest} from './runtime';",'class AppError extends Error{constructor(m,status){super(m);this.status=status;}};const digest=async s=>globalThis.__checkpointHash(s),db=()=>globalThis.__checkpointDB;').replace("import {orderTmaxxUpdates,tmaxxClient,tmaxxSaveKeys,type TMaxxUpdate} from './tmaxx-workflow';",'const {orderTmaxxUpdates,tmaxxClient,tmaxxSaveKeys}=globalThis.__checkpointMocks;');
 globalThis.__checkpointHash=s=>createHash('sha256').update(s).digest('hex');
 globalThis.__checkpointDB={prepare:()=>({bind:()=>({all:async()=>({results:[...journal.values()]})})})};
 return {entities,calls,journal,mocks,...w,...await import(uri(checkpoint+'\n//'+serial++))};
}
const container={path:'/api//sea/seaContainer',method:'PUT',entityId:11,body:{id:11,version:1,no:'MSNU8644653',containerType:{id:10},grossWeight:23320}};
const pack={path:'/api//sea/seaGoodPack',method:'PUT',entityId:12,body:{id:12,version:1,seaContainer:{id:11},quantity:744,packing:'PAKET',grossWeight:23320,netWeight:22893.36,goodDescription:'PVC PROFILES'}};
const good={path:'/api//sea/seaGood',method:'PUT',entityId:1,body:{id:1,version:1,hblNo:'1046445',bookingNo:'EBKG19125349',quantity:744,grossWeight:23320,netWeight:22893.36}};
const batch={loads:[{goodId:1,reference:'R1',updates:[container,pack,good],needsWaybill:false},{goodId:2,reference:'R2',updates:[],needsWaybill:true}]};
const step=(u,status)=>({step:'load:1:'+u.path+':'+u.entityId,status,request_hash:hash(u),result:status==='complete'?JSON.stringify({id:u.entityId,version:3}):null});
const steps=()=>[step(pack,'complete'),step(container,'unknown')];
async function populated(){const h=await harness();for(const u of [pack,container])h.entities.set(u.path+'/'+u.entityId,{...u.body,version:3});return h;}
test('read-only checkpoint verifies the written prefix and leaves two HBLs incomplete',async()=>{
 const h=await populated(),r=await h.inspectTmaxxCheckpoint('o',batch,steps());assert.equal(r.remaining,true);assert.equal(r.verified.length,2);assert.ok(h.calls.every(c=>c.method==='GET'));assert.ok(h.calls.every(c=>!c.path.includes('newSeaGoodWaybill')));assert.equal(h.journal.size,0);
});
for(const kind of ['different-value','different-id','old-version','missing-entity','changed-plan','gap','unknown-step','ambiguous-create','ambiguous-post'])test('checkpoint blocks '+kind,async()=>{
 const h=await populated(),b=structuredClone(batch),s=steps();
 if(kind==='different-value')h.entities.get(container.path+'/11').grossWeight=0;
 if(kind==='different-id')h.entities.get(container.path+'/11').id=99;
 if(kind==='old-version')h.entities.get(container.path+'/11').version=0;
 if(kind==='missing-entity')h.entities.delete(container.path+'/11');
 if(kind==='changed-plan')b.loads[0].updates[0].body.grossWeight=22000;
 if(kind==='gap')s.splice(0,1);
 if(kind==='unknown-step')s.push({...s[0],step:'not-in-plan'});
 if(kind==='ambiguous-create')s.push({step:'load:2:create-hbl',status:'unknown',request_hash:hash({goodId:2}),result:null});
 if(kind==='ambiguous-post'){b.loads[0].updates[1].method='POST';s[0].request_hash=hash(b.loads[0].updates[1]);}
 await assert.rejects(h.inspectTmaxxCheckpoint('o',b,s));assert.ok(h.calls.every(c=>c.method==='GET'));
});
test('resume retains the frozen plan and cached steps are skipped with original hashes',async()=>{
 const h=await populated();const verified=await h.inspectTmaxxCheckpoint('o',batch,steps());
 for(const v of verified.verified)h.journal.set(v.step,{step:v.step,status:'complete',request_hash:v.requestHash,result:JSON.stringify(v.result)});
 const frozen=await h.resumeTmaxxPlan({id:'r',owner:'o',revision:1},JSON.stringify(batch));assert.deepEqual(frozen,batch);
 // A later update must not change the completed requests or trigger another PUT.
 const load={...frozen.loads[0],updates:frozen.loads[0].updates.filter(u=>u.entityId!==1)};
 assert.equal(await h.executeTmaxx({id:'r',owner:'o',revision:1},load,'load:1:'),'R1');assert.ok(h.calls.every(c=>c.method==='GET'));
});
test('resume refuses unresolved journal entries even if values currently match',async()=>{
 const h=await populated();for(const s of steps())h.journal.set(s.step,s);await assert.rejects(h.resumeTmaxxPlan({id:'r',owner:'o',revision:1},JSON.stringify(batch)),/doğrulayın/);
});
for(const failure of ['connection','invalid-json','invalid-response'])test('PUT '+failure+' is resolved by exact read-back without resending',async()=>{
 const h=await harness();let writes=0,reads=0;
 const result=await h.saveTmaxxUpdate(container,async()=>{writes++;if(failure==='connection')throw Error('connection lost');if(failure==='invalid-json')throw new SyntaxError('invalid json');return {};},async path=>{reads++;assert.equal(path,container.path+'/11');return {...container.body,version:2};});
 assert.deepEqual(result,{id:11,version:2});assert.equal(writes,1);assert.equal(reads,1);
});
test('PUT read-back does not accept another entity, changed data or an older version',async()=>{
 const h=await harness();for(const patch of [{id:99},{grossWeight:0},{version:0}])await assert.rejects(h.saveTmaxxUpdate(container,async()=>{throw Error('lost')},async()=>({...container.body,version:2,...patch})),/doğrulanamadı/);
});
test('POST lost response remains ambiguous and never retries or guesses a created record',async()=>{
 const h=await harness();let writes=0,reads=0;await assert.rejects(h.saveTmaxxUpdate({...container,method:'POST'},async()=>{writes++;throw Error('lost')},async()=>{reads++;return container.body}),/lost/);assert.equal(writes,1);assert.equal(reads,0);
});
test('new HBL guard reads existing waybill and never creates a duplicate',async()=>{
 const h=await harness();h.entities.set('/api//sea/def/seaGoodWaybill/getBySeaGoodId?goodId=2',{id:50,version:1,seaGood:{id:2}});
 await assert.rejects(h.executeTmaxx({id:'r',owner:'o',revision:1},{goodId:2,updates:[],needsWaybill:true}),'mevcut');assert.ok(h.calls.every(c=>!c.path.includes('newSeaGoodWaybill')));
});

test('business rejection survives read-back so the operator sees the actual prerequisite',async()=>{
 const h=await harness();const message='T-MAXX: Taşıyıcının BCM / Booking Confirmation belgesi bu yükün dijital arşivine ilişkilendirilmeli.';
 for(const read of [async()=>({...good.body,hblNo:'',bookingNo:''}),async()=>{throw Error('unavailable');}]){
  await assert.rejects(h.saveTmaxxUpdate(good,async()=>{throw new h.AppError(message,422);},read),e=>e.message.includes(message));
 }
});

test('legacy HBL resume preserves fresh booking and status without replaying booking approval',async()=>{
 for(const bookingNo of [null,'EXISTING-BOOKING']){
  let writes=0;
  const h=await harness({write:async(path,options)=>{
   writes++;assert.equal(options.method,'PUT');assert.equal(path,'http://95.216.243.19:8090'+good.path);
   const body=JSON.parse(options.body);assert.equal(body.hblNo,'1046445');assert.equal(body.bookingNo,bookingNo);assert.deepEqual(body.status,{id:215643});assert.equal(body.version,20);
   return {...body,version:21};
  }});
  h.entities.set(good.path+'/1',{...good.body,version:20,hblNo:null,bookingNo,status:{id:215643}});
  await h.executeTmaxx({id:'r',owner:'o',revision:1},{goodId:1,reference:'R1',updates:[good],needsWaybill:false},'load:1:');
  assert.equal(writes,1);assert.equal(h.journal.get('load:1:'+good.path+':1').request_hash,hash(good));assert.equal(good.body.bookingNo,'EBKG19125349');
 }
});
test('checkpoint verifies HBL progress independently of unconfirmed booking approval',async()=>{
 const h=await populated();h.entities.set(good.path+'/1',{...good.body,version:22,bookingNo:null});
 const s=[step(pack,'complete'),step(container,'complete'),step(good,'unknown')];
 const r=await h.inspectTmaxxCheckpoint('o',batch,s);assert.equal(r.verified.length,3);assert.equal(r.remaining,true);assert.equal(r.verified[2].requestHash,hash(good));assert.ok(h.calls.every(c=>c.method==='GET'));
 h.entities.get(good.path+'/1').hblNo=null;
 await assert.rejects(h.inspectTmaxxCheckpoint('o',batch,s),/eşleşmiyor/);
});
