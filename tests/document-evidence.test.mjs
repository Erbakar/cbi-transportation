import test from 'node:test';import assert from 'node:assert/strict';
import {evidenceConflicts,unallocatedCargoTotals} from '../lib/document-evidence.ts';
const obs=(key,value,page,scope='shipment')=>({key,value,page,scope,documentIndex:1,source:'Printed source '+value});
test('reports conflicting shipment volumes and voyages with page references',()=>{
 const results=evidenceConflicts([obs('volumeM3','44',2),obs('volumeM3','42.80',7),obs('voyage','066W',2),obs('voyage','066E',4)]);
 assert.equal(results.length,2);assert.match(results[0],/sayfa 2/);assert.match(results[0],/sayfa 7/);assert.match(results[1],/066W.*066E/);
});
test('formatting and master transit scope do not manufacture shipment conflicts',()=>{
 assert.deepEqual(evidenceConflicts([obs('volumeM3','44.000',2),obs('volumeM3','44',5),obs('grossWeightKg','2123',1),obs('grossWeightKg','4048.92',7,'master')]),[]);
});

test('zero packages are evidence and EXW/FCA remains a visible disagreement',()=>{
 const result=evidenceConflicts([obs('packageCount','33',1),obs('packageCount','0',8),obs('incoterm','EXW',1),obs('incoterm','FCA',6)]);
 assert.equal(result.length,2);assert.match(result[0],/0 .*sayfa 8/);assert.match(result[1],/EXW.*FCA/);
});

test('shipment totals cannot be duplicated across goods rows',()=>{
 const field={value:'788',source:'TOTAL PACKAGES 788',confidence:1};const ex={fields:{packageCount:field},cargoLines:[{packageCount:{...field}},{packageCount:{...field}}],issues:[]};unallocatedCargoTotals(ex);assert.ok(ex.cargoLines.every(r=>r.packageCount.value===null));assert.equal(ex.fields.packageCount.value,'788');assert.equal(ex.issues.length,1);
 const allocated={fields:{packageCount:field},cargoLines:[{packageCount:{value:'394',source:'ROW 1: 394',confidence:1}},{packageCount:{value:'394',source:'ROW 2: 394',confidence:1}}],issues:[]};unallocatedCargoTotals(allocated);assert.equal(allocated.issues.length,0);
});

// Distinct HBL totals are additive only when their container scopes are disjoint.
test('two container instructions retain separate quantities instead of false shipment conflicts',async()=>{
 const {scopedTotal}=await import('../lib/document-evidence.ts');
 const a={...obs('packageCount','771',1),containerNumbers:['MSMU5684659']};
 const b={...obs('packageCount','744',1),documentIndex:2,containerNumbers:['MSNU8644653']};
 const numbers=['MSMU5684659','MSNU8644653'];
 assert.deepEqual(evidenceConflicts([a,b],numbers),[]);
 assert.equal(scopedTotal([a,a,b],'packageCount',numbers).value,'1515');
 assert.equal(scopedTotal([a],'packageCount',numbers),null);
 assert.match(evidenceConflicts([a],numbers)[0],/kapsamları eksik veya çakışıyor/);
 assert.equal(evidenceConflicts([a,{...a,value:'772'},b],numbers).length,1);
 assert.equal(scopedTotal([a,{...a,value:'772'},b],'packageCount',numbers),null);
 assert.equal(evidenceConflicts([a,b,{...obs('packageCount','1500',2),documentIndex:3}],numbers).length,1);
 assert.deepEqual(evidenceConflicts([a,b,{...obs('packageCount','1515',2),documentIndex:3}],numbers),[]);
 assert.equal(scopedTotal([a,b,{...a,containerNumbers:numbers,value:'1515'}],'packageCount',numbers),null);
 assert.match(evidenceConflicts([a,b,{...a,containerNumbers:numbers,value:'1515'}],numbers)[0],/kapsamları eksik veya çakışıyor/);
 assert.equal(evidenceConflicts([obs('voyage','NT644R',1),{...obs('voyage','NT645R',1),containerNumbers:['MSNU8644653']}],numbers).length,1);
});
