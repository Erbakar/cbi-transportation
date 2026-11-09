import * as tmaxxFormat from '../lib/tmaxx-hbl-format.ts';globalThis.__tmaxxFormat=tmaxxFormat;
import {multiHblIntegrityIssues} from '../lib/inttra-hbl-integrity.ts';globalThis.__multiHblIntegrityIssues=multiHblIntegrityIssues;
import {tmaxxValueEqual} from '../lib/tmaxx-values.ts';globalThis.__tmaxxValueEqual=tmaxxValueEqual;
import {cargoPrint} from '../lib/shipment-rules.ts';globalThis.__cargoPrint=cargoPrint;
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import {startInttraSession} from '../scripts/inttra-session.mjs';
async function module(path){let s=fs.readFileSync(path,'utf8').replace("import {descriptionHasNetWeight,resolveTmaxxPacking,tmaxxHblPortName,type TmaxxPackingOption} from '../tmaxx-hbl-format';",'const {descriptionHasNetWeight,resolveTmaxxPacking,tmaxxHblPortName}=globalThis.__tmaxxFormat;').replace("import {multiHblIntegrityIssues} from '../inttra-hbl-integrity';",'const multiHblIntegrityIssues=globalThis.__multiHblIntegrityIssues;').replace("import {tmaxxValueEqual} from '../tmaxx-values';","const tmaxxValueEqual=globalThis.__tmaxxValueEqual;").replace("import {cargoPrint} from '../shipment-rules';",'const cargoPrint=globalThis.__cargoPrint;').replace("import {resolveInttraBookingWarning} from './inttra-booking-check';","const resolveInttraBookingWarning=()=>{throw Error('not part of this test')};").replace("import {mapInttraManual} from '../inttra-mapping';","const mapInttraManual=()=>{throw Error('not part of this test')};").replace(/import \{AppError(?:,runtime)?\} from '\.\/runtime';/,"class AppError extends Error {};const runtime=()=>({});").replace(/import \{contracts,fetchJson,platformSession\} from '\.\/platforms';/,"const contracts=()=>[];const fetchJson=async()=>({});const platformSession=async()=>({});").replace(/import \{contracts,platformSession\} from '\.\/platforms';/,"const contracts=()=>[];const platformSession=async()=>({});");return import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'))}
const t=await module('lib/server/tmaxx-workflow.ts'),i=await module('lib/server/inttra-workflow.ts');

const packingTypes=['Package','PACKAGES','BOXES','BOX'].map(code=>({code,name:code}));
const buildPlan=(g,c,p,w,ex,options={})=>t.buildExistingLoadPlan(g,c,p,w,ex,{packingTypes,...options});
test('new T-MAXX preparation cannot silently skip a missing HBL document selection',async()=>{await assert.rejects(t.prepareTmaxx('owner',{fields:{}}),/HBL belge türünü doğrulayın/);});
test('HBL document selection uses native codes, rejects ambiguity and verifies the saved selection',()=>{
 const f=value=>({value,source:'operator',confidence:1});
 for(const [value,code,count] of [['ORIGINAL','O',3],['Orjinal','O',3],['3/3','O',3],['Sea Waybill','S',null],['SWB','S',null],['TELEX RELEASE','E',null]])assert.deepEqual(t.tmaxxHblDocumentPatch(f(value)),{hblType:code,hblOrginalCount:count});
 for(const value of ['true','ORIGINAL OR RELEASE','SWB / ORIGINAL','']){
  if(value)assert.throws(()=>t.tmaxxHblDocumentPatch(f(value)),/belirsiz/);
  else assert.equal(t.tmaxxHblDocumentPatch(f(value)),null);
 }
 assert.throws(()=>t.tmaxxHblDocumentPatch({...f('ORIGINAL'),confidence:.5}),/doğrulanmalı/);
 const fields=Object.fromEntries(['shipperName','shipperAddress','consigneeName','consigneeAddress','notifyName','notifyAddress','loadPort','dischargePort'].map(k=>[k,f(k)]));Object.assign(fields,{blType:f('ORIGINAL'),packageCount:f('39'),grossWeightKg:f('22437')});
 const ex={fields,containers:[{containerNumber:f('MSDU8764520'),containerType:f('40 HC'),grossWeightKg:f('22437')}],cargoLines:[{description:f('GOODS'),packageType:f('PACKAGES'),packageCount:f('39'),grossWeightKg:f('22437')}]};
 const original={id:1,version:25,hblType:'true',hblOrginalCount:null,hblCopyCount:7};
 const update=buildPlan(original,[{id:2,version:1,no:'MSDU8764520',containerType:{name:'40 HC'}}],[{id:3,version:1,seaContainer:{id:2}}],{id:4,version:1},ex,{houseBillNumber:'1046452'}).find(u=>u.path.endsWith('seaGood'));
 assert.equal(update.hblDocumentManaged,true);assert.equal(update.body.hblType,'O');assert.equal(update.body.hblOrginalCount,3);assert.equal(original.hblType,'true');assert.equal(update.body.hblCopyCount,7);
 assert.ok(t.tmaxxSaveKeys(update.path,update).includes('hblType'));assert.ok(!t.tmaxxSaveKeys(update.path).includes('hblType'));assert.ok(!t.tmaxxSaveKeys(update.path,update).includes('hblCopyCount'));
 assert.deepEqual(t.assertTmaxxSaved(update,{...update.body,version:26,hblOrginalCount:'3.00'}),{id:1,version:26});
 for(const patch of [{hblType:'S'},{hblOrginalCount:null}])assert.throws(()=>t.assertTmaxxSaved(update,{...update.body,version:26,...patch}),/eşleşmiyor/);
});
test('optional empty seal does not clear ERP data; explicit omission and confirmed seals remain supported',()=>{
 const f=value=>({value:String(value),source:'document',confidence:1});
 const fields=Object.fromEntries(['shipperName','shipperAddress','consigneeName','consigneeAddress','notifyName','notifyAddress','loadPort','dischargePort'].map(k=>[k,f(k)]));Object.assign(fields,{packageCount:f(1),grossWeightKg:f(10)});
 const c={containerNumber:f('ARKU8360679'),containerType:f('40 HC'),sealNumber:f(''),grossWeightKg:f(10)};
 const ex={fields,containers:[c],cargoLines:[{containerNumber:c.containerNumber,description:f('Goods'),packageType:f('Package'),packageCount:f(1),grossWeightKg:f(10)}]};
 const existing={id:2,version:1,no:'ARKU8360679',containerType:{name:'40 HC'},sealNo:'KEEP-ME'};
 const build=()=>buildPlan({id:1,version:1},[existing],[{id:3,version:1,seaContainer:{id:2}}],{id:4,version:1},ex).find(u=>u.path.endsWith('seaContainer'));
 assert.equal(Object.hasOwn(build().body,'sealNo'),false);assert.equal(existing.sealNo,'KEEP-ME');
 ex.omittedSeals=['ARKU8360679'];assert.equal(build().body.sealNo,'');assert.equal(existing.sealNo,'KEEP-ME');
 existing.sealNo=null;assert.equal(build().body.sealNo,null);
 ex.omittedSeals=[];c.sealNumber=f('NEW');assert.equal(build().body.sealNo,'NEW');
 c.sealNumber.confidence=.5;assert.throws(build,/Mühür bilgisi/);
});
test('load matching requires complete container set and rejects conflicting booking',()=>{assert.equal(t.matchLoad('B1',['ABCU1234567','DEFU7654321'],{bookingNo:'B1'},[{no:'DEFU7654321'},{no:'ABCU1234567'}]).exact,true);assert.equal(t.matchLoad('B1',['ABCU1234567'],{bookingNo:'B1'},[{no:'ABCU1234567'},{no:'DEFU7654321'}]).exact,false);assert.equal(t.matchLoad('B2',['ABCU1234567'],{bookingNo:'B1'},[{no:'ABCU1234567'}]).exact,false);assert.equal(t.matchLoad('B1',[],{},[]).exact,false)});
test('HBL patch preserves unrelated values and optimistic version',()=>{const fields=Object.fromEntries(['shipperName','shipperAddress','consigneeName','consigneeAddress','notifyName','notifyAddress','loadPort','dischargePort'].map(k=>[k,{value:k,source:'document',confidence:1}]));const existing={id:42,version:8,freightAndCharges:'preserve',referenceNo:'LOAD42'};const patch=t.buildHblUpdate(existing,{fields,cargoLines:[{description:{value:'Goods',source:'doc',confidence:1}}]});assert.equal(patch.version,8);assert.equal(patch.referenceNo,'LOAD42');assert.equal(patch.freightAndCharges,'preserve');assert.equal(patch.consignor,'shipperName\nshipperAddress');assert.equal(existing.consignor,undefined);assert.throws(()=>t.buildHblUpdate({id:42},{fields,cargoLines:[]}))});
test('INTTRA wire encoding matches observed percent-encoded JSON, including unicode and plus',()=>{const p={ShipmentInstruction:{text:'İzmir + goods & 100%'}};assert.deepEqual(JSON.parse(decodeURIComponent(i.inttraWireBody(p))),p);assert.ok(i.inttraWireBody(p).startsWith('%7B'))});
test('review warnings remain visible; HTTP success alone cannot prove submit',()=>{const reviewed=i.reviewResult({status:'OK',errorcode:'0000',content:{ShipmentInstruction:{}},exceptions:[{code:'10136',type:'001',message:'<b>Booking not found</b>'}]});assert.equal(reviewed.warnings[0].message,'Booking not found');assert.throws(()=>i.reviewResult({status:'ERROR'}));assert.throws(()=>i.submittedReference({status:'OK'}));assert.throws(()=>i.submittedReference({root:{SiId:12,originalSiId:13,SiSequence:1}}));assert.equal(i.submittedReference({root:{SiId:12,originalSiId:12,SiSequence:1}}),'12')});
test('SSO refuses unexpected redirect before forwarding cookies',async()=>{let calls=0;await assert.rejects(startInttraSession({access_token:'test-token',scope:'test'},async()=>{calls++;return new Response(null,{status:302,headers:{Location:'https://untrusted.example/'}})}));assert.equal(calls,1)});
test('SSO validates web session and limits cookie scope',async()=>{const calls=[];const session=await startInttraSession({access_token:'test-token',scope:'test'},async(url,opts)=>{calls.push({url,opts});if(String(url).includes('/auth/login'))return new Response(null,{status:302,headers:{Location:'https://my.inttra.e2open.com/dashboard','Set-Cookie':'HOSTONLY=abc; Path=/'}});if(String(url).endsWith('/dashboard'))return new Response('ok');assert.ok(!opts.headers.Cookie.includes('HOSTONLY'));return Response.json({moveTypeList:'[]',carriersList:'[]'})});assert.ok(session.cookie.includes('TOKEN=test-token'));assert.equal(calls.length,3)});
test('load update plan blocks locked loads, missing cargo links and different container types',()=>{const f=value=>({value,source:'document',confidence:1});const fields=Object.fromEntries(['shipperName','shipperAddress','consigneeName','consigneeAddress','notifyName','notifyAddress','loadPort','dischargePort'].map(k=>[k,f(k)]));Object.assign(fields,{packageCount:f('2'),grossWeightKg:f('20'),netWeightKg:f('18')});const cs=['ABCU1234567','DEFU7654321'].map(n=>({containerNumber:f(n),containerType:f('40 HC'),sealNumber:f('SEAL'),grossWeightKg:f('10')}));const lines=cs.map(c=>({containerNumber:c.containerNumber,description:f('Goods'),packageType:f('PACKAGES'),packageCount:f('1'),grossWeightKg:f('10'),netWeightKg:f('9')}));const ex={fields,containers:cs,cargoLines:lines};const good={id:1,version:3};const containers=cs.map((c,n)=>({id:n+2,version:1,no:c.containerNumber.value,containerType:{name:'40 HC'}}));const packs=containers.map((c,n)=>({id:n+10,version:2,seaContainer:{id:c.id}}));const hbl={id:20,version:4};assert.equal(buildPlan(good,containers,packs,hbl,ex).length,6);assert.throws(()=>buildPlan({...good,isLocked:true},containers,packs,hbl,ex));assert.throws(()=>buildPlan(good,containers,packs,hbl,{...ex,cargoLines:lines.map(l=>({...l,containerNumber:f('')}))}));assert.throws(()=>buildPlan(good,containers.map(c=>({...c,containerType:{name:'20 GP'}})),packs,hbl,ex));});
test('blank container slots require explicit source reference and do not invent net weight',()=>{const f=value=>({value,source:'document',confidence:1});const fields=Object.fromEntries(['shipperName','shipperAddress','consigneeName','consigneeAddress','notifyName','notifyAddress','loadPort','dischargePort'].map(k=>[k,f(k)]));Object.assign(fields,{packageCount:f('2'),grossWeightKg:f('20')});const cs=['ABCU1234567','DEFU7654321'].map(n=>({containerNumber:f(n),containerType:f('40 HC'),sealNumber:f('SEAL'),grossWeightKg:f('10')}));const ex={fields,containers:cs,cargoLines:cs.map(c=>({containerNumber:c.containerNumber,description:f('Goods'),packageType:f('BOXES'),packageCount:f('1'),grossWeightKg:f('10')}))};const containers=[{id:2,version:1,no:null,containerType:{name:'40 HC'}},{id:3,version:1,no:null,containerType:{name:'40 HC'}}];const good={id:1,version:1};assert.throws(()=>buildPlan(good,containers,[],{id:9,version:1},ex));const plan=buildPlan(good,containers,[{id:4,version:1,quantity:0,grossWeight:0,netWeight:0}],{id:9,version:1},ex,{allowBlankContainers:true,houseBillNumber:'1046340',bookingNumber:'B1'});const writes=plan.filter(p=>p.path.endsWith('/seaContainer'));assert.deepEqual(writes.map(p=>p.body.no).sort(),['ABCU1234567','DEFU7654321']);assert.equal(containers[0].no,null);assert.throws(()=>buildPlan(good,[{...containers[0],no:'OTHER'},containers[1]],[],{id:9,version:1},ex,{allowBlankContainers:true}));});

test('HBL output preserves order references, full HS and sourced net weight',()=>{const f=value=>({value,source:'doc',confidence:1});const fields=Object.fromEntries(['shipperName','shipperAddress','consigneeName','consigneeAddress','notifyName','notifyAddress','loadPort','dischargePort'].map(k=>[k,f(k)]));const patch=t.buildHblUpdate({id:1,version:1},{fields,cargoLines:[{description:f('GOODS'),marksAndNumbers:f('PO: 42'),hsCode:f('391620000000'),netWeightKg:f('10')}]});assert.match(patch.quantityAndDescription,/PO: 42/);assert.match(patch.quantityAndDescription,/HS CODE: 391620000000/);assert.match(patch.quantityAndDescription,/NET WEIGHT: 10 KG/);});

test('multiple cargo rows in one container map exact rows or explicit selections and retain volume',()=>{
 const f=value=>({value:String(value),source:'document',confidence:1});
 const fields=Object.fromEntries(['shipperName','shipperAddress','consigneeName','consigneeAddress','notifyName','notifyAddress','loadPort','dischargePort'].map(k=>[k,f(k)]));Object.assign(fields,{packageCount:f(3),grossWeightKg:f(30),volumeM3:f(5)});
 const container={containerNumber:f('ABCU1234567'),containerType:f('40 HC'),sealNumber:f('S'),grossWeightKg:f(30)};
 const lines=[{containerNumber:container.containerNumber,description:f('A'),packageType:f('BOX'),packageCount:f(1),grossWeightKg:f(10),volumeM3:f(2)},{containerNumber:container.containerNumber,description:f('B'),packageType:f('BOX'),packageCount:f(2),grossWeightKg:f(20),volumeM3:f(3)}];
 const ex={fields,containers:[container],cargoLines:lines},good={id:1,version:1},cs=[{id:2,version:1,no:'ABCU1234567',containerType:{name:'40 HC'}}],packs=[{id:5,version:1,seaContainer:{id:2},quantity:2,grossWeight:20,goodDescription:'B'},{id:4,version:1,seaContainer:{id:2},quantity:1,grossWeight:10,goodDescription:'A'}];
 const plan=buildPlan(good,cs,packs,{id:9,version:1},ex);const rows=plan.filter(p=>p.path.endsWith('seaGoodPack'));assert.deepEqual(rows.map(p=>p.entityId),[4,5]);assert.deepEqual(rows.map(p=>p.body.volume),[2,3]);assert.equal(plan.find(p=>p.path.endsWith('seaGood')).body.volume,5);
 const changed={...ex,cargoLines:lines.map(l=>({...l,description:f('Changed')}))};assert.throws(()=>buildPlan(good,cs,packs,{id:9,version:1},changed),/satırını seçin/);assert.equal(buildPlan(good,cs,packs,{id:9,version:1},changed,{packIds:{0:4,1:5}}).length,5);
 assert.throws(()=>buildPlan(good,cs,packs,{id:9,version:1},changed,{packIds:{0:4,1:4}}),/eşleşmiyor/);
 const created=buildPlan(good,cs,[],{id:9,version:1},ex).filter(p=>p.method==='POST');assert.deepEqual(created.map(p=>p.lineIndex),[0,1]);assert.deepEqual(created.map(p=>p.expectedPackCount),[0,1]);
});

test('T-MAXX saves cargo before server-calculated container and load totals without mutating the plan',()=>{const original=[{path:'/seaContainer'},{path:'/seaGoodWaybill'},{path:'/seaGood'},{path:'/seaGoodPack'},{path:'/seaGoodPack'}];assert.deepEqual(t.orderTmaxxUpdates(original).map(x=>x.path),['/seaGoodPack','/seaGoodPack','/seaContainer','/seaGood','/seaGoodWaybill']);assert.equal(original[0].path,'/seaContainer');});

test('T-MAXX save response accepts canonical numeric formatting without hiding real differences',()=>{
 const update={path:'/seaGoodPack',method:'PUT',entityId:8,body:{id:8,version:1,seaContainer:{id:2},quantity:3,packing:'Package',grossWeight:20,netWeight:18,goodDescription:'GOODS'}};
 const response={...update.body,version:2,quantity:'3.00',grossWeight:'20.00'};
 assert.deepEqual(t.assertTmaxxSaved(update,response),{id:8,version:2});
 assert.throws(()=>t.assertTmaxxSaved(update,{...response,grossWeight:'21.00'}));
});

test('HBL plan uses booking for identity checks but never confirms the reservation',()=>{
 const f=value=>({value:String(value),source:'document',confidence:1});
 const fields=Object.fromEntries(['shipperName','shipperAddress','consigneeName','consigneeAddress','notifyName','notifyAddress','loadPort','dischargePort'].map(k=>[k,f(k)]));Object.assign(fields,{packageCount:f(1),grossWeightKg:f(10)});
 const c={containerNumber:f('MSNU8644653'),containerType:f('40 HC'),grossWeightKg:f(10)};
 const ex={fields,containers:[c],cargoLines:[{containerNumber:c.containerNumber,description:f('Goods'),packageType:f('Package'),packageCount:f(1),grossWeightKg:f(10)}]};
 const containers=[{id:2,version:1,no:'MSNU8644653',containerType:{name:'40 HC'}}],packs=[{id:3,version:1,seaContainer:{id:2}}];
 const build=bookingNo=>buildPlan({id:1,version:1,bookingNo},containers,packs,{id:4,version:1},ex,{houseBillNumber:'1046445',bookingNumber:'EBKG19125349'}).find(u=>u.path.endsWith('seaGood'));
 assert.equal(build(null).body.bookingNo,null);assert.equal(build(null).body.hblNo,'1046445');assert.equal(build('EBKG19125349').body.bookingNo,'EBKG19125349');assert.throws(()=>build('OTHER'),/bookingNo farklı/);
 assert.ok(!t.tmaxxSaveKeys('/api//sea/seaGood').includes('bookingNo'));
});

test('T-MAXX keeps net weight in exactly one output field and uses live packaging codes',()=>{
 const f=value=>({value:String(value),source:'Instruction',confidence:1});
 const fields=Object.fromEntries(['shipperName','shipperAddress','consigneeName','consigneeAddress','notifyName','notifyAddress'].map(k=>[k,f(k)]));
 Object.assign(fields,{loadPort:f('TEKIRDAG - TR - TEK'),dischargePort:f('SAN ANTONIO - CL - SAI'),packageCount:f(771),grossWeightKg:f(22450),netWeightKg:f(21979.98)});
 const container={containerNumber:f('MSMU5684659'),containerType:f('40 HC'),grossWeightKg:f(22450)};
 const line={containerNumber:container.containerNumber,description:f('PVC PROFILES'),packageType:f('PAKET'),packageCount:f(771),grossWeightKg:f(22450),netWeightKg:f(21979.98)};
 const ex={fields,containers:[container],cargoLines:[line]},good={id:1,version:1,netWeight:21979.98},containers=[{id:2,version:1,no:'MSMU5684659',containerType:{name:'40 HC'}}],packs=[{id:3,version:1,seaContainer:{id:2},netWeight:21979.98,packing:'PAKET'}];
 for(const printed of [false,true]){
  line.description={...f('PVC PROFILES'+(printed?'\nNET WEIGHT: 21979.98 KG':'')),source:'Kullanıcı · Hazırlanmış mal açıklaması'};const before=JSON.stringify({ex,good,containers,packs});
  const plan=buildPlan(good,containers,packs,{id:4,version:1},ex),pack=plan.find(x=>x.path.endsWith('/seaGoodPack')).body,load=plan.find(x=>x.path.endsWith('/seaGood')).body,hbl=plan.find(x=>x.path.endsWith('/seaGoodWaybill')).body;
  assert.equal(pack.netWeight,printed?null:21979.98);assert.equal(load.netWeight,printed?0:21979.98);assert.equal(pack.packing,'PACKAGES');
  assert.equal((hbl.quantityAndDescription.match(/NET WEIGHT/g)||[]).length,printed?1:0);assert.equal(hbl.quantityAndDescription,pack.goodDescription);
  assert.equal(hbl.portOfLoading,'TEKIRDAG');assert.equal(hbl.portOfDischarge,'SAN ANTONIO');assert.equal(JSON.stringify({ex,good,containers,packs}),before);
  assert.throws(()=>buildPlan(good,containers,packs,{id:4,version:1},ex,{packingTypes:[]}),/ambalaj/);
 }
});

test('legacy frozen HBL plans retain their original print mapping during resume and reconciliation',()=>{
 const f=value=>({value,source:'Instruction',confidence:1}),fields=Object.fromEntries(['shipperName','shipperAddress','consigneeName','consigneeAddress','notifyName','notifyAddress'].map(k=>[k,f(k)]));
 fields.loadPort=f('TEKIRDAG - TR - TEK');fields.dischargePort=f('SAN ANTONIO - CL - SAI');
 const ex={fields,cargoLines:[{description:f('Goods'),netWeightKg:f('10')}]};
 const before=JSON.stringify(ex),legacy=t.buildHblUpdate({id:1,version:1},ex,{legacy:true}),current=t.buildHblUpdate({id:1,version:1},ex);
 assert.equal(legacy.portOfLoading,'TEKIRDAG - TR - TEK');assert.match(legacy.quantityAndDescription,/NET WEIGHT: 10 KG/);
 assert.equal(current.portOfLoading,'TEKIRDAG');assert.equal(current.quantityAndDescription,legacy.quantityAndDescription);assert.equal(JSON.stringify(ex),before);
});
