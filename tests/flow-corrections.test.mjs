import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
import {normalizeManualNumber,normalizeManualFields} from '../lib/manual-number.ts';
import {applyManual} from '../lib/manual-extraction.ts';import {validate} from '../lib/domain.ts';
import {packageOption} from '../lib/inttra-reference.ts';
const bundled=await build({stdin:{contents:"export {manualSchema,emptyManual} from './lib/manual';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',packages:'external'});
const {manualSchema,emptyManual}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text.replace('from "zod"','from "'+import.meta.resolve('zod')+'"')).toString('base64'));
const f=value=>({value,source:'document page 1',confidence:1});
test('numeric user corrections accept decimal comma and grouped values without touching codes',()=>{
 for(const [input,expected] of [['21.979,98','21979.98'],['21,979.98','21979.98'],['21979,98','21979.98'],['21 979,98','21979.98'],['21\u202f979.98','21979.98'],['21979.980','21979.980'],['1.234','1.234'],['1.234.567','1234567'],['1,234,567','1234567'],['12.34,56','12.34,56'],['2 kg','2 kg'],['','']])assert.equal(normalizeManualNumber(input),expected,input);
 assert.deepEqual(normalizeManualFields({grossWeightKg:'22.450,000',hsCode:'39.16.20',containerNumber:'001,23'}),{grossWeightKg:'22450.000',hsCode:'39.16.20',containerNumber:'001,23'});
 const m=manualSchema.parse({...emptyManual,fieldOverrides:{grossWeightKg:'45.770,000'},cargoOverrides:[{index:0,preparedDescription:true,fields:{netWeightKg:'21.979,98',description:'PVC\nNET WEIGHT: 21.979,98 KG'}}]});
 assert.equal(m.fieldOverrides.grossWeightKg,'45770.000');assert.equal(m.cargoOverrides[0].fields.netWeightKg,'21979.98');assert.match(m.cargoOverrides[0].fields.description,/NET WEIGHT: 21979.98 KG/);
});
test('container OCR correction preserves source, cargo links, seal omission and observations on repeat application',()=>{
 const ex={fields:{},containers:[{containerNumber:f('MSMU5684650'),containerType:f('40 HC')},{containerNumber:f('MSNU8644653'),containerType:f('40 HC')}],cargoLines:[{containerNumber:f('MSMU5684650'),description:f('PVC')},{containerNumber:f('MSNU8644653'),description:f('Other')}],issues:[],containerCount:2,cargoLineCount:2,documentType:'instruction',observations:[{containerNumbers:['MSMU5684650'],source:'Original quote'}]};
 const before=JSON.stringify(ex),m={containerOverrides:[{containerNumber:'MSMU5684650',sourceIndex:0,correctedNumber:'MSMU5684659',omitSeal:true}],cargoOverrides:[{index:0,fields:{containerNumber:'MSMU5684650'}}]};
 const out=applyManual(ex,m);assert.equal(out.containers[0].containerNumber.value,'MSMU5684659');assert.equal(out.cargoLines[0].containerNumber.value,'MSMU5684659');assert.equal(out.cargoLines[1].containerNumber.value,'MSNU8644653');assert.deepEqual(out.omittedSeals,['MSMU5684659']);assert.equal(out.observations[0].containerNumbers[0],'MSMU5684659');assert.deepEqual(applyManual(out,m),out);assert.equal(JSON.stringify(ex),before);
 const stale=applyManual(ex,{containerOverrides:[{sourceIndex:0,containerNumber:'UNRELATED',correctedNumber:'MSMU5684659'}]});assert.ok(stale.issues.length);assert.equal(stale.containers[0].containerNumber.value,'MSMU5684650');
 const bad=applyManual(ex,{containerOverrides:[{sourceIndex:0,containerNumber:'MSMU5684650',correctedNumber:'INVALID'}]});assert.ok(validate(bad,[]).some(s=>s.includes('numara kontrolü')));
});
test('unnamed containers stay distinct and no cargo link is guessed',()=>{const ex={fields:{},containers:[{containerNumber:f(null)},{containerNumber:f(null)}],cargoLines:[{containerNumber:f(null)}],issues:[]};const out=applyManual(ex,{containerOverrides:[{containerNumber:'',sourceIndex:1,correctedNumber:'MSNU8644653'}]});assert.equal(out.containers[0].containerNumber.value,null);assert.equal(out.containers[1].containerNumber.value,'MSNU8644653');assert.equal(out.cargoLines[0].containerNumber.value,null);});
test('duplicate package labels use selected native codes and refuse stale mappings',()=>{
 const options=[{label:'Unit',value:'381'},{label:'UNIT',value:'430'},{label:'Unit',value:'431'},{label:'Package',value:'PK'}];
 assert.equal(packageOption(options,'Unit','431').value,'431');assert.equal(packageOption(options,'UNIT','430').value,'430');assert.equal(packageOption(options,'PAKET').value,'PK');assert.throws(()=>packageOption(options,'Unit'));assert.throws(()=>packageOption(options,'Unit','missing'));assert.throws(()=>packageOption(options,'Package','431'));
 const ex={fields:{},containers:[],cargoLines:[{packageType:f('Unit')}],issues:[]};const m=manualSchema.parse({...emptyManual,cargoOverrides:[{index:0,inttraPackageCode:'431',fields:{packageType:'Unit'}}]});assert.equal(applyManual(ex,m).cargoLines[0].inttraPackageCode.value,'431');assert.equal(ex.cargoLines[0].inttraPackageCode,undefined);
});
test('container correction refuses stale indexes and cross-container collisions',()=>{
 const ex={fields:{},containers:[{containerNumber:f('MSMU5684659')},{containerNumber:f('MSNU8644653')}],cargoLines:[{containerNumber:f('MSMU5684659')},{containerNumber:f('MSNU8644653')}],issues:[]};
 for(const overrides of [[{sourceIndex:99,containerNumber:'MSMU5684659',correctedNumber:'ABCU1234567'}],[{sourceIndex:0,containerNumber:'MSMU5684659',correctedNumber:'MSNU8644653'},{sourceIndex:1,containerNumber:'MSNU8644653',correctedNumber:'MSMU5684659'}]]){const result=applyManual(ex,{containerOverrides:overrides});assert.ok(result.issues.length);assert.deepEqual(result.containers,ex.containers);assert.deepEqual(result.cargoLines.map(r=>r.containerNumber),ex.cargoLines.map(r=>r.containerNumber));}
});
test('shipment totals preserve the exact package choice without spreading quantities to products',()=>{
 const ex={fields:Object.fromEntries(Object.entries({description:'PVC',packageCount:'10',packageType:'Unit',grossWeightKg:'100'}).map(([k,v])=>[k,f(v)])),containers:[{containerNumber:f('MSMU5684659')}],containerCount:1,cargoLines:[{containerNumber:f('MSMU5684659'),description:f('A')},{containerNumber:f('MSMU5684659'),description:f('B')}],issues:[]};
 const m=manualSchema.parse({...emptyManual,cargoQuantityMode:'shipment-total',shipmentPackageCode:'431'}),result=applyManual(ex,m);assert.equal(result.cargoLines.length,1);assert.equal(result.cargoLines[0].inttraPackageCode.value,'431');assert.equal(result.cargoLines[0].packageCount.value,'10');assert.equal(ex.cargoLines.length,2);
});
test('quoted kilogram normalization corrects arithmetic only when source has one unambiguous amount',async()=>{
 const {quotedKilograms}=await import('../lib/quoted-number.ts');
 assert.equal(quotedKilograms('BRÜT KG : 22.450,000 KG'),'22450');assert.equal(quotedKilograms('Net: 21,979.98 KGS'),'21979.98');assert.equal(quotedKilograms('Gross 22450 KG'),'22450');
 for(const text of ['-22.450,000 KG','−22.450,000 KG','22.450,000% KG','22.450 KG','21,979 KG','22,450 KG / 771 PAKET','Net 21.979,980 KG; gross 22.450,000 KG','22.450,000 LBS','22.450,000 KG = 22.45 TON','MSMU5684659 22.450,000 KG'])assert.equal(quotedKilograms(text),null,text);
});
test('missing operation description is composed from trusted cargo without dropping products or overriding source',async()=>{
 const {completeCargoSummary}=await import('../lib/extraction-summary.ts');
 const ex={fields:{description:f(null)},cargoLines:[{description:f('PVC PROFILES\nORDER NO: 1298'),packageType:f('PAKET')},{description:f('PVC ACCESSORIES\nMETAL INJECTION PRODUCTS\nORDER NO: 1297'),packageType:f('PAKET')}]};
 const result=completeCargoSummary(ex);assert.equal(result.fields.description.value,'PVC PROFILES\nORDER NO: 1298\nPVC ACCESSORIES\nMETAL INJECTION PRODUCTS\nORDER NO: 1297');assert.equal(result.fields.packageType.value,'PAKET');assert.equal(ex.fields.description.value,null);
 assert.equal(completeCargoSummary({...ex,fields:{description:f('Printed summary')}}).fields.description.value,'Printed summary');
 assert.equal(completeCargoSummary({...ex,cargoLines:[ex.cargoLines[0],{description:{value:'Unknown',source:'',confidence:1}}]}).fields.description.value,null);
});
