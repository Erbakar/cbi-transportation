import {costMappings} from '../lib/operations/tmaxx-cost-mapping.ts';
import {isQuoteSummary,separateQuoteSummaries} from '../lib/operations/quote-costs.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {z} from 'zod';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {bookingSchema,emptyBooking} from '../lib/operations/booking.ts';
import {matchBooking,bookingLifecycle,costTotal,costDecisionSchema} from '../lib/operations/booking-phase2.ts';
function moduleAt(path,deps,names){const source=fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');return new Function(...Object.keys(deps),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText+';return{'+names.join(',')+'}')( ...Object.values(deps));}
const {bookingExtractionSchema,extractableFields}=moduleAt('lib/operations/booking-extraction.ts',{z,bookingSchema},['bookingExtractionSchema','extractableFields']);
const proof=value=>({value,source:'Ref: '+value,page:1,confidence:.98});
function extraction(type='booking_confirmation'){return {documentType:type,fields:extractableFields.map(key=>({key,value:null,source:'',page:null,confidence:0})),issues:[],references:{booking:proof('BK123'),carrier:proof('MSC')}};}
const candidate=(id='a',booking='BK123')=>({id,draft:{...emptyBooking,salesReference:id,bookingNumber:booking},evidence:[]});
test('only unique strong references match; carrier-only, ambiguous and conflicting references remain manual',()=>{
 const r=extraction();assert.equal(matchBooking(r,[candidate()]).automaticId,'a');assert.equal(matchBooking(r,[candidate(),candidate('b')]).automaticId,null);
 const carrierOnly={...r,references:{carrier:proof('MSC')}};assert.equal(matchBooking(carrierOnly,[candidate()]).automaticId,null);
 r.references.sales=proof('different');assert.equal(matchBooking(r,[candidate()]).automaticId,null);
});
test('quote references find request without substituting sales or booking references',()=>{
 const r=extraction();r.references={quote:proof('Q1')};const b=candidate();b.evidence=[{...extraction('booking_request'),references:{quote:proof('Q1')}}];assert.equal(matchBooking(r,[b]).automaticId,'a');assert.equal(matchBooking(r,[candidate('Q1')]).automaticId,null);
});
test('uncertain source cannot auto attach and lifecycle never calls a request confirmed',()=>{
 const r=extraction();r.references.booking.confidence=.5;assert.equal(matchBooking(r,[candidate()]).automaticId,null);
 assert.equal(bookingLifecycle([{type:'booking_request',current:true,result:extraction('booking_request')}]),'request');
 assert.equal(bookingLifecycle([{type:'booking_confirmation',current:true,result:extraction('booking_request')}]),'draft');
 assert.equal(bookingLifecycle([{type:'booking_confirmation',current:false,result:extraction()}]),'draft');
});
test('financial parsing rejects malformed amounts and source-less terms; decimal math stays exact',()=>{
 const r=extraction('quote');r.commercial={lines:[],validity:[proof('31.10.2026')],freeTime:[],exclusions:[],conditions:[]};assert.ok(bookingExtractionSchema.safeParse(r).success);r.commercial.validity[0].source='';assert.equal(bookingExtractionSchema.safeParse(r).success,false);
 assert.equal(costTotal('0.1','3'),'0.3');assert.equal(costTotal('123.4567','2.5'),'308.64175');assert.equal(costTotal('100',null),null);assert.equal(costTotal(null,'2'),null);
});
function setup(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const f of ['0006_booking_handover.sql','0007_operation_documents.sql','0008_booking_extractions.sql','0009_document_policy.sql','0010_booking_phase2.sql'])sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
 let beforeBatch=()=>{};const db=()=>({prepare(query){return{bind(...args){return{query,args,first:async()=>sql.prepare(query).get(...args)||null,all:async()=>({results:sql.prepare(query).all(...args)}),run:async()=>({meta:{changes:Number(sql.prepare(query).run(...args).changes)}})}}}},async batch(commands){beforeBatch();sql.exec('BEGIN');try{const r=commands.map(c=>({meta:{changes:Number(sql.prepare(c.query).run(...c.args).changes)}}));sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}});
 class AppError extends Error{constructor(m,status=400){super(m);this.status=status;}}
 const objects=new Map(),digest=async bytes=>createHash('sha256').update(Buffer.from(bytes)).digest('hex');
 const runtime=()=>({BUCKET:{get:async key=>objects.has(key)?{arrayBuffer:async()=>objects.get(key)}:null,put:async(k,v)=>objects.set(k,v),delete:async k=>objects.delete(k)}});
 const ownBooking=async(id,owner)=>{if(!sql.prepare('SELECT id FROM booking_handovers WHERE id=? AND owner=?').get(id,owner))throw new AppError('missing',404);};
 const extractionDocument=async(id,d,owner)=>{await ownBooking(id,owner);const row=sql.prepare('SELECT * FROM operation_documents WHERE id=? AND booking_id=? AND owner=?').get(d,id,owner);if(!row)throw new AppError('missing',404);return row;};
 const getExtraction=async doc=>{const row=sql.prepare("SELECT * FROM booking_document_extractions WHERE document_id=? AND status='ready'").get(doc.id);return row?{id:row.id,result:bookingExtractionSchema.parse(JSON.parse(row.result))}:null;};
 const assessExtraction=async doc=>({blockers:sql.prepare('SELECT id FROM operation_documents WHERE replaces_id=?').get(doc.id)?['old']:[],evidenceRevision:sql.prepare('SELECT evidence_revision FROM booking_handovers WHERE id=?').get(doc.booking_id).evidence_revision});
 const service=moduleAt('lib/server/booking-phase2.ts',{tmaxxCostMappings:async()=>({options:[{id:'123',name:'Ocean freight',firmName:'CBI'}],checkedAt:'now'}),isQuoteSummary,AppError,db,digest,runtime,ownBooking,extractBookingFile:async()=>extraction(),extractionDocument,getExtraction,assessExtraction,bookingExtractionSchema,bookingSchema,bookingLifecycle,costDecisionSchema,costTotal,matchBooking},['attachInbox','phase2Workspace','saveCosts','readInbox']);
 function booking(id=randomUUID(),owner='alice'){sql.prepare('INSERT INTO booking_handovers(id,owner,reference_key,revision,data,created_at,updated_at) VALUES(?,?,?,1,?,?,?)').run(id,owner,id,JSON.stringify({...emptyBooking,salesReference:id,bookingNumber:'BK123'}),'now','now');return id;}
 async function inbox(result=extraction(),owner='alice'){const id=randomUUID(),bytes=new TextEncoder().encode('%PDF-'+id).buffer;objects.set(id,bytes);sql.prepare("INSERT INTO booking_inbox(id,owner,filename,mime,size,hash,object_key,source_reference,created_at,status,extraction_id,result,model) VALUES(?,?,?,'application/pdf',?,?,?,?,?,'ready',?,?,'test')").run(id,owner,'a.pdf',bytes.byteLength,await digest(bytes),id,'mail','now',randomUUID(),JSON.stringify(result));return id;}
 return {sql,service,booking,inbox,objects,onBeforeBatch:fn=>{beforeBatch=fn;}};
}
test('automatic matching attaches atomically; retry preserves one document, provenance and lifecycle',async()=>{
 const x=setup(),b=x.booking(),id=await x.inbox();await x.service.readInbox(id,'alice');assert.equal(x.sql.prepare('SELECT booking_id FROM booking_inbox').get().booking_id,b);await x.service.readInbox(id,'alice');assert.equal(x.sql.prepare('SELECT count(*) n FROM operation_documents').get().n,1);assert.equal((await x.service.phase2Workspace(b,'alice')).lifecycle,'confirmation_received');x.sql.close();
});
test('cross-owner attachment denied, ambiguity not auto linked, manual reason required',async()=>{
 const x=setup(),b=x.booking(),other=x.booking(undefined,'bob'),id=await x.inbox();await assert.rejects(x.service.attachInbox(id,'alice',other,'manual','Kaynak kontrol edildi.',null),e=>e.status===404);await assert.rejects(x.service.attachInbox(id,'bob',other,'manual','Kaynak kontrol edildi.',null),e=>e.status===404);x.booking();await x.service.readInbox(id,'alice');assert.equal(x.sql.prepare('SELECT status FROM booking_inbox').get().status,'ready');await assert.rejects(x.service.attachInbox(id,'alice',b,'manual','',null));await x.service.attachInbox(id,'alice',b,'manual','Kaynak belge referansını kontrol ettim.',null);x.sql.close();
});
test('changed booking snapshot aborts attach with no orphan document',async()=>{
 const x=setup(),b=x.booking(),id=await x.inbox();x.onBeforeBatch(()=>x.sql.prepare('UPDATE booking_handovers SET revision=revision+1 WHERE id=?').run(b));await assert.rejects(x.service.attachInbox(id,'alice',b,'automatic','',null),e=>e.status===409);assert.equal(x.sql.prepare('SELECT count(*) n FROM operation_documents').get().n,0);assert.equal(x.sql.prepare('SELECT status FROM booking_inbox').get().status,'ready');x.sql.close();
});
test('tampered inbox source blocked and revision requires explicit owned predecessor',async()=>{
 const x=setup(),b=x.booking(),id=await x.inbox();const bytes=x.objects.get(id);x.objects.set(id,new ArrayBuffer(0));await assert.rejects(x.service.attachInbox(id,'alice',b,'automatic','',null),e=>e.status===409);x.objects.set(id,bytes);await x.service.attachInbox(id,'alice',b,'automatic','',null);const previous=x.sql.prepare('SELECT id FROM operation_documents').get().id;
 const revision=await x.inbox(extraction('booking_revision'));await assert.rejects(x.service.attachInbox(revision,'alice',b,'manual','Revizyon kaynağını kontrol ettim.',null));await x.service.attachInbox(revision,'alice',b,'manual','Revizyon kaynağını kontrol ettim.',previous);assert.equal((await x.service.phase2Workspace(b,'alice')).lifecycle,'revision_received');x.sql.close();
});
async function quoteSetup(){const x=setup(),b=x.booking(),r=extraction('quote');r.commercial={lines:[{description:'Ocean freight',category:'freight',amount:'1250.25',currency:'USD',basis:'container',basisText:'40HC',quantity:'2',source:'Ocean freight USD 1250.25 per 40HC, 2 containers',page:1,confidence:.99}],validity:[proof('31 October')],freeTime:[],exclusions:[],conditions:[]};const id=await x.inbox(r);await x.service.attachInbox(id,'alice',b,'manual','Alış teklifinin kaynağını kontrol ettim.',null);const s=await x.service.phase2Workspace(b,'alice'),d=s.documents[0];const input={revision:0,documentId:d.id,extractionId:d.extraction_id,evidenceRevision:s.evidenceRevision,verified:true,reason:'Alış fiyatı, miktar ve koşulları kontrol ettim.',lines:[{index:0,quantity:'2',tariffCode:'',tariffName:'',tariffVerified:false}]};return {...x,b,input};}
test('expected costs persist source, exact amount, conditions; retry cannot duplicate',async()=>{const x=await quoteSetup();const saved=await x.service.saveCosts(x.b,'alice',x.input);assert.equal(saved.costs.data.lines[0].total,'2500.5');assert.equal(saved.costs.data.terms.validity[0].page,1);await assert.rejects(x.service.saveCosts(x.b,'alice',x.input),e=>e.status===409);assert.equal(x.sql.prepare('SELECT count(*) n FROM booking_cost_events').get().n,1);await assert.rejects(x.service.saveCosts(x.b,'bob',x.input),e=>e.status===404);x.sql.close();});
test('costs reject unverified tariff, duplicate lines, stale source and concurrent evidence',async()=>{const x=await quoteSetup();await assert.rejects(x.service.saveCosts(x.b,'alice',{...x.input,lines:[{...x.input.lines[0],tariffCode:'invented'}]}));await assert.rejects(x.service.saveCosts(x.b,'alice',{...x.input,lines:[...x.input.lines,...x.input.lines]}));await assert.rejects(x.service.saveCosts(x.b,'alice',{...x.input,extractionId:randomUUID()}),e=>e.status===409);x.onBeforeBatch(()=>x.sql.prepare('UPDATE booking_handovers SET evidence_revision=evidence_revision+1 WHERE id=?').run(x.b));await assert.rejects(x.service.saveCosts(x.b,'alice',x.input),e=>e.status===409);assert.equal(x.sql.prepare('SELECT count(*) n FROM booking_cost_events').get().n,0);x.sql.close();});

test('CMA quote section amounts including converted BL subtotal are not additional costs',()=>{
 const base={category:'surcharge',amount:'20',currency:'GBP',basis:'bl',basisText:'BL',quantity:null,source:'Charges payable as per freight 20 GBP',page:1,confidence:1};
 const value=separateQuoteSummaries({lines:[{...base,description:'Charges payable as per freight'},{...base,description:'Charges payable at Import',amount:'217',basis:'container'},{...base,description:'Advanced Manifest Declaration Fee',amount:'27',currency:'USD'}],conditions:[],validity:[],exclusions:[],freeTime:[]});
 assert.equal(value.lines.length,1);assert.equal(value.lines[0].currency,'USD');assert.equal(value.conditions.length,2);assert.ok(isQuoteSummary('Charges payable at Import'));assert.equal(isQuoteSummary('Terminal Handling Charge'),false);
});

test('cost definitions exclude inactive/non-sea items and reject conflicting identities',()=>{
 const row={id:123,name:'Ocean freight',isActive:true,isSea:true,firm:{name:'CBI'}};
 assert.deepEqual(costMappings([row,{...row,id:124,isActive:false},{...row,id:125,isSea:false}]),[{id:'123',name:'Ocean freight',firmName:'CBI'}]);
 assert.throws(()=>costMappings([row,{...row,name:'Other'}]));
});
test('cost mapping is verified against current platform definitions before persistence',async()=>{
 const x=await quoteSetup();const line={...x.input.lines[0],tariffCode:'123',tariffName:'Changed',tariffVerified:true};
 await assert.rejects(x.service.saveCosts(x.b,'alice',{...x.input,lines:[line]}),e=>e.status===409);
 await x.service.saveCosts(x.b,'alice',{...x.input,lines:[{...line,tariffName:'Ocean freight'}]});
 const state=await x.service.phase2Workspace(x.b,'alice');assert.equal(state.costs.data.lines[0].tmaxxMapping.id,123);assert.equal(state.costs.data.lines[0].tmaxxMapping.targetField,'invoiceItemType');x.sql.close();
});
