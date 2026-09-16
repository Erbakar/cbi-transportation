import test from 'node:test';
import assert from 'node:assert/strict';
import {applyManual} from '../lib/manual-extraction.ts';
const f=value=>({value,source:'Belge',confidence:1});
const source=()=>({fields:{bookingNumber:f('OLD'),containerType:f(null)},containers:[{containerNumber:f('ARKU8360679'),containerType:f(null),sealNumber:f(null)}],cargoLines:[],issues:[],documentType:'instruction',containerCount:1,cargoLineCount:0});
test('manual corrections preserve original extraction and clearing restores source',()=>{
 const ex=source(),out=applyManual(ex,{bookingNumber:'NEW',fieldOverrides:{shipperName:'Customer'},containerOverrides:[]});
 assert.equal(out.fields.bookingNumber.value,'NEW');assert.equal(ex.fields.bookingNumber.value,'OLD');assert.equal(out.fields.shipperName.source,'Kullanıcı tarafından doğrulandı');assert.equal(applyManual(ex,{}).fields.bookingNumber.value,'OLD');
});
test('container corrections match identity and propagate only single-container header',()=>{
 const ex=source(),out=applyManual(ex,{containerOverrides:[{containerNumber:'ARKU8360679',containerType:'40 HC',sealNumber:'SEAL1'}]});
 assert.equal(out.containers[0].sealNumber.value,'SEAL1');assert.equal(out.fields.containerType.value,'40 HC');assert.equal(ex.containers[0].sealNumber.value,null);
 ex.containers.push({containerNumber:f('OTHER')});assert.equal(applyManual(ex,{containerOverrides:[{containerNumber:'ARKU8360679',containerType:'40 HC'}]}).fields.containerType.value,null);
});
test('stale container corrections and source conflicts remain blocking',()=>{
 const ex=source();ex.issues=['Belge çelişkisi'];const out=applyManual(ex,{containerOverrides:[{containerNumber:'OTHER',sealNumber:'X'}]});assert.equal(out.issues.length,2);assert.equal(out.containers[0].sealNumber.value,null);
});

test('cargo corrections preserve source and reject stale row indexes',()=>{const ex=source();ex.cargoLines=[{description:f('Original')}];const out=applyManual(ex,{cargoOverrides:[{index:0,fields:{description:'Corrected'}},{index:8,fields:{packageCount:'2'}}]});assert.equal(out.cargoLines[0].description.value,'Corrected');assert.equal(ex.cargoLines[0].description.value,'Original');assert.equal(out.issues.length,1);});
