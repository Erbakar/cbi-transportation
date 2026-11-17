import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// inttraRequest with an expired INTTRA web session: reads sign in again once, writes never repeat.
function load({statuses}){
 const state={logins:[],calls:[]};
 class AppError extends Error{constructor(message,status=400){super(message);this.status=status;}}
 const contracts=()=>[{id:'inttra'}];
 const platformSession=async(_c,_owner,force=false)=>{state.logins.push(force);return {cookie:force?'fresh':'old'};};
 const runtime=()=>({INTTRA_RELAY_URL:'https://relay.test',INTTRA_RELAY_KEY:'k'});
 const fetch=async(_url,init)=>{const body=JSON.parse(init.body);state.calls.push({path:body.path,cookie:body.cookie});const status=statuses(body);return {ok:status<300,status,json:async()=>({ok:true})};};
 const source=fs.readFileSync('lib/server/inttra-workflow.ts','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
 const api=new Function('AppError','contracts','platformSession','runtime','fetch','inttraWireBody',ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText+';return {inttraRequest,ensureInttraSession}')(AppError,contracts,platformSession,runtime,fetch,p=>JSON.stringify(p));
 return {state,...api};
}
const expiredUntilFresh=b=>b.cookie==='old'?502:200;

test('an expired INTTRA session is opened again once for a read',async()=>{
 const s=load({statuses:expiredUntilFresh});
 await s.ensureInttraSession('o');
 assert.deepEqual(s.state.logins,[false,true]);assert.deepEqual(s.state.calls.map(c=>c.cookie),['old','fresh']);
});
for(const path of ['/siact/submit','/siact/review','/siact/saveDocument'])test(`${path} is never sent twice, even when the session expired`,async()=>{
 const s=load({statuses:expiredUntilFresh});
 await assert.rejects(s.inttraRequest('o',path,{}),/HTTP 502/);
 assert.equal(s.state.calls.length,1);assert.deepEqual(s.state.logins,[false]);
});
test('a read that still fails after signing in again is reported, not repeated further',async()=>{
 const s=load({statuses:()=>502});
 await assert.rejects(s.ensureInttraSession('o'),/HTTP 502/);
 assert.equal(s.state.calls.length,2);
});
