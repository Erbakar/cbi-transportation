import {separateQuoteSummaries} from '../lib/operations/quote-costs.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import {compareBookingRevision} from '../lib/operations/booking-revision.ts';
import {bookingSchema,assessBooking,emptyBooking,bookingFields,supplementaryBookingFields} from '../lib/operations/booking.ts';
const domainSource=fs.readFileSync('lib/operations/booking-extraction.ts','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
const domainJs=ts.transpileModule(domainSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {bookingExtractionSchema,extractableFields,selectedBookingFields}=new Function('z','bookingSchema',domainJs+';return{bookingExtractionSchema,extractableFields,selectedBookingFields}')(z,bookingSchema);
const policySource=fs.readFileSync('lib/operations/document-policy.ts','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
const policyJs=ts.transpileModule(policySource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {evaluateDocument,authorizeSelection,authorizeDraftFill}=new Function('selectedBookingFields','extractableFields','bookingFields','supplementaryBookingFields',policyJs+';return{evaluateDocument,authorizeSelection,authorizeDraftFill}')(selectedBookingFields,extractableFields,bookingFields,supplementaryBookingFields);
function result(){return{documentType:'booking_request',fields:extractableFields.map(key=>({key,value:key==='customer'?'Acme':null,source:key==='customer'?'Customer: Acme':'',page:key==='customer'?1:null,confidence:key==='customer'?.9:0})),issues:[]}}
const source=fs.readFileSync('lib/server/booking-extraction.ts','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
function setup(output=result()){
 const sql=new DatabaseSync(':memory:');for(const f of ['0006_booking_handover.sql','0007_operation_documents.sql','0008_booking_extractions.sql','0009_document_policy.sql','0010_booking_phase2.sql'])sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
 sql.prepare('INSERT INTO booking_handovers(id,owner,reference_key,revision,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('b','alice','Q1',1,JSON.stringify({...emptyBooking,salesReference:'Q1'}),'now','now');
 sql.prepare('INSERT INTO operation_documents VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('d','b','alice','d',1,null,'booking_request','a.pdf','application/pdf',8,createHash('sha256').update('%PDF-1.4').digest('hex'),'key','mail','now');
 let beforeBatch=()=>{};
 const db=()=>({prepare(query){return{bind(...args){return{query,args,first:async()=>sql.prepare(query).get(...args)||null,all:async()=>({results:sql.prepare(query).all(...args)}),run:async()=>({meta:{changes:Number(sql.prepare(query).run(...args).changes)}})}}}},async batch(commands){beforeBatch();sql.exec('BEGIN');try{const results=commands.map(c=>({meta:{changes:Number(sql.prepare(c.query).run(...c.args).changes)}}));sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}});
 class AppError extends Error{constructor(message,status=400){super(message);this.status=status}}
 const ownBooking=async(id,owner)=>{if(!sql.prepare('SELECT id FROM booking_handovers WHERE id=? AND owner=?').get(id,owner))throw new AppError('missing',404)};
 let calls=0;const runtime=()=>({GEMINI_API_KEY:'test-only',BUCKET:{get:async key=>({arrayBuffer:async()=>new TextEncoder().encode(key==='key2'?'%PDF-1.4 second':'%PDF-1.4').buffer})}});
 const fetch=async()=>{calls++;return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(output)}]}}]})};
 const service=new Function('AppError','db','runtime','ownBooking','bookingExtractionSchema','extractableFields','selectedBookingFields','bookingSchema','assessBooking','fetch','evaluateDocument','authorizeSelection','authorizeDraftFill','digest','compareBookingRevision','separateQuoteSummaries',js+';return{extractionDocument,getExtraction,readBookingDocument,applyBookingExtraction,assessExtraction}')(AppError,db,runtime,ownBooking,bookingExtractionSchema,extractableFields,selectedBookingFields,bookingSchema,assessBooking,fetch,evaluateDocument,authorizeSelection,authorizeDraftFill,async bytes=>createHash('sha256').update(Buffer.from(bytes)).digest('hex'),compareBookingRevision,separateQuoteSummaries);
 return{sql,service,calls:()=>calls,onBeforeBatch:fn=>{beforeBatch=fn}};
}
test('duplicate/missing evidence rejected and unrelated document cannot be applied',()=>{const r=result();r.fields[1]=r.fields[0];assert.equal(bookingExtractionSchema.safeParse(r).success,false);const noSource=result();noSource.fields[0].source='';assert.equal(bookingExtractionSchema.safeParse(noSource).success,false);assert.throws(()=>selectedBookingFields({...emptyBooking,salesReference:'Q'}, {...result(),documentType:'other'},['customer']))});
test('explicit selection preserves unrelated fields, no automatic confirmation',()=>{const draft={...emptyBooking,salesReference:'Q',shipper:'Existing'};const next=selectedBookingFields(draft,result(),['customer']);assert.equal(next.customer,'Acme');assert.equal(next.shipper,'Existing');assert.equal(next.salesReference,'Q');assert.equal(assessBooking(next).status,'incomplete');assert.throws(()=>selectedBookingFields(draft,result(),['customer','customer']))});
test('extract, cached retry, selective apply and atomic provenance',async()=>{const {sql,service,calls}=setup();const doc=await service.extractionDocument('b','d','alice');const ex=await service.readBookingDocument(doc);assert.equal((await service.readBookingDocument(doc)).id,ex.id);assert.equal(calls(),1);const booking=await service.applyBookingExtraction(doc,'alice',ex.id,1,['customer'],['customer'],'Kaynak dosya kontrol edildi.',2);assert.equal(booking.draft.customer,'Acme');assert.equal(booking.revision,2);assert.equal(sql.prepare('SELECT count(*) n FROM booking_handover_events').get().n,1);assert.equal(sql.prepare('SELECT document_id FROM booking_extraction_applications').get().document_id,'d');await assert.rejects(service.applyBookingExtraction(doc,'alice',ex.id,1,['customer'],['customer'],'Kaynak dosya kontrol edildi.',2),e=>e.status===409);sql.close()});
test('old source version and other owner cannot apply',async()=>{const {sql,service}=setup();await assert.rejects(service.extractionDocument('b','d','bob'),e=>e.status===404);const doc=await service.extractionDocument('b','d','alice');const ex=await service.readBookingDocument(doc);sql.prepare('INSERT INTO operation_documents VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('d2','b','alice','d',2,'d','booking_revision','b.pdf','application/pdf',9,'hash2','key2','mail','now');await assert.rejects(service.applyBookingExtraction(doc,'alice',ex.id,1,['customer'],['customer'],'Kaynak dosya kontrol edildi.',2),e=>e.status===409);assert.equal(sql.prepare('SELECT count(*) n FROM booking_extraction_applications').get().n,0);sql.close()});
test('invalid model output fails without changing booking',async()=>{const {sql,service}=setup({documentType:'booking_confirmation',fields:[],issues:[]});const doc=await service.extractionDocument('b','d','alice');await assert.rejects(service.readBookingDocument(doc),e=>e.status===502);assert.equal(sql.prepare('SELECT status FROM booking_document_extractions').get().status,'failed');assert.equal(sql.prepare('SELECT revision FROM booking_handovers').get().revision,1);sql.close()});
test('parallel read requests use one model call and expired leases can recover',async()=>{const {sql,service,calls}=setup();const doc=await service.extractionDocument('b','d','alice');const outcomes=await Promise.allSettled([service.readBookingDocument(doc),service.readBookingDocument(doc)]);assert.equal(calls(),1);assert.ok(outcomes.some(r=>r.status==='fulfilled'));assert.equal(sql.prepare('SELECT revision FROM booking_handovers').get().revision,1);sql.prepare("UPDATE booking_document_extractions SET status='reading',lease_until=0,result=NULL").run();await service.readBookingDocument(doc);assert.equal(calls(),2);sql.close()});
test('invalid equipment proposals cannot bypass booking validation',()=>{const r=result();const field=r.fields.find(f=>f.key==='equipmentCount');Object.assign(field,{value:'2.5',source:'2.5 containers',page:1,confidence:.9});assert.throws(()=>selectedBookingFields({...emptyBooking,salesReference:'Q'},r,['equipmentCount']));Object.assign(field,{value:'2'});assert.equal(selectedBookingFields({...emptyBooking,salesReference:'Q'},r,['equipmentCount']).equipmentCount,2)});
function input(overrides={}){return{result:result(),draft:{...emptyBooking,salesReference:'Q'},declaredType:'booking_request',current:true,integrity:'verified',...overrides}}
test('model confidence cannot raise control score or bypass source verification',()=>{const low=result(),high=result();low.fields[0].confidence=.2;high.fields[0].confidence=1;assert.equal(evaluateDocument(input({result:low})).controlScore,evaluateDocument(input({result:high})).controlScore);const a=evaluateDocument(input({result:high}));assert.ok(a.controlScore<=60);assert.throws(()=>authorizeSelection(a,['customer'],[],''));assert.doesNotThrow(()=>authorizeSelection(a,['customer'],['customer'],''));});
test('source integrity and stale versions are hard blockers even with human attestation',()=>{for(const overrides of [{integrity:'mismatch'},{integrity:'missing'},{integrity:'unavailable'},{current:false}]){const a=evaluateDocument(input(overrides));assert.equal(a.controlScore,0);assert.throws(()=>authorizeSelection(a,['customer'],['customer'],'Kontrol ettim ve uygun buldum.'))}});
test('conflicts, low confidence, type mismatch and model issues require reason',()=>{const low=result();low.fields[0].confidence=.1;for(const overrides of [{draft:{...emptyBooking,salesReference:'Q',customer:'Other'}},{declaredType:'booking_confirmation'},{result:{...result(),issues:['İki farklı yük var.']}},{result:low}]){const a=evaluateDocument(input(overrides));assert.throws(()=>authorizeSelection(a,['customer'],['customer'],''));assert.doesNotThrow(()=>authorizeSelection(a,['customer'],['customer'],'Orijinal belgeden kontrol edildi.'))}});
test('cross-document conflict has evidence and requires reason',()=>{const peer=result();peer.fields[0].value='Another customer';const a=evaluateDocument(input({peers:[{documentId:'peer',documentType:'booking_confirmation',result:peer}]}));assert.equal(a.fields[0].peerConflicts[0].documentId,'peer');assert.throws(()=>authorizeSelection(a,['customer'],['customer'],''));});
test('server rejects unchecked source and altered object hash',async()=>{const {sql,service}=setup();const doc=await service.extractionDocument('b','d','alice');const ex=await service.readBookingDocument(doc);await assert.rejects(service.applyBookingExtraction(doc,'alice',ex.id,1,['customer'],[],'',2),e=>e.status===422);doc.hash='tampered';await assert.rejects(service.applyBookingExtraction(doc,'alice',ex.id,1,['customer'],['customer'],'Belgeyi kontrol ettim.',2),e=>e.status===422);assert.equal(sql.prepare('SELECT revision FROM booking_handovers').get().revision,1);sql.close()});
test('new evidence arriving between assessment and save rejects stale decision atomically',async()=>{const {sql,service,onBeforeBatch}=setup();const doc=await service.extractionDocument('b','d','alice');const ex=await service.readBookingDocument(doc);onBeforeBatch(()=>sql.prepare('INSERT INTO operation_documents VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('peer','b','alice','peer',1,null,'quote','q.pdf','application/pdf',9,'peerhash','peerkey','mail','now'));await assert.rejects(service.applyBookingExtraction(doc,'alice',ex.id,1,['customer'],['customer'],'Kaynak dosya kontrol edildi.',2),e=>e.status===409);assert.equal(sql.prepare('SELECT revision FROM booking_handovers').get().revision,1);assert.equal(sql.prepare('SELECT count(*) n FROM booking_handover_events').get().n,0);assert.equal(sql.prepare('SELECT count(*) n FROM booking_extraction_applications').get().n,0);sql.close()});
test('coverage stays separate and conflict lowers control score',()=>{const good=evaluateDocument(input());assert.deepEqual(good.coverage,{present:1,total:16});assert.equal(good.controlScore,60);const conflict=evaluateDocument(input({draft:{...emptyBooking,salesReference:'Q',customer:'Different'}}));assert.ok(conflict.controlScore<good.controlScore);assert.equal(conflict.authenticity,'unverified')});

test('automatic draft fill maximizes eligible fields without claiming verification', async()=>{
 const r=result(); const values={customer:'Acme',shipper:'Exporter',loadPort:'Ambarlı',dischargePort:'Hamburg',equipmentType:'40HC',equipmentCount:'2',incoterm:'FOB',freightPayment:'prepaid',bookingNumber:'BK-1',vessel:'VESSEL',voyage:'V01',shipperAddress:'Exporter Street',consigneeName:'Buyer',consigneeAddress:'Buyer Street',notifyName:'Notify Co',notifyAddress:'Notify Street'};
 for(const field of r.fields) Object.assign(field,{value:values[field.key],source:`${field.key}: ${values[field.key]}`,page:1,confidence:.98});
 const a=evaluateDocument(input({result:r}));assert.equal(a.workflow.autoFill,16);assert.equal(a.workflow.total,19);assert.equal(a.workflow.afterFill,17);
 const {sql,service}=setup(r);const doc=await service.extractionDocument('b','d','alice');const ex=await service.readBookingDocument(doc);
 const b=await service.applyBookingExtraction(doc,'alice',ex.id,1,extractableFields,[],'',2,'draft');
 assert.equal(b.draft.equipmentCount,2);assert.equal(b.draft.shipper,'Exporter');assert.equal(b.assessment.status,'incomplete');
 const audit=JSON.parse(sql.prepare('SELECT decision FROM booking_extraction_applications').get().decision);
 assert.equal(audit.verification.verificationMethod,'automatic_draft');assert.deepEqual(audit.verification.sourceVerifiedFields,[]);assert.equal(audit.verification.sourceStatus,'unverified');
 const refreshed=evaluateDocument(input({result:r,draft:b.draft}));assert.equal(refreshed.workflow.autoFill,0);assert.equal(refreshed.workflow.filled,17);sql.close();
});
test('automatic draft never overwrites existing values and cannot bypass exceptions',()=>{
 const equal=evaluateDocument(input({draft:{...emptyBooking,salesReference:'Q',customer:'Acme'}}));assert.equal(equal.fields[0].action,'keep');assert.throws(()=>authorizeDraftFill(equal,['customer']));
 const low=result();low.fields[0].confidence=.4;
 const unquoted=result();unquoted.fields[0].source='No customer shown';
 const peer=result();peer.fields[0].value='Different';
 for(const override of [{draft:{...emptyBooking,salesReference:'Q',customer:'Different'}},{result:low},{result:unquoted},{result:{...result(),issues:['Belirsiz kayıt']}},{declaredType:'booking_confirmation'},{current:false},{integrity:'mismatch'},{peers:[{documentId:'p',documentType:'quote',result:peer}]}]) {
  const a=evaluateDocument(input(override));assert.equal(a.workflow.autoFill,0);assert.throws(()=>authorizeDraftFill(a,['customer']));
 }
});
test('equipment is not automatically combined when type or count needs review',()=>{
 const r=result();Object.assign(r.fields.find(f=>f.key==='equipmentCount'),{value:'2',source:'2 containers',page:1,confidence:.99});
 const a=evaluateDocument(input({result:r}));assert.equal(a.fields.find(f=>f.key==='equipmentCount').action,'review');assert.equal(a.fields.find(f=>f.key==='customer').action,'fill_draft');
});
test('automatic draft uses evidence revision lock and preserves data on conflict',async()=>{
 const {sql,service,onBeforeBatch}=setup();const doc=await service.extractionDocument('b','d','alice');const ex=await service.readBookingDocument(doc);
 onBeforeBatch(()=>sql.prepare('UPDATE booking_handovers SET evidence_revision=evidence_revision+1').run());
 await assert.rejects(service.applyBookingExtraction(doc,'alice',ex.id,1,['customer'],[],'',2,'draft'),e=>e.status===409);
 assert.equal(JSON.parse(sql.prepare('SELECT data FROM booking_handovers').get().data).customer,'');assert.equal(sql.prepare('SELECT count(*) n FROM booking_extraction_applications').get().n,0);sql.close();
});

test('old eight-field extractions retain their values and new fields stay missing',()=>{
 const legacy=result();legacy.fields=legacy.fields.slice(0,8);const parsed=bookingExtractionSchema.parse(legacy);
 assert.equal(parsed.fields.length,16);assert.equal(parsed.fields[0].value,'Acme');assert.equal(parsed.fields.find(f=>f.key==='vessel').value,null);
});
test('schedule evidence accepts explicit dates but rejects source-less and fabricated values',()=>{
 const r=result();r.schedule={etd:{value:'24 July 2026',source:'ETD: 24 July 2026',page:2,confidence:.9}};
 assert.equal(bookingExtractionSchema.parse(r).schedule.etd.page,2);
 r.schedule.etd.source='';assert.equal(bookingExtractionSchema.safeParse(r).success,false);
 r.schedule={atd:{value:'24 July 2026',source:'ETD: 24 July 2026',page:2,confidence:.9}};
 assert.equal(bookingExtractionSchema.safeParse(r).success,false);
});
test('party address cannot auto-fill when its name conflicts or is absent',()=>{
 for(const name of [null,'Different Exporter']){const r=result();Object.assign(r.fields.find(f=>f.key==='shipperAddress'),{value:'New Street',source:'New Street',page:1,confidence:.99});if(name)Object.assign(r.fields.find(f=>f.key==='shipper'),{value:name,source:name,page:1,confidence:.99});
 const a=evaluateDocument(input({result:r,draft:{...emptyBooking,salesReference:'Q',shipper:'Existing Exporter'}}));assert.equal(a.fields.find(f=>f.key==='shipperAddress').action,'review');}
});
test('multiple documents complete complementary fields while retaining existing data and provenance',async()=>{
 const {sql,service}=setup();const doc=await service.extractionDocument('b','d','alice');const first=await service.readBookingDocument(doc);
 await service.applyBookingExtraction(doc,'alice',first.id,1,['customer'],[],'',2,'draft');
 sql.prepare('INSERT INTO operation_documents VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('d2','b','alice','d2',1,null,'booking_request','second.pdf','application/pdf',16,createHash('sha256').update('%PDF-1.4 second').digest('hex'),'key2','mail2','now');
 const second=result();second.fields[0].value=null;second.fields[0].source='';second.fields[0].page=null;
 Object.assign(second.fields.find(f=>f.key==='vessel'),{value:'SHIP A',source:'Vessel: SHIP A',page:1,confidence:.99});
 sql.prepare("INSERT INTO booking_document_extractions(document_id,id,status,lease_until,result,model,created_at) VALUES(?,?,'ready',0,?,'test','now')").run('d2','ex2',JSON.stringify(second));
 const doc2=await service.extractionDocument('b','d2','alice');const evidence=sql.prepare('SELECT evidence_revision FROM booking_handovers').get().evidence_revision;
 const saved=await service.applyBookingExtraction(doc2,'alice','ex2',2,['vessel'],[],'',evidence,'draft');
 assert.equal(saved.draft.customer,'Acme');assert.equal(saved.draft.vessel,'SHIP A');assert.equal(sql.prepare('SELECT count(*) n FROM booking_extraction_applications').get().n,2);sql.close();
});

test('partial requests cannot detach an address from the party being auto-filled',()=>{
 const r=result();for(const [key,value] of [['shipper','Exporter'],['shipperAddress','Exporter Street']]) Object.assign(r.fields.find(f=>f.key===key),{value,source:value,page:1,confidence:.99});
 const a=evaluateDocument(input({result:r}));assert.throws(()=>authorizeDraftFill(a,['shipperAddress']));assert.doesNotThrow(()=>authorizeDraftFill(a,['shipper','shipperAddress']));
});

test('revision report reads the owned explicit predecessor and survives extraction reload',async()=>{
 const current=result();current.documentType='booking_confirmation';
 current.schedule={etd:{value:'24 July 2026',source:'ETD 24 July 2026',page:2,confidence:.9}};
 const {sql,service}=setup(current);
 sql.prepare("UPDATE operation_documents SET type='booking_confirmation' WHERE id='d'").run();
 const previous=await service.extractionDocument('b','d','alice');const ex=await service.readBookingDocument(previous);
 sql.prepare('INSERT INTO operation_documents VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('d2','b','alice','d',2,'d','booking_confirmation','second.pdf','application/pdf',16,createHash('sha256').update('%PDF-1.4 second').digest('hex'),'key2','revision','now');
 const revised={...current,documentType:'booking_revision',schedule:{etd:{value:'27 July 2026',source:'ETD 27 July 2026',page:3,confidence:.9}}};
 sql.prepare("INSERT INTO booking_document_extractions(document_id,id,status,lease_until,result,model,created_at) VALUES(?,?,'ready',0,?,'test','now')").run('d2','ex2',JSON.stringify(revised));
 const doc=await service.extractionDocument('b','d2','alice');const reloaded=await service.getExtraction(doc);
 const assessment=await service.assessExtraction(doc,reloaded);
 assert.equal(assessment.revisionReport.previousDocumentId,'d');
 assert.equal(assessment.revisionReport.changes.find(c=>c.key==='etd').before.value,'24 July 2026');
 assert.equal(assessment.revisionReport.changes.find(c=>c.key==='etd').after.page,3);
 const old=await service.assessExtraction(previous,ex);assert.ok(old.blockers.length);
 assert.equal(JSON.parse(sql.prepare('SELECT data FROM booking_handovers').get().data).vessel,'');
 sql.close();
});

test('reread archives success, invalidates old selections and restores it after failed refresh',async()=>{
 const output=result(),{sql,service,calls}=setup(output),doc=await service.extractionDocument('b','d','alice');
 const first=await service.readBookingDocument(doc);const second=await service.readBookingDocument(doc,true);
 assert.notEqual(first.id,second.id);assert.equal(calls(),2);assert.equal(sql.prepare('SELECT id FROM booking_extraction_history').get().id,first.id);
 await assert.rejects(service.applyBookingExtraction(doc,'alice',first.id,1,['customer'],['customer'],'Kaynak kontrol edildi.',2),e=>e.status===409);
 output.fields=[];await assert.rejects(service.readBookingDocument(doc,true),e=>e.status===502);
 assert.equal((await service.getExtraction(doc)).id,second.id);assert.equal(sql.prepare('SELECT count(*) n FROM booking_extraction_history').get().n,2);assert.equal(JSON.parse(sql.prepare('SELECT data FROM booking_handovers').get().data).customer,'');sql.close();
});

test('quote reading uses a focused commercial pass and separates converted section totals',async()=>{
 const r=result();r.documentType='quote';const base={category:'freight',amount:'1221',currency:'GBP',basis:'container',basisText:'40HC',quantity:null,source:'Ocean Freight 1221 GBP',page:1,confidence:1};r.commercial={lines:[{...base,description:'Ocean Freight'},{...base,description:'Charges payable at Import',amount:'217',source:'Charges payable at Import 217 GBP'}],validity:[],freeTime:[],exclusions:[],conditions:[]};
 const {sql,service,calls}=setup(r),doc=await service.extractionDocument('b','d','alice');sql.prepare("UPDATE operation_documents SET type='quote' WHERE id='d'").run();doc.type='quote';
 const ex=await service.readBookingDocument(doc);assert.equal(calls(),2);assert.equal(ex.result.commercial.lines.length,1);assert.equal(ex.result.commercial.conditions[0].source,'Charges payable at Import 217 GBP');sql.close();
});
