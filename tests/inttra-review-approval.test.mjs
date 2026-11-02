import {multiHblIntegrityIssues} from '../lib/inttra-hbl-integrity.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';

const digest=async value=>createHash('sha256').update(value).digest('hex');
async function setup(t,{age=0,approved=0,multiple=false,legacy=false}={}){
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  sql.exec(fs.readFileSync('drizzle/0005_platform_steps.sql','utf8'));
  const db=()=>({
    prepare(query){
      return {bind(...args){return {
        first:async()=>sql.prepare(query).get(...args)||null,
        run:async()=>({meta:{changes:Number(sql.prepare(query).run(...args).changes)}}),
      }}};
    },
  });
  const run={id:'record',revision:1,owner:'owner'},ex={fields:{bookingNumber:{value:'EBKG19125349'}}},manual={bookingNumber:'EBKG19125349'};
  if(multiple)manual.inttra={houseBill:'multiple'};
  const multiDraft=multiple?{HouseBillIndicator:'2',SIAttrs:{message:{AttrTypeCode:'4',AttrTypeOptionCode:'2',AttrValue:'ConsolidatedShipment'}},Containers:[{ContainerNumber:'MSMU5684659',ContainerLineItems:[{Sequence:1,LineItemReferences:{hbl:{LineItemReferenceTypeCode:'11',LineItemReferenceValue:'1046446'}},PartiesJBString:Object.fromEntries(['19','20','27'].map(code=>[code,{PartiesType:code,CompanyName:'Company',Street:'Street',StreetNumber:'23',City:'City',State:'Region',Zip:'34537',CountryGeoId:'101078'}]))}]}]}:{};
  const warnings=[{code:'10136',message:'Booking not found'}],inputHash=await digest(JSON.stringify({ex,manual,...(multiple||legacy?{}:{bookingCheckVersion:1})})),createdAt=new Date(Date.now()-age).toISOString();
  const payload={ShipmentInstruction:{...structuredClone(multiDraft),SiId:'123',ShipmentId:'draft-123'}};
  if(multiple)payload.ShipmentInstruction.SIAttrs.legacy={AttrTypeCode:'4',AttrTypeOptionCode:'3',AttrValue:'DirectShipment'};
  sql.prepare('INSERT INTO platform_reviews VALUES(?,?,?,?,?,?,?)').run(run.id,run.revision,inputHash,JSON.stringify(payload),JSON.stringify(warnings),approved,createdAt);
  const state={warnings:structuredClone(warnings),calls:[],steps:[],fail:false};
  class AppError extends Error {constructor(message,status=400){super(message);this.status=status}}
  const deps={db,digest,buildInttraDraft:()=>({ShipmentInstruction:{...structuredClone(multiDraft),booking:manual.bookingNumber}}),paymentLocations:async()=>({}),runStep:async(_run,platform,step,request,send)=>{state.steps.push({platform,step,request});return send()}};
  const fakeRequest=async(_owner,path)=>{state.calls.push(path);if(path==='/siact/review'){if(state.fail)throw new AppError('INTTRA unavailable',502);return {status:'OK',errorcode:'0000',content:{ShipmentInstruction:{...structuredClone(multiDraft),SiId:'123',ShipmentId:'draft-123',refreshed:true}},exceptions:state.warnings.map(w=>({...w,type:'001'}))}}if(['/siact/createPageParams','/siact/userParams'].includes(path))return {};throw Error('Unexpected platform write: '+path)};
  let source=fs.readFileSync(process.env.INTTRA_WORKFLOW_SOURCE||'lib/server/inttra-workflow.ts','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
  source=source.replace("await import('./inttra-builder')",'deps').replaceAll("await import('./runtime')",'deps').replaceAll("await import('./platform-journal')",'deps').replace("await import('./inttra-preflight')",'deps').replaceAll('await inttraRequest(', 'await fakeRequest(');
  const api=new Function('deps','AppError','fakeRequest','multiHblIntegrityIssues','resolveInttraBookingWarning',ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText+';return {prepareInttra,executeInttra}')(deps,AppError,fakeRequest,multiHblIntegrityIssues,async(_owner,_shipment,warnings)=>({warnings}));
  return {sql,state,run,ex,manual,approval:{inputHash,createdAt},prepare:approval=>api.prepareInttra(run,ex,manual,approval),execute:prepared=>api.executeInttra(run,prepared),stored:()=>sql.prepare('SELECT * FROM platform_reviews WHERE record_id=?').get(run.id)};
}

test('explicit approval persists and continues using the same fresh review',async t=>{
  const s=await setup(t),result=await s.prepare(s.approval);
  assert.equal(result.approved,true);assert.equal(s.stored().approved,1);assert.deepEqual(s.state.calls,[]);assert.equal(result.payload.ShipmentInstruction.SiId,'123');
  assert.equal((await s.prepare()).approved,true);
});

test('expired review is renewed and the explicit click approves only unchanged input and warnings',async t=>{
  const s=await setup(t,{age:31*60000}),result=await s.prepare(s.approval);
  assert.equal(result.approved,true);assert.equal(s.stored().approved,1);assert.notEqual(s.stored().created_at,s.approval.createdAt);
  assert.equal(result.payload.ShipmentInstruction.refreshed,true);assert.deepEqual(s.state.calls,['/siact/createPageParams','/siact/userParams','/siact/review']);
  assert.equal(s.state.steps[0].request.ShipmentInstruction.SiId,'123');assert.equal(s.state.steps[0].request.ShipmentInstruction.ShipmentId,'draft-123');
});

test('fresh or expired warning is never approved without an explicit click',async t=>{
  for(const age of [0,31*60000]){const s=await setup(t,{age});const result=await s.prepare();assert.equal(result.approved,false);assert.equal(s.stored().approved,0);await assert.rejects(s.execute(result),/onaylayın/);assert.ok(!s.state.calls.includes('/siact/submit'));}
});

test('expiry alone does not carry a previously saved approval into a renewed review',async t=>{
  const s=await setup(t,{age:31*60000,approved:1});assert.equal((await s.prepare()).approved,false);assert.equal(s.stored().approved,0);
});

test('changed booking input requires a new approval even when the warning text is the same',async t=>{
  const s=await setup(t);s.manual.bookingNumber='CHANGED';const result=await s.prepare(s.approval);
  assert.equal(result.approved,false);assert.notEqual(result.inputHash,s.approval.inputHash);assert.equal(s.stored().approved,0);
});

test('new or changed warnings cannot inherit the old warning approval',async t=>{
  for(const warnings of [[{code:'10136',message:'Changed warning'}],[{code:'10136',message:'Booking not found'},{code:'NEW',message:'Additional warning'}]]){
    const s=await setup(t,{age:31*60000});s.state.warnings=warnings;const result=await s.prepare(s.approval);
    assert.equal(result.approved,false);assert.deepEqual(result.warnings,warnings);assert.equal(s.stored().approved,0);
  }
});

test('an approval for a superseded review or revision is rejected before any platform request',async t=>{
  for(const change of ['hash','date','revision']){
    const s=await setup(t);const approval={...s.approval};if(change==='hash')approval.inputHash='f'.repeat(64);if(change==='date')approval.createdAt='2020-01-01T00:00:00.000Z';if(change==='revision')s.run.revision=2;
    await assert.rejects(s.prepare(approval),/kontrolü yenilendi/);assert.equal(s.stored().approved,0);assert.deepEqual(s.state.calls,[]);
  }
});

test('a failed refresh never records an approval or attempts final submission',async t=>{
  const s=await setup(t,{age:31*60000});s.state.fail=true;await assert.rejects(s.prepare(s.approval),/unavailable/);assert.equal(s.stored().approved,0);assert.ok(!s.state.calls.includes('/siact/submit'));
});

test('approval from the previous request format remains valid while the review is fresh',async t=>{
  const s=await setup(t,{approved:1});assert.equal((await s.prepare()).approved,true);assert.deepEqual(s.state.calls,[]);
});


test('a fresh legacy multi-HBL review is rebuilt with one message type and requires approval of the new review',async t=>{
 const s=await setup(t,{multiple:true,approved:1}),result=await s.prepare(s.approval);
 assert.notEqual(result.inputHash,s.approval.inputHash);assert.equal(result.approved,false);
 assert.deepEqual(s.state.calls,['/siact/createPageParams','/siact/userParams','/siact/review']);
 assert.equal(Object.values(result.payload.ShipmentInstruction.SIAttrs).filter(a=>a.AttrTypeCode==='4').length,1);
 const stored=s.stored();assert.equal((await s.prepare({inputHash:stored.input_hash,createdAt:stored.created_at})).approved,true);
 assert.equal(s.state.calls.length,3);
});


test('a fresh review predating the booking cross-check is renewed without inheriting approval',async t=>{
 const s=await setup(t,{legacy:true,approved:1}),result=await s.prepare(s.approval);
 assert.notEqual(result.inputHash,s.approval.inputHash);assert.equal(result.approved,false);
 assert.deepEqual(s.state.calls,['/siact/createPageParams','/siact/userParams','/siact/review']);
});
