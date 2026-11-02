import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {z} from 'zod';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {containerValid} from '../lib/domain.ts';
import {validDate,validZone,zonedInstant,eventLabels} from '../lib/operations/schedule.ts';
import {bookingSchema,emptyBooking} from '../lib/operations/booking.ts';
function moduleAt(path,deps,names){const source=fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');return new Function(...Object.keys(deps),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText+';return{'+names.join(',')+'}')(...Object.values(deps));}
const domain=moduleAt('lib/operations/field-operation.ts',{z,containerValid,validDate,validZone,zonedInstant,eventLabels},['fieldSchema','fieldActionSchema','emptyField','emptyContainer','commonValues','buildFieldOutput','outputKinds']);
const {fieldSchema,emptyField,emptyContainer,buildFieldOutput,outputKinds}=domain;
class AppError extends Error{constructor(message,status=400){super(message);this.status=status}}
const digest=async v=>createHash('sha256').update(v).digest('hex');
const booking={...emptyBooking,salesReference:'TEST-4',bookingNumber:'B-1',shipper:'Test shipper',loadPort:'Izmir',dischargePort:'Valparaiso',equipmentType:'40HC',equipmentCount:1};
test('all output types derive shared changes and preserve booking inputs',()=>{
 const d=emptyField(),before=JSON.stringify(booking);
 for(const k of outputKinds){const a=buildFieldOutput(k,booking,null,d,[]);assert.ok(a.body.includes('B-1'));const b=buildFieldOutput(k,booking,null,{...d,overrides:{bookingNumber:'B-2'}},[]);assert.ok(b.body.includes('B-2'));assert.ok(!b.body.includes('B-1'));}
 assert.equal(JSON.stringify(booking),before);
});
test('confirmation stays incomplete until container seal and loading completion exist',()=>{
 let d=emptyField();assert.ok(buildFieldOutput('confirmation',booking,null,d,[]).missing.length);
 d.containers=[{...emptyContainer(),number:'MSCU1234566'}];assert.ok(buildFieldOutput('confirmation',booking,null,d,[]).missing.length);
 d.containers[0].seal='MSC-TEST';d.containers[0].loadingEnd='2026-10-01T10:00';assert.equal(buildFieldOutput('confirmation',booking,null,d,[]).missing.length,0);
});
test('invalid and duplicate containers, reversed movements and DST ambiguity are rejected',()=>{
 const d=emptyField(),c={...emptyContainer(),number:'MSCU1234566'};assert.ok(fieldSchema.safeParse({...d,containers:[c]}).success);
 assert.ok(!fieldSchema.safeParse({...d,containers:[{...c,number:'MSCU1234567'}]}).success);
 assert.ok(!fieldSchema.safeParse({...d,containers:[c,{...c,id:randomUUID()}]}).success);
 assert.ok(!fieldSchema.safeParse({...d,containers:[{...c,loadingStart:'2026-10-01T11:00',loadingEnd:'2026-10-01T10:00'}]}).success);
 assert.ok(!fieldSchema.safeParse({...d,zone:'America/New_York',containers:[{...c,emptyPickup:'2026-11-01T01:30'}]}).success);
});
test('incidents require a valid container, ordered times and a resolution on close',()=>{
 const d=emptyField(),i={id:randomUUID(),containerId:'',kind:'waiting',start:'2026-10-01T10:00',end:'',description:'Queue at terminal',resolution:'',status:'open'};
 assert.ok(fieldSchema.safeParse({...d,incidents:[i]}).success);
 for(const patch of [{containerId:randomUUID()},{status:'resolved'},{end:'2026-09-30T10:00'}])assert.ok(!fieldSchema.safeParse({...d,incidents:[{...i,...patch}]}).success);
});
function setup(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const f of ['0006_booking_handover.sql','0007_operation_documents.sql','0008_booking_extractions.sql','0009_document_policy.sql','0010_booking_phase2.sql','0011_operation_schedule.sql','0012_field_operation.sql'])sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
 let race=()=>{};const db=()=>({prepare(query){return{bind(...args){return{query,args,first:async()=>sql.prepare(query).get(...args)||null,all:async()=>({results:sql.prepare(query).all(...args)}),run:async()=>{race();race=()=>{};return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}}}}}}},async batch(commands){race();race=()=>{};sql.exec('BEGIN');try{const results=commands.map(c=>({meta:{changes:Number(sql.prepare(c.query).run(...c.args).changes)}}));sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}});
 const id=randomUUID(),owner='cbi';
 sql.prepare('INSERT INTO booking_handovers(id,owner,reference_key,data,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,owner,'test',JSON.stringify(booking),'now','now');
 const ownBooking=async(i,o)=>{if(!sql.prepare('SELECT id FROM booking_handovers WHERE id=? AND owner=?').get(i,o))throw new AppError('missing',404)};
 const source={reference:'S.E.TEST',positionId:1,goodId:2,goodReference:'Y.TEST',checkedAt:'2026-10-01T00:00:00Z',values:{bookingNumber:'FROM-ERP'},containers:[{id:3,number:'MSCU1234566',type:'40HC',seal:'S1'}]};
 const readFieldSource=async()=>({source,fingerprint:'a'.repeat(64)});
 const svc=moduleAt('lib/server/field-operation.ts',{...domain,db,AppError,digest,ownBooking,bookingSchema,readFieldSource,zonedInstant},['fieldWorkspace','saveField','fieldArtifact']);
 async function input(action='save'){const w=await svc.fieldWorkspace(id,owner);return {action,revision:w.revision,bookingRevision:w.bookingRevision,scheduleRevision:w.scheduleRevision,evidenceRevision:w.evidenceRevision,...(action==='save'?{data:structuredClone(w.data),reason:'Test update'}:action==='archive'?{kind:'reservation'}:{reference:'S.E.TEST',goodId:2,fingerprint:'a'.repeat(64),verified:true,reason:'Source verified'})};}
 return {sql,id,owner,...svc,input,source,race:f=>{race=f}};
}
test('ownership applies to workspace, writes and archive downloads',async()=>{
 const s=setup(),input=await s.input();for(const run of [()=>s.fieldWorkspace(s.id,'other'),()=>s.saveField(s.id,'other',input),()=>s.fieldArtifact(s.id,'other',randomUUID())])await assert.rejects(run);
 const w=await s.saveField(s.id,s.owner,await s.input());assert.equal(w.revision,1);assert.equal(w.history.length,1);
});
test('stale revision and concurrent booking/evidence changes cannot write or create false history',async()=>{
 const s=setup(),input=await s.input();await s.saveField(s.id,s.owner,input);
 await assert.rejects(s.saveField(s.id,s.owner,input),e=>e.status===409);
 for(const col of ['revision','evidence_revision']){const next=await s.input();s.race(()=>s.sql.prepare('UPDATE booking_handovers SET '+col+'='+col+'+1 WHERE id=?').run(s.id));await assert.rejects(s.saveField(s.id,s.owner,next),e=>e.status===409);}
 assert.equal((await s.fieldWorkspace(s.id,s.owner)).history.length,1);
});
test('concurrent initial field insert and schedule changes are rejected',async()=>{
 const s=setup(),v=await s.input();
 s.race(()=>s.sql.prepare('INSERT INTO booking_field_operations(booking_id,owner,revision,data,updated_at) VALUES(?,?,1,?,?)').run(s.id,s.owner,JSON.stringify(emptyField()),'now'));
 await assert.rejects(s.saveField(s.id,s.owner,v),e=>e.status===409);
 const next=await s.input();s.race(()=>s.sql.prepare("INSERT INTO booking_schedules(booking_id,owner,revision,data,updated_at) VALUES(?,?,1,'[]','now')").run(s.id,s.owner));
 await assert.rejects(s.saveField(s.id,s.owner,next),e=>e.status===409);
});
test('source imports require unchanged preview and retain entered containers and overrides',async()=>{
 const s=setup(),bad=await s.input('import');bad.fingerprint='b'.repeat(64);await assert.rejects(s.saveField(s.id,s.owner,bad),e=>e.status===409);
 let w=await s.saveField(s.id,s.owner,await s.input('import'));assert.equal(w.data.containers.length,1);assert.equal(w.common.bookingNumber,'FROM-ERP');
 const update=await s.input();update.data.overrides.bookingNumber='LOCAL';update.data.containers[0].plate='TEST-PLATE';await s.saveField(s.id,s.owner,update);
 w=await s.saveField(s.id,s.owner,await s.input('import'));assert.equal(w.common.bookingNumber,'LOCAL');assert.equal(w.data.containers[0].plate,'TEST-PLATE');assert.equal(w.data.containers.length,1);
});
test('archived copies remain unchanged and become stale when shared values change',async()=>{
 const s=setup();let w=await s.saveField(s.id,s.owner,await s.input('archive'));const old=w.artifacts[0];assert.equal(old.stale,false);
 const update=await s.input();update.data.overrides.bookingNumber='CHANGED';w=await s.saveField(s.id,s.owner,update);assert.equal(w.artifacts[0].stale,true);
 assert.equal((await s.fieldArtifact(s.id,s.owner,old.id)).output.body,old.output.body);assert.ok(w.outputs.every(o=>o.body.includes('CHANGED')));
});
test('archive is guarded against upstream changes during creation',async()=>{
 const s=setup(),v=await s.input('archive');s.race(()=>s.sql.prepare('UPDATE booking_handovers SET revision=revision+1 WHERE id=?').run(s.id));
 await assert.rejects(s.saveField(s.id,s.owner,v),e=>e.status===409);assert.equal((await s.fieldWorkspace(s.id,s.owner)).artifacts.length,0);
});
test('dispatch records bind to immutable owned artifact, require attestation, reject future dates',async()=>{
 const s=setup(),w=await s.saveField(s.id,s.owner,await s.input('archive'));
 const v={action:'dispatch',artifactId:w.artifacts[0].id,recipient:'test@example.invalid',sentAt:'2026-10-01T09:00:00Z',channel:'email',evidence:'Synthetic test only',confirmed:true};
 for(const patch of [{artifactId:randomUUID()},{sentAt:'2099-01-01T00:00:00Z'},{confirmed:false}])await assert.rejects(s.saveField(s.id,s.owner,{...v,...patch}));
 const next=await s.saveField(s.id,s.owner,v);assert.equal(next.dispatches[0].artifact_id,v.artifactId);assert.equal(next.dispatches[0].recipient,v.recipient);assert.equal((await s.saveField(s.id,s.owner,v)).dispatches.length,1);
});
test('existing container and incident history cannot be silently deleted',async()=>{
 const s=setup();await s.saveField(s.id,s.owner,await s.input('import'));const v=await s.input();v.data.containers=[];await assert.rejects(s.saveField(s.id,s.owner,v));
 const cancel=await s.input();cancel.data.containers[0].cancelled=true;const w=await s.saveField(s.id,s.owner,cancel);assert.equal(w.data.containers.length,1);assert.equal(w.data.containers[0].cancelled,true);
});
const sourceModule=moduleAt('lib/server/field-source.ts',{AppError,digest,tmaxxClient:async()=>{throw new Error('unused')}},['fieldSourceValues']);
test('T-MAXX mapping only uses known explicit values and does not infer dates',()=>{
 const mapped=sourceModule.fieldSourceValues({referenceNo:'POSITION',vessel:{name:'VESSEL'},shipper:{name:'SHIPPER'},etdDate:'2026-10-01'},{bookingNo:'BOOKING',loadAddress:'ADDRESS',seaPosition:{id:1}});
 assert.equal(mapped.bookingNumber,'BOOKING');assert.equal(mapped.vessel,'VESSEL');assert.equal(mapped.loadingAddress,'ADDRESS');assert.equal(mapped.emptyDepot,undefined);assert.equal(mapped.etdDate,undefined);
});
test('T-MAXX source rejects ambiguous position and unrelated selected load',async()=>{
 for(const mode of ['ambiguous','unrelated']){
 const tmaxxClient=async()=>async path=>path.includes('seaPosition/search')?(mode==='ambiguous'?[{id:1},{id:2}]:[{id:1}]):path.endsWith('seaPosition/1')?{id:1,referenceNo:'S.E.TEST'}:[{id:2,context:'seaGood'}];
 const {readFieldSource}=moduleAt('lib/server/field-source.ts',{AppError,digest,tmaxxClient},['readFieldSource']);
 await assert.rejects(readFieldSource('cbi','S.E.TEST',9));
 }
});

