import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {z} from 'zod';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {eventLabels,eventKinds,taskInputSchema,scheduleActionSchema,dateHint,zonedInstant,taskAlerts,chronologyWarnings} from '../lib/operations/schedule.ts';
function moduleAt(path,deps,names){const source=fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');return new Function(...Object.keys(deps),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText+';return{'+names.join(',')+'}')( ...Object.values(deps));}
const {bookingExtractionSchema}=moduleAt('lib/operations/booking-extraction.ts',{z},['bookingExtractionSchema']);
const task=(patch={})=>({id:randomUUID(),kind:'siCutoff',label:'SI',location:'',date:'2026-10-08',time:'12:00',zone:'Europe/Istanbul',assignee:'Burçe',status:'pending',remindHours:24,requiredDocument:'instruction',note:'',source:null,updatedAt:'2026-10-07T10:00:00Z',completedAt:null,...patch});
test('dates preserve calendar precision; missing year and ambiguous slash dates are not guessed',()=>{
 assert.equal(dateHint('08.10.2026 12:30').date,'2026-10-08');assert.equal(dateHint('08.10.2026 12:30').zone,'');
 assert.equal(dateHint('08 OCT 2026 12:30 UTC').zone,'UTC');assert.equal(dateHint('08/10/2026').date,'');assert.equal(dateHint('08 OCT').date,'');assert.equal(dateHint('31.02.2026').date,'');
 assert.equal(dateHint('2026-10-08T12:30Z').zone,'UTC');assert.equal(dateHint('2026-10-08 12:30 UTC+03').zone,'');
});
test('zone conversion rejects DST gaps and repeated times',()=>{
 assert.equal(new Date(zonedInstant('2026-10-08','12:00','Europe/Istanbul')).toISOString(),'2026-10-08T09:00:00.000Z');
 assert.throws(()=>zonedInstant('2026-03-08','02:30','America/New_York'));assert.throws(()=>zonedInstant('2026-11-01','01:30','America/New_York'));
 assert.throws(()=>zonedInstant('2026-02-31','12:00','UTC'));
});
test('deadline alerts respect exact boundaries, missing proof, completed state and date-only precision',()=>{
 const t=task(),due=zonedInstant(t.date,t.time,t.zone);assert.ok(taskAlerts(t,due-3600000,[]).some(a=>a.code==='upcoming'));
 assert.ok(taskAlerts(t,due+1,[]).some(a=>a.code==='overdue'));assert.ok(taskAlerts(t,due,[]).some(a=>a.code==='missing_document'));
 assert.equal(taskAlerts({...t,status:'done'},due+1,[]).length,0);
 const day={...t,time:''};assert.ok(!taskAlerts(day,Date.parse('2026-10-08T18:00Z'),[]).some(a=>a.code==='overdue'));
 assert.ok(taskAlerts(day,Date.parse('2026-10-09T00:00Z'),[]).some(a=>a.code==='overdue'));
 assert.ok(!taskAlerts(t,due,[{type:'instruction'}]).some(a=>a.code==='missing_document'));
});
test('source re-read and replacement are flagged, ETD never becomes ATD',()=>{
 const t=task({source:{documentId:'a',extractionId:'1'}});assert.ok(taskAlerts(t,0,[{id:'a',extractionId:'2'}]).some(a=>a.code==='source_changed'));
 assert.ok(!taskAlerts(t,0,[{id:'a',extractionId:'1'}]).some(a=>a.code==='source_changed'));
 assert.ok(chronologyWarnings([task({kind:'etd',date:'2026-10-10'}),task({kind:'eta',date:'2026-10-09'})]).length);
 assert.equal(chronologyWarnings([task({kind:'etd'}),task({kind:'ata',date:'2026-10-01'})]).length,0);
});
test('invalid task dates, anonymous completion and client-forged provenance are rejected',()=>{
 const {source,updatedAt,completedAt,...input}=task();assert.ok(taskInputSchema.safeParse(input).success);
 assert.ok(!taskInputSchema.safeParse({...input,status:'done',assignee:''}).success);assert.ok(!taskInputSchema.safeParse({...input,date:'',time:'12:00'}).success);
 assert.ok(!taskInputSchema.safeParse({...input,source:{documentId:'fake'}}).success);assert.ok(!taskInputSchema.safeParse({...input,zone:'invalid'}).success);
});
function setup(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of ['0006_booking_handover.sql','0007_operation_documents.sql','0008_booking_extractions.sql','0009_document_policy.sql','0010_booking_phase2.sql','0011_operation_schedule.sql'])sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
 let race=()=>{};const db=()=>({prepare(query){return{bind(...args){return{query,args,first:async()=>sql.prepare(query).get(...args)||null,all:async()=>({results:sql.prepare(query).all(...args)}),run:async()=>({meta:{changes:Number(sql.prepare(query).run(...args).changes)}})}}}},async batch(commands){race();race=()=>{};sql.exec('BEGIN');try{const results=commands.map(c=>({meta:{changes:Number(sql.prepare(c.query).run(...c.args).changes)}}));sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}});
 class AppError extends Error{constructor(m,status=400){super(m);this.status=status}}
 const id=randomUUID(),owner='cbi';sql.prepare('INSERT INTO booking_handovers(id,owner,reference_key,data,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,owner,'p',JSON.stringify({salesReference:'PHASE3',assignee:'Burçe',customer:'Test'}),'now','now');
 const objects=new Map();const digest=async bytes=>createHash('sha256').update(bytes).digest('hex');
 const runtime=()=>({BUCKET:{get:async key=>objects.has(key)?{arrayBuffer:async()=>objects.get(key)}:null}});
 const ownBooking=async (i,o)=>{if(!sql.prepare('SELECT id FROM booking_handovers WHERE id=? AND owner=?').get(i,o))throw new AppError('missing',404)};
 const svc=moduleAt('lib/server/operation-schedule.ts',{AppError,db,digest,runtime,ownBooking,bookingExtractionSchema,eventLabels,scheduleActionSchema,taskInputSchema,dateHint,taskAlerts,chronologyWarnings},['scheduleWorkspace','saveSchedule','operationCalendar']);
 async function document(type='booking_confirmation',previous=null){const docId=randomUUID(),exId=randomUUID(),bytes=Buffer.from('proof-'+docId),hash=await digest(bytes),series=previous?.series||docId;objects.set(docId,bytes);sql.prepare('INSERT INTO operation_documents(id,booking_id,owner,series_id,version,replaces_id,type,filename,mime,size,hash,object_key,source_reference,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(docId,id,owner,series,previous?2:1,previous?.docId||null,type,'booking.pdf','application/pdf',5,hash,docId,'test','now');const fields=['customer','shipper','loadPort','dischargePort','equipmentType','equipmentCount','incoterm','freightPayment'].map(key=>({key,value:null,source:'',page:null,confidence:0}));const result={documentType:type,fields,issues:[],schedule:{siCutoff:{value:'08.10.2026 12:00',source:'SI cut-off 08.10.2026 12:00',page:1,confidence:.98}}};sql.prepare("INSERT INTO booking_document_extractions(document_id,id,status,lease_until,result,model,created_at) VALUES(?,?,'ready',0,?,'test','now')").run(docId,exId,JSON.stringify(result));return{docId,exId,series};}
 async function input(){const w=await svc.scheduleWorkspace(id,owner);const {source,updatedAt,completedAt,id:ignore,...t}=task();return{action:'task',revision:w.revision,evidenceRevision:w.evidenceRevision,reason:'Operasyon teyidi',task:t}}
 async function imported(doc){const w=await svc.scheduleWorkspace(id,owner);return{action:'import',revision:w.revision,evidenceRevision:w.evidenceRevision,documentId:doc.docId,extractionId:doc.exId,key:'siCutoff',date:'2026-10-08',time:'12:00',zone:'Europe/Istanbul',assignee:'Burçe',remindHours:24,verified:true,reason:'Belge üzerinden doğrulandı'}}
 return{...svc,sql,id,owner,document,input,imported,objects,race:f=>{race=f}};
}
test('schedule reads and writes enforce ownership and leave other bookings untouched',async()=>{const s=setup();await assert.rejects(s.scheduleWorkspace(s.id,'other'),e=>e.status===404);await assert.rejects(s.saveSchedule(s.id,'other',await s.input()),e=>e.status===404);const w=await s.saveSchedule(s.id,s.owner,await s.input());assert.equal(w.tasks.length,1);assert.equal(w.revision,1);assert.equal(w.history.length,1);assert.equal((await s.operationCalendar('other')).bookings.length,0)});
test('revision CAS rejects stale tabs and evidence races without false history',async()=>{const s=setup(),v=await s.input();await s.saveSchedule(s.id,s.owner,v);await assert.rejects(s.saveSchedule(s.id,s.owner,v),e=>e.status===409);const next=await s.input();s.race(()=>s.sql.prepare('UPDATE booking_handovers SET evidence_revision=evidence_revision+1 WHERE id=?').run(s.id));await assert.rejects(s.saveSchedule(s.id,s.owner,next),e=>e.status===409);assert.equal((await s.scheduleWorkspace(s.id,s.owner)).history.length,1)});
test('concurrent first saves produce one schedule and one audit event',async()=>{const s=setup(),v=await s.input();s.race(()=>s.sql.prepare("INSERT INTO booking_schedules(booking_id,owner,revision,data,updated_at) VALUES(?,?,1,'[]','now')").run(s.id,s.owner));await assert.rejects(s.saveSchedule(s.id,s.owner,v),e=>e.status===409);assert.equal((await s.scheduleWorkspace(s.id,s.owner)).history.length,0)});
test('current source imports retain evidence and revisions preserve prior dates',async()=>{const s=setup(),doc=await s.document();let w=await s.saveSchedule(s.id,s.owner,await s.imported(doc));assert.equal(w.tasks[0].source.documentId,doc.docId);const taskId=w.tasks[0].id;const rev=await s.document('booking_revision',doc);w=await s.scheduleWorkspace(s.id,s.owner);assert.ok(taskAlerts(w.tasks[0],0,w.documents).some(a=>a.code==='source_changed'));const input=await s.imported(rev);input.date='2026-10-09';w=await s.saveSchedule(s.id,s.owner,input);assert.equal(w.tasks.length,1);assert.equal(w.tasks[0].id,taskId);assert.equal(w.tasks[0].date,'2026-10-09');assert.equal(w.history[1].tasks[0].date,'2026-10-08');assert.equal(w.history[1].tasks[0].source.documentId,doc.docId)});
test('superseded, request, tampered and stale extraction evidence cannot enter the calendar',async()=>{const s=setup(),request=await s.document('booking_request');await assert.rejects(s.saveSchedule(s.id,s.owner,await s.imported(request)));const doc=await s.document();s.objects.set(doc.docId,Buffer.from('tamper'));await assert.rejects(s.saveSchedule(s.id,s.owner,await s.imported(doc)),e=>e.status===409);assert.equal((await s.scheduleWorkspace(s.id,s.owner)).tasks.length,0)});
test('completed tasks cannot be silently rewritten by a new confirmation',async()=>{const s=setup(),doc=await s.document();let w=await s.saveSchedule(s.id,s.owner,await s.imported(doc));let input=await s.input();const {source,updatedAt,completedAt,...task}=w.tasks[0];input.task={...task,status:'done'};w=await s.saveSchedule(s.id,s.owner,input);assert.ok(w.tasks[0].completedAt);await assert.rejects(s.saveSchedule(s.id,s.owner,await s.imported(doc)),e=>e.status===409);assert.equal((await s.scheduleWorkspace(s.id,s.owner)).history.length,2)});
test('24-hour warning escalates at 4 hours and reminder ordering is validated',()=>{
 const t=task({urgentHours:4}),due=zonedInstant(t.date,t.time,t.zone);
 const alert=hours=>taskAlerts(t,due-hours*3600000,[]).find(a=>a.code==='upcoming');
 assert.equal(alert(24.001),undefined);assert.equal(alert(24).severity,'warning');
 assert.equal(alert(4.001).severity,'warning');assert.equal(alert(4).severity,'danger');
 assert.equal(alert(0).severity,'danger');
 const {source,updatedAt,completedAt,...input}=t;
 assert.equal(taskInputSchema.safeParse({...input,urgentHours:25}).success,false);
 assert.equal(taskInputSchema.parse({...input,urgentHours:undefined}).urgentHours,4);
 assert.equal(taskAlerts({...t,time:''},due-3600000,[]).find(a=>a.code==='upcoming').severity,'warning');
});
test('calendar test filter hides flagged bookings without deleting their tasks or changing default reads',async()=>{const s=setup();s.sql.exec('CREATE TABLE booking_reporting(booking_id TEXT,owner TEXT,data TEXT)');await s.saveSchedule(s.id,s.owner,await s.input());s.sql.prepare('INSERT INTO booking_reporting VALUES(?,?,?)').run(s.id,s.owner,JSON.stringify({test:true}));assert.equal((await s.operationCalendar(s.owner,true)).bookings.length,0);assert.equal((await s.operationCalendar(s.owner)).bookings.length,1);assert.equal((await s.scheduleWorkspace(s.id,s.owner)).tasks.length,1);s.sql.prepare('UPDATE booking_reporting SET owner=?').run('another-owner');assert.equal((await s.operationCalendar(s.owner,true)).bookings.length,1);});
