import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
// Exercise the route with fully valid extraction and mocked storage/platforms.
async function route(){let transfers=0;const row={id:'r',owner:'u',status:'ready',revision:1,extraction:'{"fields":{}}',manual:'{}'};const stub=`
let transfers=0;export const count=()=>transfers;
const transfer=async()=>{transfers++},applyManual=x=>x,emptyManual={},manualIssues=()=>[],manualSchema={parse:()=>({})},requireUser=async()=>'u',sameOrigin=()=>{},owned=async()=>(${JSON.stringify(row)}),view=x=>x,sourceFiles=()=>[],extractDocuments=()=>{},contracts=()=>[],minimumFields=[],validate=()=>[];
class AppError extends Error{};const json=x=>Response.json(x),errorResponse=e=>Response.json({error:e.message},{status:400});
const db=()=>({prepare:()=>({bind(){return this},run:async()=>({meta:{changes:1}}),all:async()=>({results:[]}),first:async()=>null})});
`;
let source=fs.readFileSync('app/api/records/[id]/process/route.ts','utf8').replace(/^import .*;\n/gm,'');source=source.replace('let ex:Extraction=', 'let ex:any=');const js=ts.transpileModule(stub+source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(js+'\n//'+Math.random()).toString('base64'))}
for(const body of [undefined,{action:'check'}])test('checking a valid record never writes to platforms: '+JSON.stringify(body),async()=>{const m=await route();const r=await m.POST(new Request('https://app/api',{method:'POST',body:body&&JSON.stringify(body)}),{params:Promise.resolve({id:'r'})});assert.equal(r.status,200);assert.equal(m.count(),0)});
test('only explicit submit reaches transfer',async()=>{const m=await route();await m.POST(new Request('https://app/api',{method:'POST',body:JSON.stringify({action:'submit'})}),{params:Promise.resolve({id:'r'})});assert.equal(m.count(),1)});
test('unknown actions cannot submit',async()=>{const m=await route();const r=await m.POST(new Request('https://app/api',{method:'POST',body:'{"action":"anything"}'}),{params:Promise.resolve({id:'r'})});assert.equal(r.status,400);assert.equal(m.count(),0)});
