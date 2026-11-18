import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {moduleAt,AppError} from './helpers/prealert-upload-fixture.mjs';

function load(){
 const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync('drizzle/0034_platform_health.sql','utf8'));
 const stmt=(q,a)=>({first:async()=>sql.prepare(q).get(...a)||null,all:async()=>({results:sql.prepare(q).all(...a)}),run:async()=>({meta:{changes:Number(sql.prepare(q).run(...a).changes)}})});
 const db=()=>({prepare:q=>({bind:(...a)=>stmt(q,a)})});
 return {sql,...moduleAt('lib/server/platform-health.ts',{AppError,db,console:{warn(){}}},'backoffMs,recordPlatformFailure,platformCooling,platformAvailable,refreshPlatformHealth,clearPlatformHealth,coolingMessage,coolingPlatforms')};
}
const MIN=60000;
test('security-wall rejections back off 30 min, doubling to at most 6 h; account rejections 6 h; other failures 10 min',()=>{
 const {backoffMs}=load();
 assert.deepEqual([1,2,3,4,5,6].map(n=>backoffMs(403,n)/MIN),[30,60,120,240,360,360]);
 assert.equal(backoffMs(429,1)/MIN,30);assert.equal(backoffMs(401,1)/MIN,360);assert.equal(backoffMs(400,3)/MIN,360);
 assert.equal(backoffMs(undefined,5)/MIN,10);assert.equal(backoffMs(502,1)/MIN,10);
});
test('a failure is stored, counted and visible until it ends; clearing makes the platform available again',async()=>{
 const h=load();
 const first=await h.recordPlatformFailure('inttra',403,'HTTP 403');assert.equal(first.failures,1);
 const second=await h.recordPlatformFailure('inttra',403,'HTTP 403');assert.equal(second.failures,2);assert.ok(second.blockedUntil-Date.now()>59*MIN);
 assert.equal(h.platformAvailable('inttra'),false);assert.equal(h.platformAvailable('tmaxx'),true);
 assert.match(h.coolingMessage(await h.platformCooling('inttra')),/INTTRA girişi geçici olarak bekletiliyor; \d{2}[.:]\d{2} sonrası yeniden denenecek/);
 await h.clearPlatformHealth('inttra');assert.equal(await h.platformCooling('inttra'),null);assert.equal(h.platformAvailable('inttra'),true);
});
test('an ended back-off is not reported and failures a day apart start counting again',async()=>{
 const h=load();
 h.sql.prepare("INSERT INTO platform_health VALUES('inttra',?,4,'old',?)").run(Date.now()-MIN,new Date(Date.now()-25*3600000).toISOString());
 assert.deepEqual(await h.refreshPlatformHealth(),[]);assert.equal(await h.platformCooling('inttra'),null);
 assert.equal((await h.recordPlatformFailure('inttra',403,'x')).failures,1);
 assert.deepEqual(await h.refreshPlatformHealth(),['inttra']);
});
