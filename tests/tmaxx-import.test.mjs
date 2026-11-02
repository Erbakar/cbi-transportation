import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
let seq=0;
async function harness({reference='YK.1',linked=7,id=40}={}){
 const paths=[];globalThis.__existingGet=async path=>{paths.push(path);return path.includes('getBySeaGoodId')?{id,seaGood:{id:linked},consignor:'Actual shipper',consignee:'Actual consignee',quantityAndDescription:'Actual cargo'}:{id:7,referenceNo:reference,hblNo:''}};
 const source=fs.readFileSync('lib/server/tmaxx-import.ts','utf8').replace("import {AppError} from './runtime';",'class AppError extends Error{}').replace("import {tmaxxClient} from './tmaxx-workflow';",'const tmaxxClient=async()=>globalThis.__existingGet;');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 return {paths,...await import('data:text/javascript;base64,'+Buffer.from(js+'\n//'+seq++).toString('base64'))};
}
test('existing HBL import retains actual data and blank numbers using only read paths',async()=>{const h=await harness();const [r]=await h.readExistingHbls('owner',[{goodId:7,reference:'YK.1'}]);assert.equal(r.waybillId,40);assert.equal(r.number,'');assert.equal(r.snapshot.shipper,'Actual shipper');assert.equal(r.source,'tmaxx-existing');assert.deepEqual(h.paths,['/api//sea/seaGood/7','/api//sea/def/seaGoodWaybill/getBySeaGoodId?goodId=7']);});
test('import rejects wrong load, unrelated or absent HBL and duplicate loads',async()=>{for(const options of [{reference:'WRONG'},{linked:8},{id:null}]){const h=await harness(options);await assert.rejects(h.readExistingHbls('owner',[{goodId:7,reference:'YK.1'}]));}const h=await harness();await assert.rejects(h.readExistingHbls('owner',[{goodId:7,reference:'YK.1'},{goodId:7,reference:'YK.1'}]));assert.equal(h.paths.length,0);});
