import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileDocumentTotals} from '../lib/document-evidence.ts';
import {validate} from '../lib/domain.ts';

const numbers=['MSNU8644653','MSMU5684659'];
const documents=[{filename:'first.pdf',role:'instruction'},{filename:'second.pdf',role:'instruction'}];
const field=(value,source)=>({value,source,confidence:value===null?0:1});
const labels={packageCount:'Kap adedi',grossWeightKg:'Brüt ağırlık (kg)',netWeightKg:'Net ağırlık (kg)'};
const coverage=key=>`Belge çelişkisi · ${labels[key]}: konteyner kapsamları eksik veya çakışıyor; toplam doğrulanmalı.`;
function fixture(){
 const values=[['744','23320','22893.36'],['771','22450','21979.98']];
 const cargoLines=values.map((values,index)=>{
  const source=documents[index].filename+' page 1: ';
  return {containerNumber:field(numbers[index],source+'KONT. NO '+numbers[index]),description:field('PVC PROFILES',source+'PVC PROFILES'),packageType:field('PAKET',source+'PAKET'),...Object.fromEntries(Object.keys(labels).map((key,i)=>[key,field(values[i],source+labels[key]+': '+values[i])]))};
 });
 const containers=cargoLines.map(row=>({containerNumber:row.containerNumber,containerType:field('40HC','Source'),packageCount:row.packageCount,grossWeightKg:row.grossWeightKg}));
 return {schemaVersion:8,documentType:'instruction',fields:Object.fromEntries(Object.keys(labels).map(key=>[key,field(null,'Çelişkili belge değerleri; kaynak sayfaları inceleyin.')])),containers,cargoLines,containerCount:2,cargoLineCount:2,issues:Object.keys(labels).map(coverage),observations:Object.keys(labels).map((key,i)=>({key,value:values[1][i],source:cargoLines[1][key].source,documentIndex:2,page:1,scope:'shipment',containerNumbers:[numbers[1]]}))};
}

test('partial page audit recovers two source-linked HBL totals and removes only resolved coverage warnings',()=>{
 const ex=fixture(),before=structuredClone(ex);ex.issues.push('An unrelated source disagreement');before.issues=[...ex.issues];
 const result=reconcileDocumentTotals(ex,documents);
 assert.deepEqual(ex,before);
 assert.equal(result.fields.packageCount.value,'1515');
 assert.equal(result.fields.grossWeightKg.value,'45770');
 assert.equal(result.fields.netWeightKg.value,'44873.34');
 assert.deepEqual(result.issues,['An unrelated source disagreement']);
 assert.deepEqual(validate({...result,issues:[]},['packageCount','grossWeightKg']),[]);
 assert.deepEqual(reconcileDocumentTotals(result,documents),result);
 assert.deepEqual(result.cargoLines,ex.cargoLines);assert.deepEqual(result.containers,ex.containers);
});

test('same-container disagreement remains blocked instead of selecting the populated row',()=>{
 const ex=fixture();ex.observations[0].value='772';
 const result=reconcileDocumentTotals(ex,documents);
 assert.equal(result.fields.packageCount.value,null);
 assert.ok(result.issues.some(issue=>/772.*771/.test(issue)));
});

test('whole-shipment disagreement is not silently replaced by the row sum',()=>{
 const ex=fixture();ex.fields.packageCount=field('1500','Printed total 1500');
 const result=reconcileDocumentTotals(ex,documents);
 assert.ok(result.issues.some(issue=>issue.includes('sevkiyat toplamı konteyner toplamlarıyla eşleşmiyor')));
 assert.notEqual(result.fields.packageCount.value,'1515');
});

for(const scenario of ['low confidence','no quote','different page','missing container link','duplicate document name','mbl reference','master scope','unknown scope'])test('incomplete evidence stays blocked: '+scenario,()=>{
 const ex=fixture(),docs=structuredClone(documents);
 if(scenario==='low confidence'){ex.containers[0].packageCount.confidence=.8;ex.cargoLines[0].packageCount.confidence=.8;}
 if(scenario==='no quote'){ex.containers[0].packageCount.source='first.pdf page 1';ex.cargoLines[0].packageCount.source='first.pdf page 1';}
 if(scenario==='different page'){ex.containers[0].packageCount.source='first.pdf page 2: 744';ex.cargoLines[0].packageCount.source='first.pdf page 2: 744';}
 if(scenario==='missing container link'){ex.containers[0].containerNumber.source='';ex.cargoLines[0].containerNumber.source='';}
 if(scenario==='duplicate document name')docs.push({...docs[0]});
 if(scenario==='mbl reference')docs[0].role='mbl-parties';
 if(scenario==='master scope'||scenario==='unknown scope')ex.observations.push({key:'packageCount',value:'744',source:'744',documentIndex:1,page:1,scope:scenario==='master scope'?'master':'unknown',containerNumbers:[numbers[0]]});
 const result=reconcileDocumentTotals(ex,docs);
 assert.equal(result.fields.packageCount.value,null);assert.ok(result.issues.includes(coverage('packageCount')));
});

test('multiple cargo lines never become duplicate container totals',()=>{
 const ex=fixture();ex.cargoLines.push(structuredClone(ex.cargoLines[0]));ex.cargoLineCount=3;
 const result=reconcileDocumentTotals(ex,documents);
 assert.equal(result.fields.packageCount.value,'1515');
 assert.equal(result.fields.netWeightKg.value,null);assert.ok(result.issues.includes(coverage('netWeightKg')));
});

test('duplicate containers and unrelated document types cannot be repaired by summing',()=>{
 const ex=fixture();ex.containers.push(structuredClone(ex.containers[0]));
 assert.deepEqual(reconcileDocumentTotals(ex,documents),ex);
 ex.documentType='other';assert.deepEqual(reconcileDocumentTotals(ex,documents),ex);
});

test('audited group total is counted once; overlapping audited scopes remain blocked',()=>{
 const ex=fixture();ex.observations=[{key:'packageCount',value:'1515',source:'TOTAL 1515',documentIndex:1,page:1,scope:'shipment',containerNumbers:numbers}];
 assert.equal(reconcileDocumentTotals(ex,documents).fields.packageCount.value,'1515');
 ex.observations.push({key:'packageCount',value:'744',source:'744',documentIndex:1,page:1,scope:'shipment',containerNumbers:[numbers[0]]});
 assert.equal(reconcileDocumentTotals(ex,documents).fields.packageCount.value,null);
});
