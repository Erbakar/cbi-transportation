import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const rows=new Map(),sessions=new Map([['alice:tmaxx','preserve'],['alice:inttra','preserve'],['alice:cma-cgm','old']]);
const env={ENCRYPTION_KEY:'ab'.repeat(32)};
const database={prepare(sql){let args;return {bind(...v){args=v;return this;},async run(){if(sql.startsWith('INSERT'))rows.set(args[0],args[1]);else sessions.delete(args[0]);}};},async batch(list){for(const s of list)await s.run();}};
async function readCredentials(owner,id){const raw=rows.get(owner+':'+id);if(!raw)return;const {iv,body}=JSON.parse(raw);const key=await crypto.subtle.importKey('raw',Buffer.from(env.ENCRYPTION_KEY,'hex'),'AES-GCM',false,['decrypt']);return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(iv)},key,new Uint8Array(body))));}
globalThis.__cma={database,env,readCredentials};
let src=fs.readFileSync('lib/server/cma-connection.ts','utf8').replace("import {AppError,db,runtime} from './runtime';",'class AppError extends Error {} const db=()=>globalThis.__cma.database;const runtime=()=>globalThis.__cma.env;').replace("import {readCredentials} from './platforms';",'const readCredentials=globalThis.__cma.readCredentials;');
const api=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
test('CMA encrypts owner-scoped account and preserves existing consignment sessions',async()=>{
 const status=await api.saveCmaCredentials('alice',' demo ','private-value');
 assert.equal(status.credentialsSaved,true);assert.equal(status.connected,false);assert.equal(status.submissionEnabled,false);
 assert.deepEqual(await readCredentials('alice','cma-cgm'),{username:'demo',password:'private-value'});
 assert.equal((await api.cmaConnection('bob')).credentialsSaved,false);
 assert.ok(!rows.get('alice:cma-cgm').includes('private-value'));
 assert.ok(!JSON.stringify(status).includes('private-value'));
 assert.equal(sessions.get('alice:tmaxx'),'preserve');assert.equal(sessions.get('alice:inttra'),'preserve');assert.equal(sessions.has('alice:cma-cgm'),false);
 await assert.rejects(api.saveCmaCredentials('alice','','p'));
});
test('probe never sends credentials, follows redirects, or equates a public page with login',async()=>{
 const original=globalThis.fetch;
 try{
  for(const code of [200,302,403,429,500]){
   globalThis.fetch=async(url,opts)=>{assert.equal(url,'https://www.cma-cgm.com/ebusiness/customer-hub/');assert.equal(opts.method,'GET');assert.equal(opts.redirect,'manual');assert.equal(opts.body,undefined);assert.equal(opts.headers,undefined);return new Response('',{status:code});};
   const state=await api.probeCmaConnection('alice');assert.equal(state.httpStatus,code);assert.equal(state.connected,false);assert.equal(state.submissionEnabled,false);
  }
  globalThis.fetch=async()=>{throw Error('secret network diagnostics');};
  assert.ok(!(await api.probeCmaConnection('alice')).message.includes('secret'));
  await assert.rejects(api.probeCmaConnection('bob'));
 }finally{globalThis.fetch=original;}
});
