import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
const uri=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const payments=uri(fs.readFileSync('lib/tmaxx-payments.ts','utf8'));
const {resolveInstruction}=await import(uri(fs.readFileSync('lib/instruction-rules.ts','utf8').replace("'./tmaxx-payments'",JSON.stringify(payments))));
const f=value=>({value,source:'instruction',confidence:1});
const blank=()=>({bookingNumber:'',vessel:'',voyage:'',houseBillNumber:'',blReference:'',moveType:'',chargeMode:'',charges:[],fieldOverrides:{},containerOverrides:[],cargoOverrides:[],partyOverrides:{},tmaxxReference:'ref'});
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
