import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
import {cargoPrint,destinationRegion,emailList} from '../lib/shipment-rules.ts';
const uri=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const manual=uri(fs.readFileSync('lib/manual-extraction.ts','utf8'));
const bills=uri(fs.readFileSync('lib/house-bills.ts','utf8').replace("'./manual-extraction'",JSON.stringify(manual)));
const {houseBillIssues,extractionForBill}=await import(bills);
const source=fs.readFileSync('lib/server/tmaxx-source.ts','utf8').replace("'../tmaxx-reference'",JSON.stringify(uri(fs.readFileSync('lib/tmaxx-reference.ts','utf8')))).replace("'../house-bills'",JSON.stringify(bills)).replace("import {AppError} from './runtime';",'class AppError extends Error{}').replace("import {tmaxxClient} from './tmaxx-workflow';",'const tmaxxClient=()=>{};').replace("import {applyTmaxxParties,type SourcePosition,type AgentAddress} from '../tmaxx-parties';",'const applyTmaxxParties=()=>{};');
const {selectSourceLoads}=await import(uri(source));
const f=value=>({value,source:'document',confidence:1});
test('destination group uses final country and leaves ambiguous UK unresolved',()=>{assert.equal(destinationRegion('1:CHILE:CORONEL'),'1');assert.equal(destinationRegion('2:SPAIN:VALENCIA'),'2');assert.equal(destinationRegion('3:NORWAY:OSLO'),'2');assert.equal(destinationRegion('4:MEXICO:VERACRUZ'),'3');assert.equal(destinationRegion('5:UNITED ARAB EMIRATES:DUBAI'),'4');assert.equal(destinationRegion('6:UNITED KINGDOM:BELFAST'),'');assert.equal(destinationRegion(''),'');});
test('cargo print keeps all full HS codes in description, first six in the short fields; no repeated additions',()=>{const row={description:f('Goods\nPO: 1293'),hsCode:f('3916.20.00.00.00; 8516.60.10.00.00'),netWeightKg:f('100')};const a=cargoPrint(row);assert.match(a.description,/391620000000, 851660100000/);assert.equal(a.hsCode,'391620');assert.equal(a.marksAndNumbers,'391620');assert.deepEqual(cargoPrint({...row,description:f(a.description)}),a);assert.equal(cargoPrint(row,{marksAndNumbers:'CUSTOM',ncmCode:''}).marksAndNumbers,'CUSTOM');assert.equal(cargoPrint(row,{ncmCode:''}).ncmCode,'');assert.doesNotMatch(cargoPrint({...row,netWeightKg:f(null)}).description,/NET WEIGHT/);});
test('notification parsing rejects missing, malformed and excessive recipients',()=>{assert.equal(emailList('a@example.com,b@example.com'),'a@example.com, b@example.com');assert.throws(()=>emailList(''));assert.throws(()=>emailList('bad address'));assert.throws(()=>emailList(Array.from({length:7},(_,i)=>i+'@example.com').join(',')));});
const loads=[{id:1,reference:'L1',good:{},containers:[{no:'AAA'}],blank:false},{id:2,reference:'L2',good:{},containers:[{no:'BBB'}],blank:false},{id:3,reference:'L3',good:{},containers:[{no:'CCC'}],blank:false}];
const ex={fields:{},issues:[],containers:[{containerNumber:f('BBB')},{containerNumber:f('AAA')}],cargoLines:[{containerNumber:f('AAA'),description:f('A'),packageCount:f('1'),grossWeightKg:f('10')},{containerNumber:f('BBB'),description:f('B'),packageCount:f('2'),grossWeightKg:f('20')}],containerCount:2,cargoLineCount:2};
test('source matching selects existing loads by container identity, not row order or all position loads',()=>{assert.deepEqual(selectSourceLoads(loads,ex).map(l=>l.id),[1,2]);assert.deepEqual(selectSourceLoads([...loads].reverse(),ex).map(l=>l.id),[2,1]);assert.throws(()=>selectSourceLoads([...loads,{...loads[0],id:4}],ex));assert.throws(()=>selectSourceLoads([{...loads[0],containers:[{no:'AAA'},{no:'OTHER'}]},loads[1]],ex));assert.throws(()=>selectSourceLoads(loads,{...ex,containers:[{containerNumber:f('UNKNOWN')}]}));});
test('blank slots are only assignable within one exact load, not guessed across loads',()=>{const blank={...loads[0],blank:true,containers:[{no:''},{no:''}]};assert.equal(selectSourceLoads([blank],ex)[0].id,1);assert.throws(()=>selectSourceLoads([blank,{...blank,id:2}],ex));});
test('bill totals are calculated only from associated cargo, unrelated overrides cannot leak across bills',()=>{const bill={goodId:2,reference:'L2',number:'N2',containerNumbers:['BBB'],fieldOverrides:{consigneeName:'BUYER2'},partyOverrides:{}};const part=extractionForBill(ex,bill,{fieldOverrides:{packageCount:'999'},cargoOverrides:[],containerOverrides:[]});assert.equal(part.fields.packageCount.value,'2');assert.equal(part.fields.grossWeightKg.value,'20');assert.equal(part.fields.consigneeName.value,'BUYER2');assert.equal(part.cargoLines.length,1);assert.equal(part.cargoLines[0].description.value,'B');assert.equal(ex.fields.packageCount,undefined);});
test('multiple scope checks duplicate numbers, missing and overlapping assignments',()=>{const m={inttra:{houseBill:'multiple'},houseBills:[{goodId:1,number:'N1',containerNumbers:['AAA']},{goodId:2,number:'N2',containerNumbers:['BBB']}]};assert.deepEqual(houseBillIssues(m,ex),[]);m.houseBills[1].containerNumbers=['AAA'];assert.ok(houseBillIssues(m,ex).length>=2);m.houseBills[1].number='N1';assert.ok(houseBillIssues(m,ex).some(s=>s.includes('numarası başka')));});

