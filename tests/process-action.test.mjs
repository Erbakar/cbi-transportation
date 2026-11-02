import {reconcileDocumentTotals} from '../lib/document-evidence.ts';
globalThis.__processTotalsReconcile=reconcileDocumentTotals;
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
// Exercise the route with fully valid extraction and mocked storage/platforms.
async function route({paused=[],deliveries=[],manual={},extraction={fields:{}},documents=[]}={}){const row={id:'r',owner:'u',status:'ready',revision:1,extraction:JSON.stringify(extraction),manual:JSON.stringify(manual)};const stub=`
const reconcileDocumentTotals=globalThis.__processTotalsReconcile;const documentsFor=async()=>(${JSON.stringify(documents)});
const resetSourceValues=m=>m;const houseBillIssues=()=>[],extractionForBill=x=>x;const resolveInstruction=(manual)=>({manual});let transfers=0;export const count=()=>transfers;
const platformEnabled=id=>!${JSON.stringify(paused)}.includes(id),pausedPlatforms=()=>(${JSON.stringify(paused)}),inttraQualityIssues=()=>[],validateInttraInput=async()=>{};
export const approvals=[];const transfer=async(...args)=>{transfers++;approvals.push(args[4])},applyManual=x=>x,emptyManual={},manualIssues=()=>[],manualSchema={parse:()=>(${JSON.stringify(manual)})},requireUser=async()=>'u',sameOrigin=()=>{},owned=async()=>(${JSON.stringify(row)}),view=x=>x,sourceFiles=()=>[],extractDocuments=()=>{},contracts=()=>[],minimumFields=[],validate=()=>[];
class AppError extends Error{};const json=x=>Response.json(x),errorResponse=e=>Response.json({error:e.message},{status:400});
export const writes=[];const db=()=>({prepare:(sql)=>({bind(...args){this.args=args;return this},run:async function(){writes.push({sql,args:this.args});return {meta:{changes:1}}},all:async()=>({results:${JSON.stringify(deliveries)}}),first:async()=>null})});
`;
let source=fs.readFileSync('app/api/records/[id]/process/route.ts','utf8').replace(/^import .*;\n/gm,'').replace(/await \(await import\('@\/lib\/server\/inttra-preflight'\)\)\.validateInttraInput\(owner,\s*ex,\s*manual\)/,"await validateInttraInput(owner,ex,manual)");source=source.replace('let ex:Extraction=', 'let ex:any=');const js=ts.transpileModule(stub+source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(js+'\n//'+Math.random()).toString('base64'))}
for(const body of [undefined,{action:'check'}])test('checking a valid record never writes to platforms: '+JSON.stringify(body),async()=>{const m=await route();const r=await m.POST(new Request('https://app/api',{method:'POST',body:body&&JSON.stringify(body)}),{params:Promise.resolve({id:'r'})});assert.equal(r.status,200);assert.equal(m.count(),0)});
test('only explicit submit reaches transfer',async()=>{const m=await route();await m.POST(new Request('https://app/api',{method:'POST',body:JSON.stringify({action:'submit'})}),{params:Promise.resolve({id:'r'})});assert.equal(m.count(),1)});
test('submitted INTTRA with paused T-MAXX is never sent twice',async()=>{const m=await route({paused:['tmaxx'],deliveries:[{platform:'inttra',status:'created'},{platform:'tmaxx',status:'unknown'}]});const r=await m.POST(new Request('https://app/api',{method:'POST',body:'{"action":"submit"}'}),{params:Promise.resolve({id:'r'})});assert.equal(r.status,200);assert.equal(m.count(),0);});
test('paused T-MAXX reference does not trigger lookup',async()=>{const m=await route({paused:['tmaxx'],manual:{tmaxxReference:'S.E.26.09.00636'}});const r=await m.POST(new Request('https://app/api',{method:'POST',body:'{"action":"check"}'}),{params:Promise.resolve({id:'r'})});assert.equal(r.status,200);assert.equal(m.count(),0);});
test('unknown actions cannot submit',async()=>{const m=await route();const r=await m.POST(new Request('https://app/api',{method:'POST',body:'{"action":"anything"}'}),{params:Promise.resolve({id:'r'})});assert.equal(r.status,400);assert.equal(m.count(),0)});

for(const reference of ['S.I.26.06.00208','T.I.26.06.00010','YK.T.I.26.06.00010'])test('import operation is blocked before lookup and transfer: '+reference,async()=>{
 const m=await route({manual:{tmaxxReference:reference},extraction:{fields:{},issues:[],documentType:'instruction'}});const r=await m.POST(new Request('https://app/api',{method:'POST',body:'{"action":"submit"}'}),{params:Promise.resolve({id:'r'})});assert.equal(r.status,200);assert.equal(m.count(),0);
});
test('non-instruction documents cannot submit even without an import reference',async()=>{const m=await route({extraction:{fields:{},issues:[],documentType:'other'}});const r=await m.POST(new Request('https://app/api',{method:'POST',body:'{"action":"submit"}'}),{params:Promise.resolve({id:'r'})});assert.equal(r.status,200);assert.equal(m.count(),0)});

