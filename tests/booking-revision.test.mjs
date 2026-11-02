import test from 'node:test';
import assert from 'node:assert/strict';
import { compareBookingRevision } from '../lib/operations/booking-revision.ts';
const field = (key,value,page=1) => ({ key,value,source:value || '',page:value ? page : null,confidence:.9 });
const doc = (fields=[],schedule) => ({documentType:'booking_confirmation',fields,issues:[],schedule});
test('explicit predecessor compares route, vessel, voyage, equipment and evidenced deadlines',()=>{
 const before=doc([field('vessel','SHIP A'),field('voyage','01'),field('loadPort','Ambarlı')],{etd:field('etd','21/07/2026 15:00 UTC')});
 const after=doc([field('vessel','SHIP B',2),field('voyage','02',2),field('loadPort',' AMBARLI ')],{etd:field('etd','24/07/2026 15:00 UTC',3)});
 const report=compareBookingRevision(after,before,'old');
 assert.equal(report.status,'compared');assert.equal(report.previousDocumentId,'old');
 assert.equal(report.changes.find(c=>c.key==='vessel').before.value,'SHIP A');
 assert.equal(report.changes.find(c=>c.key==='etd').after.page,3);
 assert.equal(report.changes.find(c=>c.key==='voyage').state,'changed');
});
test('missing and added dates stay distinct; absent values never imply removal',()=>{
 const report=compareBookingRevision(doc([], {vgmCutoff:field('vgmCutoff','20 July 10:00')}),doc([],{siCutoff:field('siCutoff','19 July')}),'old');
 assert.equal(report.changes.find(c=>c.key==='siCutoff').state,'not_found');
 assert.equal(report.changes.find(c=>c.key==='vgmCutoff').state,'added');
});
test('unread predecessor and unrelated request cannot appear as a successful comparison',()=>{
 assert.equal(compareBookingRevision(doc(),null,'old').status,'previous_unread');
 assert.equal(compareBookingRevision(doc(),null,null).status,'no_previous');
 assert.equal(compareBookingRevision({...doc(),documentType:'booking_request'},doc(),'old').status,'unsupported');
 assert.equal(compareBookingRevision(doc(),{...doc(),documentType:'quote'},'old').status,'unsupported');
});
test('legacy extractions and whitespace variants compare safely without fabricated schedule',()=>{
 const before=doc([field('vessel','SHIP A')]);const after=doc([field('vessel',' ship  a ')]);
 assert.deepEqual(compareBookingRevision(after,before,'old').changes,[]);
});
