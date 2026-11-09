import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import {addressKeys,partyRoles,requiredAddressKeys} from '../lib/inttra-quality.ts';
globalThis.__addressKeys={addressKeys,partyRoles,requiredAddressKeys};
const source=fs.readFileSync('lib/server/party-address-completion.ts','utf8').replace("import {addressKeys,partyRoles,requiredAddressKeys} from '../inttra-quality';",'const {addressKeys,partyRoles,requiredAddressKeys}=globalThis.__addressKeys;').replace("import {AppError,runtime} from './runtime';","class AppError extends Error{};const runtime=()=>({GEMINI_API_KEY:'test'});");
const {completePartyAddresses}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const f=value=>({value,source:'doc page 1: '+value,confidence:1});const party={role:'shipper',...Object.fromEntries(addressKeys.map(k=>[k,null])),street:'Main Street',streetNumber:'12',city:'London',postalCode:'SW1A 1AA',country:'UNITED KINGDOM'};
async function mock(value,run){const old=globalThis.fetch;globalThis.fetch=async()=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({parties:[value]})}]}}]});try{return await run()}finally{globalThis.fetch=old}}
const input=()=>({documentType:'instruction',fields:{shipperAddress:f('Main Street 12\nSW1A 1AA London, UNITED KINGDOM\nTEL: 123')},actualParties:{shipper:{city:f('London')}}});
test('focused address completion fills source-present details without changing full text or existing components',async()=>{
 const ex=input(),before=JSON.stringify(ex);const r=await mock(party,()=>completePartyAddresses(ex));assert.equal(r.actualParties.shipper.street.value,'Main Street');assert.equal(r.actualParties.shipper.streetNumber.value,'12');assert.equal(r.actualParties.shipper.postalCode.value,'SW1A 1AA');assert.equal(r.actualParties.shipper.city.source,ex.actualParties.shipper.city.source);assert.equal(r.actualParties.shipper.state,undefined);assert.equal(JSON.stringify(ex),before);
});
test('fabricated or wrong-role address components are rejected',async()=>{
 for(const p of [{...party,country:'UNITED STATES'},{...party,postalCode:'99999'},{...party,role:'consignee'}])await assert.rejects(mock(p,()=>completePartyAddresses(input())),/kaynak metin/);
});
test('missing address parts remain missing, and non-instructions do not call the model',async()=>{
 const r=await mock({...party,postalCode:null},()=>completePartyAddresses(input()));assert.equal(r.actualParties.shipper.postalCode,undefined);
 const ex={...input(),documentType:'other'};assert.equal(await completePartyAddresses(ex),ex);
});
