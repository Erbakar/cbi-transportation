import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {bookingSchema,assessBooking,referenceKey,emptyBooking} from '../lib/operations/booking.ts';
const source=fs.readFileSync('app/api/bookings/route.ts','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {z}=await import('zod');
function setup(){
 const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync('drizzle/0006_booking_handover.sql','utf8'));
 const db=()=>({prepare(query){return {bind(...args){return {query,args,first:async()=>sql.prepare(query).get(...args)||null,all:async()=>({results:sql.prepare(query).all(...args)})}}}},async batch(commands){sql.exec('BEGIN');try{const results=commands.map(c=>({meta:{changes:Number(sql.prepare(c.query).run(...c.args).changes)}}));sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}});
 class AppError extends Error{constructor(message,status=400){super(message);this.status=status}}
 const requireUser=async req=>{const user=req.headers.get('x-test-user');if(!user)throw new AppError('Unauthorized',401);return user};
 const sameOrigin=req=>{if(req.headers.get('origin')!=='https://test')throw new AppError('Origin',403)};
 const route=new Function('z','requireUser','AppError','db','errorResponse','json','sameOrigin','bookingSchema','assessBooking','referenceKey',js+';return {GET,POST}')(z,requireUser,AppError,db,e=>Response.json({error:e.message},{status:e.status||500}),(data,status=200)=>Response.json(data,{status}),sameOrigin,bookingSchema,assessBooking,referenceKey);
 const request=(body,user='a',origin='https://test')=>new Request('https://test/api/bookings',{method:'POST',headers:{'x-test-user':user,origin},body:JSON.stringify(body)});
 return {route,request,sql};
}
test('create, reload, revise, audit and stale-update rejection',async()=>{const {route,request,sql}=setup();const draft={...emptyBooking,salesReference:'Q.26.1'};const r=await route.POST(request({draft}));assert.equal(r.status,201);const {booking}=await r.json();assert.equal(booking.assessment.status,'incomplete');const updated=await route.POST(request({id:booking.id,revision:1,draft:{...draft,customer:'Test'}}));assert.equal(updated.status,200);const stale=await route.POST(request({id:booking.id,revision:1,draft}));assert.equal(stale.status,409);assert.equal(sql.prepare('SELECT count(*) AS n FROM booking_handover_events').get().n,2);const list=await route.GET(new Request('https://test',{headers:{'x-test-user':'a'}}));assert.equal((await list.json()).bookings[0].draft.customer,'Test');sql.close()});
test('owner isolation and case-insensitive duplicate reference',async()=>{const {route,request,sql}=setup();const draft={...emptyBooking,salesReference:'Q.26.1'};const {booking}=await (await route.POST(request({draft}))).json();assert.equal((await route.POST(request({draft:{...draft,salesReference:' q.26.1 '}}))).status,409);assert.equal((await route.POST(request({id:booking.id,revision:1,draft},'b'))).status,409);const list=await route.GET(new Request('https://test',{headers:{'x-test-user':'b'}}));assert.equal((await list.json()).bookings.length,0);assert.equal((await route.POST(request({draft},'b'))).status,201);assert.equal(sql.prepare('SELECT count(*) AS n FROM booking_handover_events').get().n,2);sql.close()});
test('auth, origin, body limits and invalid values do not create records',async()=>{const {route,request,sql}=setup();const draft={...emptyBooking,salesReference:'Q.1'};assert.equal((await route.POST(request({draft},''))).status,401);assert.equal((await route.POST(request({draft},'a','https://other'))).status,403);assert.equal((await route.POST(request({draft:{...draft,notes:'x'.repeat(17000)}}))).status,413);assert.equal((await route.POST(request({draft:{...draft,equipmentCount:-1}}))).status,400);assert.equal(sql.prepare('SELECT count(*) AS n FROM booking_handovers').get().n,0);sql.close()});

test('direct booking detail loads only the owner record and rejects invalid or missing ids',async()=>{
 const {route,request,sql}=setup();
 const created=await route.POST(request({draft:{...emptyBooking,salesReference:'UI-DETAIL'}}));
 const {booking}=await created.json();
 const read=(id,user='a')=>route.GET(new Request('https://test/api/bookings?id='+encodeURIComponent(id),{headers:{'x-test-user':user}}));
 const own=await read(booking.id);assert.equal(own.status,200);assert.equal((await own.json()).bookings[0].id,booking.id);
 assert.equal((await read(booking.id,'b')).status,404);
 assert.equal((await read('not-a-uuid')).status,400);
 assert.equal((await read(crypto.randomUUID())).status,404);
 sql.close();
});
