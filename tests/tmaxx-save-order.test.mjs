import * as tmaxxFormat from '../lib/tmaxx-hbl-format.ts';globalThis.__tmaxxFormat=tmaxxFormat;
import {tmaxxValueEqual} from '../lib/tmaxx-values.ts';globalThis.__tmaxxValueEqual=tmaxxValueEqual;
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
const state=new Map([[1,{id:1,version:1,no:'DFSU7796423',containerType:{id:10},sealNo:'',grossWeight:0}],[2,{id:2,version:1,seaContainer:{id:1},quantity:0,packing:'',grossWeight:0,netWeight:0,goodDescription:'',volume:0}],[3,{id:3,version:1,hblNo:'',bookingNo:'',quantity:0,grossWeight:0,netWeight:0,volume:0}]]),writes=[];
globalThis.__tmaxxOrder={contracts:()=>[{id:'tmaxx',verified:true}],platformSession:async()=>({token:'test',cookie:''}),runStep:async(_run,_platform,_step,_body,send)=>send(),fetchJson:async(url,init)=>{
 if(init.method==='GET')return {data:structuredClone(state.get(Number(url.split('/').at(-1))))};
 const incoming=JSON.parse(init.body),before=state.get(incoming.id);assert.equal(incoming.version,before.version,'fresh parent versions must be read after cargo changes');writes.push(url.split('/').at(-1));const saved={...incoming,version:before.version+1};
 if(url.endsWith('seaContainer'))saved.grossWeight=state.get(2).grossWeight;
 state.set(saved.id,saved);
 if(url.endsWith('seaGoodPack')){state.set(1,{...state.get(1),grossWeight:saved.grossWeight,version:state.get(1).version+1});state.set(3,{...state.get(3),quantity:saved.quantity,grossWeight:saved.grossWeight,version:state.get(3).version+1});}
 return {data:structuredClone(saved)};
}};
let source=fs.readFileSync('lib/server/tmaxx-workflow.ts','utf8').replace("import {descriptionHasNetWeight,resolveTmaxxPacking,tmaxxHblPortName,type TmaxxPackingOption} from '../tmaxx-hbl-format';",'const {descriptionHasNetWeight,resolveTmaxxPacking,tmaxxHblPortName}=globalThis.__tmaxxFormat;').replace("import {tmaxxValueEqual} from '../tmaxx-values';","const tmaxxValueEqual=globalThis.__tmaxxValueEqual;").replace("import {cargoPrint} from '../shipment-rules';",'const cargoPrint=()=>{};').replace("import {AppError} from './runtime';",'class AppError extends Error{}').replace("import {contracts,fetchJson,platformSession} from './platforms';",'const {contracts,fetchJson,platformSession}=globalThis.__tmaxxOrder;').replace("const {runStep}=await import('./platform-journal');",'const {runStep}=globalThis.__tmaxxOrder;');
const {executeTmaxx}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
test('actual save workflow supports server-recalculated totals and changed parent versions',async()=>{
 const updates=[{path:'/api//sea/seaContainer',method:'PUT',entityId:1,body:{...state.get(1),grossWeight:23110}},{path:'/api//sea/seaGoodPack',method:'PUT',entityId:2,body:{...state.get(2),quantity:788,packing:'Package',grossWeight:23110,netWeight:22636.8,goodDescription:'Goods'}},{path:'/api//sea/seaGood',method:'PUT',entityId:3,body:{...state.get(3),quantity:788,grossWeight:23110,netWeight:22636.8,hblNo:'1046362',bookingNo:'EBKG18686156'}}];
 const result=await executeTmaxx({id:'test',owner:'test',revision:1},{updates,needsWaybill:false,goodId:3,reference:'existing'});assert.equal(result,'existing');assert.equal(state.get(1).grossWeight,23110);assert.equal(state.get(3).quantity,788);assert.deepEqual(writes,['seaGoodPack','seaContainer','seaGood']);assert.equal(updates[0].body.version,1);
});
test('an optional absent seal preserves the current server value during the final write',async()=>{
 const body={...state.get(1)};delete body.sealNo;
 state.set(1,{...state.get(1),sealNo:'ADDED-AFTER-PREVIEW',version:state.get(1).version+1});
 await executeTmaxx({id:'seal-test',owner:'test',revision:1},{updates:[{path:'/api//sea/seaContainer',method:'PUT',entityId:1,body}],needsWaybill:false,goodId:3,reference:'existing'});
 assert.equal(state.get(1).sealNo,'ADDED-AFTER-PREVIEW');assert.equal(Object.hasOwn(body,'sealNo'),false);
});
