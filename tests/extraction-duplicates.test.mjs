import {completeSourceReading} from '../lib/source-completion.ts';
import {completeCargoSummary} from '../lib/extraction-summary.ts';
import {quotedKilograms} from '../lib/quoted-number.ts';
import {normalizeManualFields} from '../lib/manual-number.ts';
import {normalizeTmaxxReference} from '../lib/tmaxx-reference.ts';
import {evidenceConflicts,scopedTotal,unallocatedCargoTotals,reconcileDocumentTotals} from '../lib/document-evidence.ts';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import {fieldNames} from '../lib/domain.ts';import {addressKeys,cargoKeys,partyRoles} from '../lib/inttra-quality.ts';
globalThis.__extractTest={completeSourceReading,completeCargoSummary,quotedKilograms,evidenceConflicts,scopedTotal,unallocatedCargoTotals,reconcileDocumentTotals,fieldNames,addressKeys,cargoKeys,partyRoles};let source=fs.readFileSync('lib/server/extraction.ts','utf8').replace("import {completePartyAddresses} from './party-address-completion';",'const completePartyAddresses=async ex=>ex;').replace("import {prepareCargoLanguage} from './cargo-language';",'const prepareCargoLanguage=async ex=>ex;').replace("import {spreadsheetTextEvidence,applySpreadsheetText} from '../spreadsheet-evidence';",'const spreadsheetTextEvidence=()=>({});const applySpreadsheetText=ex=>ex;').replace("import {completeSourceReading} from '../source-completion';",'const {completeSourceReading}=globalThis.__extractTest;').replace("import {spreadsheetMimes,spreadsheetPages,type SpreadsheetPage} from './spreadsheet-source';","const spreadsheetMimes=[];const spreadsheetPages=()=>[];").replace("import {completeCargoSummary} from '../extraction-summary';",'const {completeCargoSummary}=globalThis.__extractTest;').replace("import {quotedKilograms} from '../quoted-number';",'const {quotedKilograms}=globalThis.__extractTest;').replace("import {reconcileDocumentTotals} from '../document-evidence';",'const {reconcileDocumentTotals}=globalThis.__extractTest;').replace("import {pdfVisualPages,type VisualPage} from './pdf-visual-pages';","const pdfVisualPages=async bytes=>[{page:1,mime:'image/jpeg',data:'/9j/'+Buffer.from(bytes).toString('base64')}];").replace("import {evidenceConflicts,unallocatedCargoTotals,type Observation} from '../document-evidence';",'const {evidenceConflicts,scopedTotal,unallocatedCargoTotals}=globalThis.__extractTest;').replace("import {addressKeys,cargoKeys,partyRoles} from '../inttra-quality';",'const {addressKeys,cargoKeys,partyRoles}=globalThis.__extractTest;').replace("import WordExtractor from 'word-extractor';",'class WordExtractor {}').replace("import {fieldNames,Extraction} from '../domain';",'const {fieldNames}=globalThis.__extractTest;').replace("import {AppError,runtime} from './runtime';","class AppError extends Error {};const runtime=()=>({GEMINI_API_KEY:'test-only'});");const api=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
async function read(fields){
 const previous=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;if(calls===2)return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({pageKind:'shipment',documentType:'instruction',observations:[]})}]}}]});
  return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({observations:[],actualParties:partyRoles.map(role=>({role,...Object.fromEntries(addressKeys.map(k=>[k,{value:null,source:'',confidence:0}]))})),fields,containers:[],cargoLines:[],issues:[],documentType:'instruction',containerCount:0,cargoLineCount:0})}]}}]});};
 try{return await api.extractDocuments([{filename:'a.pdf',mime:'application/pdf',bytes:new TextEncoder().encode('a').buffer}]);}finally{globalThis.fetch=previous;}
}
const f=(key,value,confidence=1)=>({key,value,source:'p1: '+value,confidence});
test('a field read twice keeps the agreeing value and marks only a disagreeing one as a conflict',async()=>{
 const ex=await read([f('vessel','MSC FLORIANA'),f('vessel','MSC FLORIANA',.9),f('voyage','NT646R'),f('voyage','NT647R'),f('loadPort','ISTANBUL'),f('unknownKey','x')]);
 assert.equal(ex.fields.vessel.value,'MSC FLORIANA');assert.equal(ex.fields.voyage.value,null);assert.equal(ex.fields.loadPort.value,'ISTANBUL');
 assert.ok(ex.issues.includes('Belge çelişkisi · voyage: NT646R / NT647R'));
});
test('per-container values of a two-HBL set are left to cargo lines without a conflict',async()=>{
 const ex=await read([f('description','PVC ORDER 1299'),f('description','PVC ORDER 1301'),f('packageCount','613'),f('packageCount','692'),f('loadPort','ASYAPORT'),f('loadPort','MERSIN')]);
 assert.equal(ex.fields.description.value,null);assert.equal(ex.fields.packageCount.value,null);
 assert.deepEqual(ex.issues.filter(i=>i.startsWith('Belge çelişkisi')),['Belge çelişkisi · loadPort: ASYAPORT / MERSIN']);
});
test('an empty field list is still rejected',async()=>{await assert.rejects(read([]));});
