import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {applyManual} from '../lib/manual-extraction.ts';
const js=ts.transpileModule(fs.readFileSync('lib/tmaxx-parties.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {applyTmaxxParties}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const paymentJs=ts.transpileModule(fs.readFileSync('lib/tmaxx-payments.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {positionCharges}=await import('data:text/javascript;base64,'+Buffer.from(paymentJs).toString('base64'));
test('MBL position payment terms override cargo terms in the five mapped categories',()=>{const rows=['5','4','3','1','2','7'].map(chargeType=>({chargeType,freightTerm:'Collect',payer:'4',paymentLocation:''}));const result=positionCharges(rows,{freight:'PP',local:'PP',discharge:'CC'});assert.deepEqual(result.map(r=>[r.freightTerm,r.payer]),[['Prepaid','5'],['Prepaid','5'],['Prepaid','5'],['Collect','4'],['Collect','4'],['Collect','4']]);assert.equal(rows[2].freightTerm,'Collect');});
test('PP destination-door delivery prepays five categories and keeps additional charges collect',()=>{const rows=['5','4','3','1','2','7'].map(chargeType=>({chargeType,freightTerm:'Collect',payer:'4',paymentLocation:''}));for(const type of ['3','4'])assert.deepEqual(positionCharges(rows,{freight:'PP',local:'PP',discharge:'CC'},type).map(r=>[r.freightTerm,r.payer]),[['Prepaid','5'],['Prepaid','5'],['Prepaid','5'],['Prepaid','5'],['Prepaid','5'],['Collect','4']]);assert.equal(positionCharges(rows,{freight:'PP',local:'PP',discharge:'CC'},'2')[3].freightTerm,'Collect');});
test('CC standard always prepays origin charges and collects the remaining four categories',()=>{const rows=['5','4','3','1','2','7'].map(chargeType=>({chargeType,freightTerm:'Prepaid',payer:'5',paymentLocation:''}));for(const type of ['1','2','3','4'])assert.deepEqual(positionCharges(rows,{freight:'CC'},type).map(r=>[r.freightTerm,r.payer]),[['Prepaid','5'],['Prepaid','5'],['Collect','4'],['Collect','4'],['Collect','4'],['Collect','4']]);assert.deepEqual(positionCharges(rows,{freight:null},'1'),rows);});
const field=value=>({value,source:'instruction',confidence:1});
const extraction=()=>({fields:{shipperName:field('Actual shipper'),shipperAddress:field('Actual shipper address'),consigneeName:field('HAUSTEK'),consigneeAddress:field('Chile address'),mblConsigneeName:field('Old agent')},issues:[],containers:[],cargoLines:[]});
const position={abroadAgent:{id:4,name:'SCL CARGO'},abroadAgentAddress:{id:5}};
const address={id:5,company:{id:4},address:{addressDetail:'Av. Ventisquero 1111\nRenca'}};
test('selected agent address replaces old MBL parties while retaining actual HBL parties',()=>{
 const ex=applyTmaxxParties(extraction(),position,address,'S.E.26.09.00670');
 assert.equal(ex.hblRequired,true);assert.equal(ex.fields.mblConsigneeName.value,'SCL CARGO');assert.equal(ex.fields.mblNotifyAddress.value,address.address.addressDetail);assert.equal(ex.fields.consigneeName.value,'HAUSTEK');assert.match(ex.fields.mblNotifyAddress.source,/00670/);
 assert.match(ex.fields.mblShipperName.value,/C.B.I./);assert.match(ex.fields.mblShipperAddress.value,/ARDUMAN/);assert.equal(ex.fields.shipperName.value,'Actual shipper');
});
test('no agent preserves distinct CANNING consignee and ECONOMY FREIGHT notify for MBL',()=>{
 const source=extraction();source.fields.consigneeName=field('CANNING');source.fields.notifyName=field('ECONOMY FREIGHT SERVICES LTD');source.fields.notifyAddress=field('LEEDS LS126AJ');source.fields.mblShipperName=field('Old CBI');
 const ex=applyTmaxxParties(source,{abroadAgent:null},undefined,'ref');
 assert.equal(ex.hblRequired,false);assert.equal(ex.fields.mblShipperName.value,'Actual shipper');assert.equal(ex.fields.mblConsigneeName.value,'CANNING');assert.equal(ex.fields.mblNotifyName.value,'ECONOMY FREIGHT SERVICES LTD');assert.equal(ex.fields.mblNotifyAddress.value,'LEEDS LS126AJ');
});
test('notify resolution feeds both agent routes without changing shared cargo or real parties',()=>{
 for(const notify of [null,'','same as consignee','HAUSTEK','ECONOMY FREIGHT SERVICES LTD'])for(const hasAgent of [false,true]){
  const source=extraction();source.fields.notifyName=field(notify);source.fields.notifyAddress=field(notify&&notify!=='same as consignee'?'Explicit notify address':null);source.fields.description=field('PVC PROFILE');source.containers=[{containerNumber:field('DFSU7796423')}];source.cargoLines=[{description:field('PVC PROFILE')}];
  const resolved=applyManual(source,{});const real=structuredClone(resolved.fields);const result=applyTmaxxParties(resolved,hasAgent?position:{abroadAgent:null},hasAgent?address:undefined,'ref');
  assert.equal(result.hblRequired,hasAgent);assert.equal(result.fields.mblNotifyName.value,hasAgent?'SCL CARGO':(!notify||notify==='same as consignee'?'HAUSTEK':notify));
  for(const key of ['shipperName','consigneeName','notifyName','notifyAddress','description'])assert.deepEqual(result.fields[key],real[key]);
  assert.deepEqual(result.containers,source.containers);assert.deepEqual(result.cargoLines,source.cargoLines);
 }
});
test('explicitly empty agent means MBL only with actual shipper and actual receiver for notify',()=>{
 const ex=applyTmaxxParties(extraction(),{abroadAgent:null},undefined,'ref');
 assert.equal(ex.hblRequired,false);assert.equal(ex.fields.mblShipperName.value,'Actual shipper');assert.equal(ex.fields.mblNotifyName.value,'HAUSTEK');assert.equal(ex.fields.mblConsigneeAddress.value,'Chile address');
});
test('missing agent property and mismatched or absent address fail closed',()=>{
 assert.throws(()=>applyTmaxxParties(extraction(),{},undefined,'ref'));
 assert.throws(()=>applyTmaxxParties(extraction(),position,undefined,'ref'));
 assert.throws(()=>applyTmaxxParties(extraction(),position,{...address,company:{id:9}},'ref'));
 assert.throws(()=>applyTmaxxParties(extraction(),position,{...address,id:9},'ref'));
});
