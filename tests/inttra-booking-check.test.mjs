import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {z} from 'zod';
import {checkInttraBooking} from '../scripts/inttra-booking-check.mjs';

function fixture(){
 const input={token:'test-token',bookingNumber:'EBKG123456',carrierId:'800541',companyId:'856675',blReference:'MEDUTEST',containerNumbers:['MSNU8644653','MSMU5684659']};
 const row={inttraReferenceNumber:'2121554905',carrierReferenceNumber:input.bookingNumber,carrierId:input.carrierId,companyIds:[input.companyId],state:'Confirmed'};
 const detail={...row,bookerId:input.companyId,state:'CONFIRM',payloadType:'ConfirmPending',version:1,audit:{createdDateUtc:'2026-10-31T20:29:51.470+0000'},payload:{bookingState:'CONFIRM',bookingResponseType:'Accepted',references:[{referenceType:'BookingNumber',referenceValue:input.bookingNumber},{referenceType:'BillOfLadingNumber',referenceValue:input.blReference}],equipments:input.containerNumbers.map(identifierValue=>({identifierValue}))}};
 const state={input,search:{total:1,results:[row]},details:[detail],calls:[]};
 state.request=async(url,options)=>{state.calls.push({url,options});return Response.json(url.endsWith('/search/simple')?state.search:state.details)};
 return state;
}
test('confirmed booking is verified only after exact carrier, company, BL and container checks',async()=>{
 const f=fixture(),r=await checkInttraBooking(f.input,f.request);
 assert.equal(r.status,'verified');assert.equal(r.inttraReference,'2121554905');assert.deepEqual(r.containerNumbers,f.input.containerNumbers);
 assert.deepEqual(f.calls.map(c=>[c.url,c.options.method]),[['https://api.inttra.e2open.com/booking/search/simple','POST'],['https://api.inttra.e2open.com/booking/2121554905','GET']]);
 assert.deepEqual(JSON.parse(f.calls[0].options.body),{from:0,size:50,query:'EBKG123456',sort:[]});assert.ok(f.calls.every(c=>c.options.redirect==='manual'));
});
test('EDI version=1 is ordered by audit time, regardless of array order',async()=>{
 const f=fixture(),older=structuredClone(f.details[0]);older.audit.createdDateUtc='2026-10-20T07:39:31.265+0000';older.payload.equipments=[];f.details.push(older);
 assert.equal((await checkInttraBooking(f.input,f.request)).status,'verified');
 f.details.reverse();assert.equal((await checkInttraBooking(f.input,f.request)).status,'verified');
});
test('partial, ambiguous, mismatched and cancelled bookings cannot resolve a warning',async()=>{
 const changes=[f=>f.search.total=51,f=>f.search.results.push(structuredClone(f.search.results[0])),f=>f.search.results[0].carrierId='999',f=>f.search.results[0].carrierReferenceNumber+='0',f=>f.search.results[0].state='Cancelled',f=>f.search.results[0].companyIds=['999'],f=>f.details[0].bookerId='999',f=>f.details[0].carrierId='999',f=>f.details[0].inttraReferenceNumber='999',f=>f.details[0].state='CANCEL',f=>f.details[0].payload.bookingState='CANCEL',f=>f.details[0].payload.references[1].referenceValue='OTHER',f=>f.details[0].payload.references[0].referenceValue='OTHER',f=>f.details[0].payload.equipments.pop(),f=>f.details[0].payload.equipments[0].identifierValue=null,f=>f.details[0].payload.equipments[0].identifierValue=f.input.containerNumbers[1],f=>f.details[0].audit.createdDateUtc='bad',f=>f.details.push(structuredClone(f.details[0]))];
 for(const change of changes){const f=fixture();change(f);assert.equal((await checkInttraBooking(f.input,f.request)).status,'unverified',String(change));}
 const f=fixture(),cancel=structuredClone(f.details[0]);cancel.audit.createdDateUtc='2026-11-01T10:00:00Z';cancel.state='CANCEL';f.details.push(cancel);assert.equal((await checkInttraBooking(f.input,f.request)).status,'unverified');
});
test('invalid input, missing session, redirects and unavailable responses fail closed',async()=>{
 for(const number of ['', 'EBKG1,EBKG2','x\nCookie:x']){const f=fixture();f.input.bookingNumber=number;assert.equal((await checkInttraBooking(f.input,f.request)).status,'unverified');assert.equal(f.calls.length,0);}
 const f=fixture();await assert.rejects(checkInttraBooking({...f.input,token:'x\r\ny'},f.request));assert.equal(f.calls.length,0);
 for(const status of [302,401,500])await assert.rejects(checkInttraBooking(f.input,async()=>new Response('',{status})));
 await assert.rejects(checkInttraBooking(f.input,async()=>new Response('not JSON')));
});

function serverSetup(){
 const f=fixture(),shipment={CreatorCompanyId:f.input.companyId,SICompanies:{Carrier:{ESCompanyId:f.input.carrierId}},SIReferences:{CarrierBookingNumber:{CarrierBookingNumber_1:{ReferenceValue:f.input.bookingNumber}},BLReferenceNumber:{BLReferenceNumber_1:{ReferenceValue:f.input.blReference}}},Containers:f.input.containerNumbers.map(ContainerNumber=>({ContainerNumber}))};
 const warnings=[{code:'10136',message:'Booking not found'},{code:'OTHER',message:'Review another field'}];
 const state={proof:{...f.input,token:undefined,status:'verified',source:'inttra-booking',inttraReference:'2121554905',checkedAt:new Date().toISOString(),confirmedAt:'2026-10-31T20:29:51.470Z'},calls:0};
 const source=fs.readFileSync('lib/server/inttra-booking-check.ts','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
 const resolve=new Function('z','runtime','contracts','platformSession','fetch',ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText+';return resolveInttraBookingWarning;')(z,()=>({INTTRA_RELAY_URL:'https://relay.test',INTTRA_RELAY_KEY:'key'}),()=>[{id:'inttra'}],async()=>({token:'test'}),async()=>{state.calls++;if(state.fail)throw Error('offline');return Response.json(state.proof)});
 return {state,shipment,warnings,resolve:()=>resolve('owner',shipment,warnings)};
}
test('verified secondary check resolves only 10136 and preserves source warnings and proof',async()=>{
 const f=serverSetup(),r=await f.resolve();assert.deepEqual(r.warnings,[f.warnings[1]]);assert.deepEqual(r.sourceWarnings,f.warnings);assert.equal(r.bookingCheck.status,'verified');assert.equal(f.state.calls,1);
});
test('warning approval stays required for unverifiable or stale evidence and service failures',async()=>{
 const changes=[f=>f.state.fail=true,f=>f.state.proof.status='unverified',f=>f.state.proof.bookingNumber='OTHER',f=>f.state.proof.carrierId='999',f=>f.state.proof.companyId='999',f=>f.state.proof.blReference='OTHER',f=>f.state.proof.containerNumbers=[],f=>f.state.proof.checkedAt='2020-01-01T00:00:00Z',f=>f.shipment.CreatorCompanyId=''];
 for(const change of changes){const f=serverSetup();change(f);const r=await f.resolve();assert.deepEqual(r.warnings,f.warnings);assert.equal(r.bookingCheck.status,'unverified');}
});
test('reviews without 10136 make no secondary request',async()=>{const f=serverSetup();f.warnings.splice(0,1);assert.deepEqual((await f.resolve()).warnings,f.warnings);assert.equal(f.state.calls,0)});
