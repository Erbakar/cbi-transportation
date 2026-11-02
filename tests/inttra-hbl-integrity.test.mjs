import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {multiHblIntegrityIssues} from '../lib/inttra-hbl-integrity.ts';

function fixture(){
 return {HouseBillIndicator:'2',SIAttrs:{message:{AttrTypeCode:'4',AttrTypeOptionCode:'2',AttrValue:'ConsolidatedShipment'}},Containers:['MSNU8644653','MSMU5684659'].map((no,i)=>({ContainerNumber:no,ContainerLineItems:[{Sequence:i+1,HouseBillIndicator:'2',LineItemReferences:{number:{LineItemReferenceTypeCode:'11',LineItemReferenceValue:String(1046445+i)}},PartiesJBString:Object.fromEntries(['19','20','27'].map(code=>[code,{PartiesType:code,CompanyName:'Company '+i+' '+code,CompanyAddress:'Free text address',Street:'Test street',StreetNumber:'23',City:'City '+i,State:'Region',Zip:i?'45678':'12345',CountryGeoId:'100',Country:'COUNTRY',POBox:'',Taxid:'',EORINumber:''}]))}]}))};
}
test('two distinct HBLs retain every party after INTTRA normalizes keys and address formatting',()=>{
 const source=fixture(),before=JSON.stringify(source),actual=structuredClone(source);
 actual.Containers.reverse();for(const c of actual.Containers)for(const l of c.ContainerLineItems){l.Sequence=String(l.Sequence);l.PartiesJBString=Object.fromEntries(Object.values(l.PartiesJBString).map((p,i)=>['Parties_'+i,{...p,CompanyAddress:'',Street:'Test\r\nstreet',CountryGeoId:100}]));}
 assert.deepEqual(multiHblIntegrityIssues(source,actual),[]);assert.equal(JSON.stringify(source),before);
});
test('conflicting or duplicate message types are rejected even with complete parties',()=>{
 for(const kind of ['DirectShipment','ConsolidatedShipment']){const actual=fixture();actual.SIAttrs.extra={AttrTypeCode:'4',AttrTypeOptionCode:kind==='DirectShipment'?'3':'2',AttrValue:kind};assert.match(multiHblIntegrityIssues(fixture(),actual).join('\n'),/gönderim türü/);}
 const actual=fixture();actual.HouseBillIndicator='0';assert.match(multiHblIntegrityIssues(fixture(),actual).join('\n'),/gönderim türü/);
});
test('second HBL party loss and each changed address field are identified independently',()=>{
 for(const key of ['CompanyName','Street','StreetNumber','City','State','Zip','CountryGeoId']){
  const actual=fixture();actual.Containers[1].ContainerLineItems[0].PartiesJBString['19'][key]='';
  const issues=multiHblIntegrityIssues(fixture(),actual);assert.ok(issues.length);assert.ok(issues.every(s=>s.includes('1046446')&&s.includes('Gönderen')));
 }
 const actual=fixture();actual.Containers[1].ContainerLineItems[0].PartiesJBString={};assert.equal(multiHblIntegrityIssues(fixture(),actual).length,3);
});
test('swapped HBLs, missing cargo and ambiguous parties cannot pass on the first container alone',()=>{
 const actual=fixture();actual.Containers[1].ContainerLineItems[0].LineItemReferences.number.LineItemReferenceValue='1046445';assert.match(multiHblIntegrityIssues(fixture(),actual).join('\n'),/1046446.*eşleşmesi/);
 actual.Containers.pop();assert.match(multiHblIntegrityIssues(fixture(),actual).join('\n'),/sayısı/);
 const duplicated=fixture();duplicated.Containers[1].ContainerLineItems[0].PartiesJBString.duplicate={...duplicated.Containers[1].ContainerLineItems[0].PartiesJBString['20']};assert.match(multiHblIntegrityIssues(fixture(),duplicated).join('\n'),/1046446.*Alıcı/);
});
test('single-HBL shipment-level parties and no-HBL instructions keep their existing validation',()=>{
 for(const flag of ['0','2'])assert.deepEqual(multiHblIntegrityIssues({HouseBillIndicator:flag,SIAttrs:{message:{AttrTypeCode:'4',AttrTypeOptionCode:'3',AttrValue:'DirectShipment'}},Containers:[]}),[]);
});

function workflow(){
 const state={calls:[],review:fixture(),submitted:0};
 class AppError extends Error{constructor(message,status){super(message);this.status=status;}}
 const fakeRequest=async(_owner,path)=>{state.calls.push(path);if(path==='/siact/review')return {status:'OK',errorcode:'0000',content:{ShipmentInstruction:state.review}};if(path==='/siact/submit'){state.submitted++;return {root:{SiId:123,originalSiId:123,SiSequence:1}};}throw Error('Unexpected request');};
 const deps={runStep:async(_run,_platform,_step,_request,send)=>send()};
 let source=fs.readFileSync('lib/server/inttra-workflow.ts','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'').replaceAll('await inttraRequest(', 'await fakeRequest(').replaceAll("await import('./platform-journal')",'deps');
 const api=new Function('deps','AppError','fakeRequest','multiHblIntegrityIssues','mapInttraManual',ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText+';return {reviewInttraDraft,executeInttra}')(deps,AppError,fakeRequest,multiHblIntegrityIssues,()=>({}));
 return {api,state};
}
test('review success with second-HBL party loss fails before a submit payload is returned',async()=>{
 const {api,state}=workflow();delete state.review.Containers[1].ContainerLineItems[0].PartiesJBString['27'];
 await assert.rejects(api.reviewInttraDraft('owner',{ShipmentInstruction:{...fixture(),SICompanies:{}},chargesArray:[]},{}),/1046446.*Notify/);
 assert.deepEqual(state.calls,['/siact/review']);assert.equal(state.submitted,0);
});
test('legacy conflicting reviews and incomplete cached parties never reach submit',async()=>{
 for(const change of ['mode','party']){const {api,state}=workflow(),s=fixture();if(change==='mode')s.SIAttrs.extra={AttrTypeCode:'4',AttrTypeOptionCode:'3',AttrValue:'DirectShipment'};else s.Containers[1].ContainerLineItems[0].PartiesJBString['19'].Zip='';
  await assert.rejects(api.executeInttra({}, {payload:{ShipmentInstruction:s},warnings:[],approved:true}),/HBL kontrolü/);assert.equal(state.submitted,0);assert.deepEqual(state.calls,[]);
 }
});
test('complete multi-HBL review still reaches the existing submit path once',async()=>{
 const {api,state}=workflow();assert.equal(await api.executeInttra({}, {payload:{ShipmentInstruction:fixture()},warnings:[],approved:true}),'123');assert.equal(state.submitted,1);
});
