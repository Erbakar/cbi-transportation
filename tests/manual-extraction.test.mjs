import test from 'node:test';
import assert from 'node:assert/strict';
import {applyManual} from '../lib/manual-extraction.ts';
import {validate} from '../lib/domain.ts';
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
test('blank seal requires explicit container-specific choice and can be undone',()=>{const ex=source();ex.containers[0].containerType=f('40 HC');const missing=validate(ex,[]).filter(e=>e.includes('Mühür'));assert.equal(missing.length,1);const out=applyManual(ex,{containerOverrides:[{containerNumber:'ARKU8360679',omitSeal:true}]});assert.deepEqual(out.omittedSeals,['ARKU8360679']);assert.equal(out.containers[0].sealNumber.value,'');assert.equal(validate(out,['sealNumber']).filter(e=>e.includes('Mühür')).length,0);assert.equal(applyManual(ex,{}).omittedSeals.length,0);assert.equal(ex.containers[0].sealNumber.value,null);});

test('cargo corrections preserve source and reject stale row indexes',()=>{const ex=source();ex.cargoLines=[{description:f('Original')}];const out=applyManual(ex,{cargoOverrides:[{index:0,fields:{description:'Corrected'}},{index:8,fields:{packageCount:'2'}}]});assert.equal(out.cargoLines[0].description.value,'Corrected');assert.equal(ex.cargoLines[0].description.value,'Original');assert.equal(out.issues.length,1);});
test('absent notify follows corrected consignee including structured address, explicit notify is retained',()=>{const ex=source();ex.fields.consigneeName=f('HAUSTEK');ex.fields.consigneeAddress=f('Chile');ex.actualParties={consignee:{country:f('CL'),street:f('TUCAPEL')}};const out=applyManual(ex,{partyOverrides:{consignee:{city:'SANTIAGO'}}});assert.equal(out.fields.notifyName.value,'HAUSTEK');assert.equal(out.actualParties.notify.city.value,'SANTIAGO');assert.equal(ex.fields.notifyName,undefined);ex.fields.notifyName=f('Separate notify');assert.equal(applyManual(ex,{}).fields.notifyName.value,'Separate notify');assert.equal(applyManual(ex,{}).fields.notifyAddress,undefined);});
