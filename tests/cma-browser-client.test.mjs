import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
const env={CMA_BROWSER_KEY:'a'.repeat(64),CMA_BROWSER_OWNER:'alice'};
globalThis.__cmaBrowserEnv=env;
const source=fs.readFileSync('lib/server/cma-browser.ts','utf8').replace("import {cloudCmaHistory} from './cma-history-store';",'const cloudCmaHistory=async()=>({state:"cloud"});').replace("import {AppError,runtime} from './runtime';",'class AppError extends Error {constructor(m:string,public status=400){super(m)}} const runtime=()=>globalThis.__cmaBrowserEnv;');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {cmaBrowser}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('only the configured application owner can reach the fixed local browser service',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'http://127.0.0.1:18745/status');assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,'Bearer '+env.CMA_BROWSER_KEY);return Response.json({connected:false,extensionOnline:false,state:'extension_offline',submissionEnabled:true});};
 try{assert.equal((await cmaBrowser('bob')).state,'not_configured');await assert.rejects(cmaBrowser('bob',true));assert.equal(calls,0);const state=await cmaBrowser('alice');assert.equal(state.submissionEnabled,false);assert.equal(JSON.stringify(state).includes(env.CMA_BROWSER_KEY),false);assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
test('local redirects are rejected without forwarding the shared key',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response(null,{status:302,headers:{Location:'https://example.invalid'}});};
 try{assert.equal((await cmaBrowser('alice')).state,'service_offline');await assert.rejects(cmaBrowser('alice',true),/yönlendirme/);assert.equal(calls,2);}finally{globalThis.fetch=original;}
});
