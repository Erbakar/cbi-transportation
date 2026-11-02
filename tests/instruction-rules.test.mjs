import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
const uri=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const shipment=uri(fs.readFileSync('lib/shipment-rules.ts','utf8'));
const payments=uri(fs.readFileSync('lib/tmaxx-payments.ts','utf8'));
const {resolveInstruction,currentFormIssues,resetSourceValues,rememberSourceValues}=await import(uri(fs.readFileSync('lib/instruction-rules.ts','utf8').replace("'./tmaxx-reference'",JSON.stringify(uri(fs.readFileSync('lib/tmaxx-reference.ts','utf8')))).replace("'./tmaxx-payments'",JSON.stringify(payments)).replace("'./shipment-rules'",JSON.stringify(shipment))));
const f=value=>({value,source:'instruction',confidence:1});
const blank=()=>({bookingNumber:'',vessel:'',voyage:'',houseBillNumber:'',blReference:'',moveType:'',chargeMode:'',charges:[],fieldOverrides:{},containerOverrides:[],cargoOverrides:[],partyOverrides:{},tmaxxReference:'ref'});
test('FCL is automatic for new and legacy records without changing the input',()=>{
 const initial=resolveInstruction(blank(),{fields:{}}).manual;assert.equal(initial.inttra.standardFcl,true);
 initial.inttra.standardFcl=false;assert.equal(resolveInstruction(initial,{fields:{}}).manual.inttra.standardFcl,true);assert.equal(initial.inttra.standardFcl,false);
});
test('source facts fill gaps and apply PP door, ENS, release and HBL rules without inventing unresolved fields',()=>{
 const input=blank();const r=resolveInstruction(input,{fields:{bookingNumber:f('NEW'),vessel:f('MSC'),voyage:f('V1'),blType:f('ORIGINAL')},hblRequired:true},{moveType:'3',houseBillNumber:'1046362',payments:{freight:'PP'},locations:{loadPort:'1:TR:TEKIRDAG',destination:'2:CL:SANTIAGO'}}).manual;
 assert.equal(r.bookingNumber,'NEW');assert.equal(r.inttra.houseBill,'2');assert.equal(r.inttra.documentUnfreighted,'1');assert.equal(r.inttra.ensFiler,'2');assert.equal(r.inttra.paymentMethod,'D');assert.equal(r.inttra.origin,r.inttra.loadPort);assert.equal(r.inttra.issuePlace,'');assert.equal(r.inttra.carrier,'');assert.equal(r.charges.length,6);assert.equal(r.charges[4].freightTerm,'Prepaid');assert.equal(r.charges[5].freightTerm,'Collect');assert.equal(input.charges.length,0);
});
test('manual corrections and complete fee schedule survive repeated resolution',()=>{
 let m=resolveInstruction(blank(),{fields:{blType:f('release')},hblRequired:false},{moveType:'1',payments:{freight:'CC'}}).manual;
 m.bookingNumber='OPERATOR';m.charges[2].payer='5';m.inttra.mblDocumentType='ORIGINAL';m.inttra.issuePlace='selected';
 const r=resolveInstruction(m,{fields:{bookingNumber:f('SOURCE')},hblRequired:false},{payments:{freight:'PP'}}).manual;
 assert.equal(r.bookingNumber,'OPERATOR');assert.deepEqual(r.charges,m.charges);assert.equal(r.inttra.documentUnfreighted,'3');assert.equal(r.inttra.houseBill,'0');assert.equal(r.inttra.issuePlace,'selected');assert.deepEqual(resolveInstruction(r,{fields:{},hblRequired:false}).manual,r);
});
test('unknown payment and low-confidence booking remain unresolved',()=>{const r=resolveInstruction(blank(),{fields:{bookingNumber:{...f('guess'),confidence:.5}}},{payments:{freight:'UNKNOWN'}}).manual;assert.equal(r.bookingNumber,'');assert.deepEqual(r.charges,[]);assert.equal(r.inttra.documentUnfreighted,'');});
test('HBL scope follows existing loads: ten containers can be One, four loads become Multiple',()=>{const bill=i=>({goodId:i,reference:'LOAD'+i,number:'HBL'+i,containerNumbers:Array.from({length:i===1?10:1},(_,n)=>'CONT'+i+'-'+n),fieldOverrides:{},partyOverrides:{}});const one=resolveInstruction(blank(),{fields:{},hblRequired:true},{houseBills:[bill(1)]}).manual;assert.equal(one.inttra.houseBill,'2');const multiple=resolveInstruction(blank(),{fields:{},hblRequired:true},{houseBills:[1,2,3,4].map(bill)}).manual;assert.equal(multiple.inttra.houseBill,'multiple');assert.equal(multiple.houseBills.length,4);multiple.houseBills[1].partyOverrides={consignee:{postalCode:'MANUAL'}};assert.equal(resolveInstruction(multiple,{fields:{},hblRequired:true},{houseBills:[1,2,3,4].map(bill)}).manual.houseBills[1].partyOverrides.consignee.postalCode,'MANUAL');});
test('reopening agent form preserves SWB counts and enforces Other payment',()=>{const m=resolveInstruction(blank(),{fields:{blType:f('ORIGINAL')},hblRequired:true}).manual;m.inttra.paymentMethod='A';const reopened=resolveInstruction(m,{fields:{blType:f('ORIGINAL')}}).manual;assert.equal(reopened.inttra.documentUnfreighted,'1');assert.equal(reopened.inttra.paymentMethod,'D');});

