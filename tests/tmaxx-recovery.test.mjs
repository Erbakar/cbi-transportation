import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
const uri=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const values=uri(fs.readFileSync('lib/tmaxx-values.ts','utf8'));const v=await import(values);
const source=fs.readFileSync('lib/server/tmaxx-recovery.ts','utf8').replace("import {tmaxxClient,tmaxxSaveKeys} from './tmaxx-workflow';",'const tmaxxClient=async()=>async()=>({id:42,version:1}),tmaxxSaveKeys=()=>[];').replace("import {AppError,digest} from './runtime';",'class AppError extends Error{}; const digest=async s=>s;').replace("from '../tmaxx-values'",`from '${values}'`);
const {applyRecoveryEdits,inspectTmaxxRecovery}=await import(uri(source));
test('canonical numeric differences are equivalent; real differences and ambiguous numbers stay visible',()=>{assert.equal(v.tmaxxValueEqual('grossWeight',23110,'23110.00'),true);assert.equal(v.tmaxxValueEqual('grossWeight',0,23110),false);assert.equal(v.tmaxxValueEqual('grossWeight','23.110,00',23110),false);assert.equal(v.tmaxxValueEqual('hblNo','001','1'),false);assert.equal(v.tmaxxValueEqual('sealNo',null,''),true);});
test('edits reject invalid quantities, ambiguous numbers and empty mandatory content',()=>{assert.throws(()=>v.parseTmaxxEdit('quantity','1.5'));assert.throws(()=>v.parseTmaxxEdit('grossWeight','23,110'));assert.throws(()=>v.parseTmaxxEdit('grossWeight','0'));});
const batch={loads:[{updates:[{path:'/seaGoodPack',body:{quantity:788,grossWeight:23110,netWeight:22000,volume:0,seaContainer:{id:2}}},{path:'/seaContainer',entityId:2,body:{grossWeight:0}},{path:'/seaGood',body:{quantity:0,grossWeight:0}},{path:'/seaGoodWaybill',body:{consignor:'SHIPPER'}}]}]};
test('reviewed cargo values calculate container and load totals without changing input',()=>{const next=applyRecoveryEdits(batch,[{id:'0:0:grossWeight',key:'grossWeight',expected:'23110'}],{'0:0:grossWeight':'24000'});assert.equal(next.loads[0].updates[1].body.grossWeight,24000);assert.equal(next.loads[0].updates[2].body.quantity,788);assert.equal(next.loads[0].updates[2].body.grossWeight,24000);assert.equal(batch.loads[0].updates[0].body.grossWeight,23110);});
test('unknown fields, changed identifiers and empty party are rejected',()=>{assert.throws(()=>applyRecoveryEdits(batch,[],{'0:0:evil':'value'}));assert.throws(()=>applyRecoveryEdits(batch,[{id:'0:0:hblNo',key:'hblNo',expected:'123'}],{'0:0:hblNo':'999'}));assert.throws(()=>applyRecoveryEdits(batch,[{id:'0:3:consignor',key:'consignor',expected:'SHIPPER'}],{'0:3:consignor':''}));});

test('booking approval prerequisite is actionable and unrelated errors are not misclassified',async()=>{const {tmaxxBusinessError}=await import('../lib/tmaxx-values.ts');assert.match(tmaxxBusinessError(400,'Hat "BCM - Booking Confirmation" evrakı dijital arşive ilişkilendirilmiş olmalı! - WorkFlow [Booking Onay Kontrol]'),/BCM.*dijital arşiv/);assert.equal(tmaxxBusinessError(500,'Internal server error'),null);assert.equal(tmaxxBusinessError(400,'Invalid JSON'),null);});

test('cargo cross checks reject net above gross and invalid persisted quantities before writing',()=>{
 assert.deepEqual(v.tmaxxCargoIssues({quantity:788,grossWeight:23110,netWeight:22636.8,volume:0}),[]);
 assert.equal(v.tmaxxCargoIssues({grossWeight:100,netWeight:101})[0].key,'netWeight');
 assert.equal(v.tmaxxCargoIssues({quantity:1.5})[0].key,'quantity');
 assert.equal(v.tmaxxCargoIssues({grossWeight:0})[0].key,'grossWeight');
 assert.equal(v.tmaxxCargoIssues({volume:-1})[0].key,'volume');
 assert.equal(v.tmaxxCargoIssues({packing:' '})[0].key,'packing');
 assert.deepEqual(v.tmaxxCargoIssues({grossWeight:100,netWeight:100,volume:0}),[]);
});

test('recovery returns correctable field issues separately from structural blockers',async()=>{
 const result=await inspectTmaxxRecovery('owner',{loads:[{updates:[{method:'PUT',entityId:42,path:'/seaGoodPack',body:{grossWeight:100,netWeight:120}}]}]});
 assert.deepEqual(result.issues,[{id:'0:0:netWeight',message:'Net ağırlık brüt ağırlıktan büyük olamaz. Belgedeki değerleri kontrol edin.'}]);
 assert.deepEqual(result.blockers,[]);
});

test('cargo correction synchronizes generated HBL text but preserves custom HBL wording',()=>{
 const source=structuredClone(batch);source.loads[0].updates[0].body.goodDescription='GOODS\nNET WEIGHT: 22000 KG';source.loads[0].updates[3].body.quantityAndDescription='GOODS\nNET WEIGHT: 22000 KG';
 const rows=[{id:'0:0:netWeight',key:'netWeight',expected:'22000'}];
 const next=applyRecoveryEdits(source,rows,{'0:0:netWeight':'21000'});
 assert.equal(next.loads[0].updates[0].body.goodDescription,'GOODS\nNET WEIGHT: 21000 KG');
 assert.equal(next.loads[0].updates[3].body.quantityAndDescription,'GOODS\nNET WEIGHT: 21000 KG');
 source.loads[0].updates[3].body.quantityAndDescription='CUSTOM';
 assert.equal(applyRecoveryEdits(source,rows,{'0:0:netWeight':'21000'}).loads[0].updates[3].body.quantityAndDescription,'CUSTOM');
});
