import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
const uri=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const src=fs.readFileSync('lib/server/inttra-duplicate.ts','utf8')
 .replace("import {AppError,db} from './runtime';",'class AppError extends Error{constructor(m,s){super(m);this.status=s}};const db=()=>globalThis.__dupDB;')
 .replace("import {inttraHistory} from './inttra-history';",'const inttraHistory=async()=>globalThis.__dupHistory();');
const {requireNoInttraDuplicate}=await import(uri(src));
function setup({local=null,rows=[],fail=false}={}){const seen={};globalThis.__dupDB={prepare(sql){return {bind(...a){seen.args=a;return {first:async()=>local}}}}};globalThis.__dupHistory=async()=>{if(fail)throw Error('relay down');return {rows}};return seen;}
const row=(siId,carrierBooking,status='Submitted',ack='')=>({siId,carrierBooking,status,carrierAcknowledgmentStatus:ack});
test('an SI already sent by the system (deleted record included) blocks a new one',async()=>{const seen=setup({local:{reference:'552486936'}});await assert.rejects(requireNoInttraDuplicate('o','r','ebkg19335968'),e=>e.status===409&&/552486936/.test(e.message));assert.equal(seen.args[2],'"EBKG19335968"');});
test('an SI found in INTTRA for the same booking blocks a new one',async()=>{setup({rows:[row('1','OTHER'),row('552486936','EBKG 19335968')]});await assert.rejects(requireNoInttraDuplicate('o','r','EBKG19335968'),e=>e.status===409&&/SI 552486936/.test(e.message));});
test('cancelled or rejected SIs do not block, other bookings pass',async()=>{setup({rows:[row('1','EBKG19335968','Cancelled'),row('2','EBKG19335968','Submitted','Rejected'),row('3','EBKG1')]});await requireNoInttraDuplicate('o','r','EBKG19335968');});
test('unreadable INTTRA history stops the submission instead of risking a duplicate',async()=>{setup({fail:true});await assert.rejects(requireNoInttraDuplicate('o','r','EBKG19335968'),e=>e.status===409&&/okunamadı/.test(e.message));});
test('no booking means nothing to compare',async()=>{setup({fail:true});await requireNoInttraDuplicate('o','r','');});