test('actual field events cannot be saved in the future',async()=>{
 const s=setup(),v=await s.input();v.data.containers=[{...emptyContainer(),loadingStart:'2099-01-01T10:00'}];
 await assert.rejects(s.saveField(s.id,s.owner,v),/gelecekte/);assert.equal((await s.fieldWorkspace(s.id,s.owner)).revision,0);
});
test('source reader verifies parent links and fingerprints content independently of read timestamp',async()=>{
 const get=async path=>path.includes('seaPosition/search')?[{id:1}]:path.endsWith('seaPosition/1')?{id:1,referenceNo:'S.E.TEST',vessel:{name:'TEST VESSEL'}}:path.includes('seaGood/search')?[{id:2,context:'seaGood',label:'Y.TEST'}]:path.endsWith('seaGood/2')?{id:2,referenceNo:'Y.TEST',seaPosition:{id:1},bookingNo:'B1'}:[{id:3,no:'MSCU1234566',sealNo:'S1',containerType:{name:'40HC'},seaGood:{id:2}}];
 const {readFieldSource}=moduleAt('lib/server/field-source.ts',{AppError,digest,tmaxxClient:async()=>get},['readFieldSource']);
 const a=await readFieldSource('cbi','S.E.TEST',2),b=await readFieldSource('cbi','S.E.TEST',2);
 assert.equal(a.fingerprint,b.fingerprint);assert.equal(a.source.values.equipment,'1 × 40HC');assert.equal(a.source.values.bookingNumber,'B1');
});