test('source extraction remains saved when downstream lookup fails',async()=>{const extraction={fields:{shipperName:{value:'Example',source:'PDF page 1',confidence:1}},issues:[],documentType:'instruction',schemaVersion:7};const m=await route({manual:{tmaxxReference:'S.E.26.01.00001'},extraction});const response=await m.POST(new Request('https://app/api',{method:'POST',body:'{"action":"check"}'}),{params:Promise.resolve({id:'r'})});assert.equal(response.status,400);const write=m.writes.find(w=>w.sql==='UPDATE records SET extraction=?,fields=? WHERE id=?');assert.ok(write);assert.deepEqual(JSON.parse(write.args[0]),extraction);assert.equal(m.count(),0);});

test('schema 8 totals are repaired on check without extraction or platform submission',async()=>{
 const f=(value,source)=>({value,source,confidence:1});
 const documents=[{filename:'one.pdf',role:'instruction'},{filename:'two.pdf',role:'instruction'}];
 const containers=['MSNU8644653','MSMU5684659'].map((number,index)=>({containerNumber:f(number,documents[index].filename+' page 1: '+number),packageCount:f(String(index?771:744),documents[index].filename+' page 1: '+(index?771:744))}));
 const extraction={fields:{packageCount:{value:null,source:'',confidence:0}},issues:['Belge çelişkisi · Kap adedi: konteyner kapsamları eksik veya çakışıyor; toplam doğrulanmalı.'],documentType:'instruction',schemaVersion:8,containers,cargoLines:[],observations:[{key:'packageCount',value:'771',source:'771',page:1,documentIndex:2,scope:'shipment',containerNumbers:['MSMU5684659']}]};
 const manual={bookingNumber:'EBKG19125349',blReference:'MEDUJX351995',houseBills:[{number:'1046445'},{number:'1046446'}]};
 const m=await route({extraction,manual,documents});const response=await m.POST(new Request('https://app/api',{method:'POST',body:'{"action":"check"}'}),{params:Promise.resolve({id:'r'})});
 assert.equal(response.status,200);assert.equal(m.count(),0);
 const saved=m.writes.find(w=>w.sql==='UPDATE records SET extraction=?,fields=? WHERE id=?');
 const repaired=JSON.parse(saved.args[0]);assert.equal(repaired.schemaVersion,9);assert.equal(repaired.fields.packageCount.value,'1515');assert.deepEqual(repaired.issues,[]);
 const final=m.writes.find(w=>w.sql.startsWith('UPDATE records SET fields=?,extraction=?,manual='));assert.deepEqual(JSON.parse(final.args[2]),manual);
});


test('explicit warning approval travels with the submit request under the same processing lock',async()=>{
 const m=await route(),reviewApproval={inputHash:'a'.repeat(64),createdAt:'2026-10-28T00:00:00.000Z'};
 const r=await m.POST(new Request('https://app/api',{method:'POST',body:JSON.stringify({action:'submit',reviewApproval})}),{params:Promise.resolve({id:'r'})});
 assert.equal(r.status,200);assert.equal(m.count(),1);assert.deepEqual(m.approvals,[reviewApproval]);assert.ok(m.writes.some(w=>w.sql.includes('lock_until')));
});
test('malformed warning approval and approval attached to check cannot reach transfer',async()=>{
 for(const body of [{action:'check',reviewApproval:{inputHash:'a'.repeat(64),createdAt:'2026-10-28T00:00:00.000Z'}},{action:'submit',reviewApproval:null},{action:'submit',reviewApproval:{inputHash:'a'.repeat(64),createdAt:'invalid'}},{action:'submit',reviewApproval:{inputHash:'z'.repeat(64),createdAt:'2026-10-28T00:00:00.000Z'}}]){
 const m=await route(),r=await m.POST(new Request('https://app/api',{method:'POST',body:JSON.stringify(body)}),{params:Promise.resolve({id:'r'})});assert.equal(r.status,400);assert.equal(m.count(),0);assert.deepEqual(m.writes,[]);
 }
});


test('remaining T-MAXX resumes only on submit, preserving immutable instruction and INTTRA',async()=>{
 for(const action of ['check','submit']){
 const m=await route({manual:{tmaxxReference:'S.E.26.10.00754'},deliveries:[{platform:'inttra',status:'created'},{platform:'tmaxx',status:'failed',payload:'{}'}]});
 const r=await m.POST(new Request('https://app/api',{method:'POST',body:JSON.stringify({action})}),{params:Promise.resolve({id:'r'})});
 assert.equal(r.status,200);assert.equal(m.count(),action==='submit'?1:0);assert.ok(m.writes.every(w=>w.sql.includes('lock_until')));
 }
});