test('source marks containing order references are preserved in cargo description',()=>{const row={description:f('GOODS'),marksAndNumbers:f('REF: 40\nPO: 123'),hsCode:f('391620000000')};const a=cargoPrint(row);assert.match(a.description,/REF: 40\nPO: 123/);assert.equal(a.marksAndNumbers,'391620');assert.deepEqual(cargoPrint({...row,description:f(a.description)}),a);});

test('prepared description remains identical in form and both platform transformations after editing',async()=>{
 const {applyManual}=await import(manual);
 const row={description:f('PVC PROFILE'),hsCode:f('39.16.20.00.00.00, 39.25.90.80.00.00'),netWeightKg:f('100'),marksAndNumbers:f('ORDER NO: 1293')};
 const initial=cargoPrint(row);assert.match(initial.description,/391620000000, 392590800000/);assert.match(initial.description,/ORDER NO: 1293/);assert.match(initial.description,/NET WEIGHT: 100 KG/);
 const edited='PVC PROFILE revised\nHS CODE: 392590800000\nNET WEIGHT: 100 KG';
 const m={explicitEdits:true,fieldOverrides:{},partyOverrides:{},containerOverrides:[],cargoOverrides:[{index:0,preparedDescription:true,fields:{description:edited}}]};
 const applied=applyManual({fields:{},containers:[],cargoLines:[row],issues:[]},m).cargoLines[0];
 assert.equal(cargoPrint(applied).description,edited);assert.equal(cargoPrint(applied,m.cargoOverrides[0].fields).description,edited);assert.equal(cargoPrint(applied).hsCode,'392590');
 assert.equal(cargoPrint(applyManual({fields:{},containers:[],cargoLines:[applied],issues:[]},m).cargoLines[0]).description,edited);
});

test('net weight edits update the generated description line without losing other cargo text',async()=>{
 const {updateCargoNetDescription}=await import('../lib/shipment-rules.ts');
 const original='GOODS\nHS CODE: 391620000000\nNET WEIGHT: 100 KG';
 assert.equal(updateCargoNetDescription(original,'100','125'),'GOODS\nHS CODE: 391620000000\nNET WEIGHT: 125 KG');
 assert.equal(updateCargoNetDescription(original,'100',''),'GOODS\nHS CODE: 391620000000');
 assert.equal(updateCargoNetDescription('GOODS','','12'),'GOODS\nNET WEIGHT: 12 KG');
 assert.equal(updateCargoNetDescription('GOODS\nNET WEIGHT: as agreed','100','125'),'GOODS\nNET WEIGHT: as agreed');
});