test('legacy four missing checks reflect current automatic form values and keep actual missing location',()=>{
 const saved=['Belge tipi: belgede bulunamadı.','INTTRA: Belge düzenleme yeri seçimini tamamlayın.','INTTRA: ENS beyanı seçimini tamamlayın.','INTTRA: istenen belge adedini girin.'];
 const m=resolveInstruction(blank(),{fields:{},hblRequired:true}).manual;
 assert.deepEqual(currentFormIssues(saved,m,{}),[saved[1]]);
 m.inttra.issuePlace='123:TR:ISTANBUL';assert.deepEqual(currentFormIssues(saved,m,{}),[]);
 assert.deepEqual(currentFormIssues([...saved,'Platform bağlantısı doğrulanamadı.'],m,{}),['Platform bağlantısı doğrulanamadı.']);
 m.inttra.issuePlace='';assert.deepEqual(currentFormIssues([],m,{}),[saved[1]]);
 const unknown=resolveInstruction(blank(),{fields:{}}).manual;assert.ok(currentFormIssues(saved,unknown,{}).includes(saved[0]));
});

test('ambiguous or cleared document source clears previous automatic document counts',()=>{
 const m=resolveInstruction(blank(),{fields:{blType:f('ORIGINAL')},hblRequired:false}).manual;
 assert.equal(m.inttra.documentUnfreighted,'3');
 assert.equal(resolveInstruction(m,{fields:{blType:f('ORIGINAL OR RELEASE')},hblRequired:false}).manual.inttra.documentUnfreighted,'');
 m.fieldOverrides.blType='';assert.equal(resolveInstruction(m,{fields:{blType:f('ORIGINAL')},hblRequired:false}).manual.inttra.documentUnfreighted,'');
 m.fieldOverrides.blType='SWB';assert.equal(resolveInstruction(m,{fields:{},hblRequired:false}).manual.inttra.documentUnfreighted,'1');
});

test('source refresh replaces only unchanged automatic values and source changes clear shipment-specific choices',()=>{
 const before=resolveInstruction(blank(),{fields:{}}).manual;
 const after={...structuredClone(before),vessel:'AUTO',bookingNumber:'B1',moveType:'1',charges:[{chargeType:'3',freightTerm:'Prepaid',payer:'5',paymentLocation:''}],inttra:{...before.inttra,carrier:'CARRIER'}};
 const saved=rememberSourceValues(before,after);saved.bookingNumber='USER';
 const refreshed=resetSourceValues(saved);assert.equal(refreshed.vessel,'');assert.equal(refreshed.bookingNumber,'USER');assert.deepEqual(refreshed.charges,[]);assert.equal(refreshed.inttra.carrier,'');
 saved.tmaxxReference='NEW';saved.cargoOverrides=[{index:0,tmaxxPackId:123,fields:{description:'Goods'}}];const changed=resetSourceValues(saved);assert.equal(changed.bookingNumber,'');assert.equal(changed.cargoOverrides[0].tmaxxPackId,undefined);assert.equal(changed.cargoOverrides[0].fields.description,'Goods');assert.deepEqual(changed.houseBills,[]);
 assert.equal(resetSourceValues({...before,vessel:'OLD',tmaxxReference:'NEW'},'OLD').vessel,'');
});

test('formatting the same position preserves operator references and never creates partial INTTRA settings',()=>{
 const m={...blank(),tmaxxReference:'S.E.26.10.00754',bookingNumber:'EBKG19125349',blReference:'MEDUJX351995'};
 const result=resetSourceValues(m,'se261000754');assert.equal(result.bookingNumber,m.bookingNumber);assert.equal(result.blReference,m.blReference);assert.equal(result.inttra,undefined);
 const changed=resetSourceValues({...m,tmaxxReference:'S.E.26.10.00755'},m.tmaxxReference);assert.equal(changed.inttra,undefined);
 const prepared=resolveInstruction(changed,{fields:{}}).manual;assert.equal(prepared.inttra.standardFcl,true);assert.equal(prepared.inttra.sealType,'');
});
