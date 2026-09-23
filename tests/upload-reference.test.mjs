import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
const source=fs.readFileSync('app/api/records/route.ts','utf8').replace(/^import .*;\n/gm,'');
const stub=`const emptyManual={};const sameOrigin=()=>{},requireUser=async()=>'owner',limitedForm=req=>req.formData();class AppError extends Error{};const errorResponse=e=>Response.json({error:e.message},{status:400});const db=()=>{throw Error('Unexpected write')};`;
const js=ts.transpileModule(stub+source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {POST}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('new upload requires a nonblank reference on server before any write',async()=>{for(const value of ['', '   ','x'.repeat(201),'bad\nreference']){const form=new FormData();form.set('tmaxxReference',value);const response=await POST(new Request('https://app/api/records',{method:'POST',body:form}));assert.equal(response.status,400);assert.match((await response.json()).error,/referans numarası/);}});
