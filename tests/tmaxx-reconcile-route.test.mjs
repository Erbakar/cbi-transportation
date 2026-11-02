import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
let serial=0;
async function harness({checkpoint=true,full=false,inttraCreated=true}={}){
 const row={id:'r',owner:'o',revision:1,fields:'{}',status:'unknown',lock_until:0};
 const deliveries=[{id:'t',platform:'tmaxx',status:'unknown',payload:'{"loads":[{"goodId":1}]}'},{id:'i',platform:'inttra',status:inttraCreated?'created':'waiting',reference:'551274342'}];
 const state={row,deliveries,steps:[{step:'load:1:container',status:'unknown',request_hash:'original-hash',result:null}],calls:[],batches:0};globalThis.__reconcileState=state;
 const stub=`
const state=globalThis.__reconcileState;class AppError extends Error{constructor(m,status){super(m);this.status=status;}}
const sameOrigin=()=>{},requireUser=async()=>'o',owned=async()=>state.row,view=async()=>({status:state.row.status,deliveries:state.deliveries}),json=Response.json,errorResponse=e=>Response.json({error:e.message},{status:e.status||500}),platformEnabled=()=>true,contracts=()=>[{id:'tmaxx'},{id:'inttra'}],overall=()=>state.deliveries.every(d=>d.status==='created')?'complete':'unknown';
const tmaxxSteps=async()=>({results:state.steps}),inspectTmaxxCheckpoint=async()=>{state.calls.push('read-checkpoint');if(!${checkpoint})throw new AppError('mismatch',409);return {remaining:true,verified:[{step:'load:1:container',requestHash:'original-hash',result:{id:11,version:2}}]};};
const reconcileTmaxxBatch=async()=>{state.calls.push('read-all');if(!${full})throw new AppError('Remaining values do not match',409);return [{goodId:1,reference:'HBL'}];},reconcile=()=>{throw Error('INTTRA must not be reconciled or resent');};
const db=()=>({prepare:sql=>({bind(...a){this.args=a;return this;},async first(){if(sql.includes("platform='inttra'"))return ${inttraCreated}?{id:'i'}:null;throw Error('unexpected first');},async all(){if(sql.includes("status IN ('unknown','sending')"))return {results:state.deliveries.filter(d=>['unknown','sending'].includes(d.status))};if(sql.startsWith('SELECT status'))return {results:state.deliveries};throw Error('Unexpected select '+sql);},async run(){const a=this.args;
 if(sql.startsWith('UPDATE records SET lock_until'))return {meta:{changes:1}};
 if(sql.startsWith('UPDATE platform_steps')){const s=state.steps[0];if(sql.includes('request_hash=?')){if(a[5]!==s.request_hash)throw Error('missing hash guard');s.status='complete';s.result=a[0];}else s.status='complete';}
 else if(sql.startsWith('INSERT INTO platform_steps')){}
 else if(sql.startsWith('UPDATE deliveries')){const d=state.deliveries[0];if(sql.includes("status='failed'")){d.status='failed';d.message=a[0];}else{d.status='created';d.reference=a[0];}}
 else if(sql.startsWith('UPDATE records SET status=')){state.row.status=a[0];state.row.issues='[]';}
 else throw Error('Unexpected write '+sql);
 return {meta:{changes:1}};}}),batch:async statements=>{state.batches++;return Promise.all(statements.map(s=>s.run()));}});
`;
 const source=fs.readFileSync('app/api/records/[id]/reconcile/route.ts','utf8').replace(/^import .*;\n/gm,'');
 const code=ts.transpileModule(stub+source+'\n//'+serial++,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const m=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 return {state,run:()=>m.POST(new Request('https://app/api/records/r/reconcile',{method:'POST'}),{params:Promise.resolve({id:'r'})})};
}
test('partial read-back atomically checkpoints T-MAXX and preserves completed INTTRA',async()=>{
 const h=await harness(),r=await h.run();assert.equal(r.status,200);assert.equal(h.state.row.status,'partial');assert.equal(h.state.deliveries[0].status,'failed');assert.equal(h.state.deliveries[1].status,'created');assert.equal(h.state.deliveries[1].reference,'551274342');assert.equal(h.state.steps[0].request_hash,'original-hash');assert.equal(h.state.steps[0].status,'complete');assert.equal(h.state.batches,1);assert.deepEqual(h.state.calls,['read-checkpoint']);
});
test('mismatched read-back does not clear the ambiguous step or allow retry',async()=>{
 const h=await harness({checkpoint:false}),r=await h.run();assert.equal(r.status,409);assert.equal(h.state.deliveries[0].status,'unknown');assert.equal(h.state.steps[0].status,'unknown');assert.equal(h.state.batches,0);
});
test('full reconciliation remains available for creation outcomes',async()=>{
 const h=await harness({checkpoint:false,full:true}),r=await h.run();assert.equal(r.status,200);assert.equal(h.state.deliveries[0].status,'created');assert.equal(h.state.row.status,'complete');assert.equal(h.state.deliveries[1].reference,'551274342');
});
test('partial resume cannot unlock editable instructions before INTTRA completion',async()=>{
 const h=await harness({inttraCreated:false}),r=await h.run();assert.equal(r.status,409);assert.equal(h.state.steps[0].status,'unknown');assert.deepEqual(h.state.calls,['read-all']);
});
