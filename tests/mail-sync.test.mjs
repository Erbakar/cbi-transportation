import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {moduleAt,AppError} from './helpers/prealert-upload-fixture.mjs';
import {openImap,ImapError} from '../lib/mail/imap.ts';
import {fakeImap,header} from './helpers/fake-imap.mjs';

function fixture(env={}){
 const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync('drizzle/0028_mail_inbox.sql','utf8'));sql.exec(fs.readFileSync('drizzle/0029_mail_replies.sql','utf8'));
 const stmt=(q,args)=>({first:async()=>sql.prepare(q).get(...args)||null,all:async()=>({results:sql.prepare(q).all(...args)}),run:async()=>({meta:{changes:Number(sql.prepare(q).run(...args).changes)}})});
 const db=()=>({prepare:q=>({bind:(...args)=>stmt(q,args)}),batch:async list=>{sql.exec('BEGIN');try{const out=[];for(const s of list)out.push(await s.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}});
 const config={MAIL_SYNC_ENABLED:'true',MAIL_IMAP_HOST:'mail.example.test',MAIL_IMAP_USER:'automation@example.test',MAIL_IMAP_PASSWORD:'secret',MAIL_SYNC_KEY:'b'.repeat(64),...env};
 let token=0;
 const mod=moduleAt('lib/server/mail-sync.ts',{AppError,db,runtime:()=>config,randomToken:()=>'lease'+(++token),openImap,ImapError,connect:()=>{throw Error('network must not be used');},console:{warn(){},log(){}}},'runMailSync,mailOverview,mailConfig,requireMailSyncKey');
 const state=()=>sql.prepare("SELECT * FROM mail_sync_state WHERE mailbox='INBOX'").get();
 const rows=()=>sql.prepare('SELECT uid,subject,from_address,attachments FROM mail_messages ORDER BY uid').all().map(r=>({...r}));
 return {...mod,sql,state,rows,config};
}
const msg=(uid,extra={})=>({uid,header:header({subject:'Mail '+uid,id:`<${uid}@x>`}),...extra});

test('first run imports the recent window only, then continues incrementally without duplicates',async()=>{
 const s=fixture(),messages=[msg(1,{old:true}),msg(2),msg(3)];let server;
 const open=()=>(server=fakeImap({messages}));
 assert.deepEqual(await s.runMailSync({},open),{status:'complete',imported:2,remaining:false});
 assert.deepEqual(s.rows().map(r=>r.uid),[2,3]);assert.equal(s.state().last_uid,3);assert.equal(s.state().lease,null);
 assert.ok(server.commands.some(c=>/^UID SEARCH SINCE \d{1,2}-[A-Z][a-z]{2}-\d{4}$/.test(c)));
 messages.push(msg(4,{structure:'(("text" "plain" NIL NIL NIL "7bit" 1 1 NIL NIL NIL NIL)("application" "pdf" NIL NIL NIL "base64" 9 NIL ("attachment" NIL) NIL NIL) "mixed" NIL NIL NIL NIL)'}));
 assert.deepEqual(await s.runMailSync({},open),{status:'complete',imported:1,remaining:false});
 assert.ok(server.commands.includes('UID SEARCH UID 4:*'));
 assert.deepEqual(s.rows().map(r=>[r.uid,r.attachments]),[[2,0],[3,0],[4,1]]);
 // Nothing new: the server echoes the last UID, which must not be re-imported.
 assert.deepEqual(await s.runMailSync({},open),{status:'complete',imported:0,remaining:false});assert.equal(s.rows().length,3);
});

test('an empty mailbox starts from its current end; a rebuilt mailbox does not duplicate by Message-ID',async()=>{
 const s=fixture();
 await s.runMailSync({},()=>fakeImap({messages:[]}));assert.equal(s.state().last_uid,0);
 await s.runMailSync({},()=>fakeImap({messages:[msg(5)]}));assert.deepEqual(s.rows().map(r=>r.uid),[5]);
 await s.runMailSync({},()=>fakeImap({uidValidity:99,messages:[{...msg(1),header:header({subject:'Mail 5',id:'<5@x>'})}]}));
 assert.equal(s.rows().length,1);assert.equal(s.state().uid_validity,99);
});

test('large backlogs are imported in batches of 100',async()=>{
 const s=fixture(),messages=Array.from({length:130},(_,i)=>msg(i+1));
 assert.deepEqual(await s.runMailSync({},()=>fakeImap({messages})),{status:'complete',imported:100,remaining:true});
 assert.deepEqual(await s.runMailSync({},()=>fakeImap({messages})),{status:'complete',imported:30,remaining:false});
 assert.equal(s.rows().length,130);
});

test('login failure backs off, keeps data, hides the password; manual check skips only the wait',async()=>{
 const s=fixture({MAIL_IMAP_PASSWORD:'Gizli!*Parola'});
 const result=await s.runMailSync({},()=>fakeImap({password:'other'}));
 assert.equal(result.status,'failed');assert.match(result.message,/kabul etmedi/);assert.doesNotMatch(JSON.stringify(result),/Gizli/);
 const st=s.state();assert.equal(st.failures,1);assert.equal(st.message,'auth_failed');assert.ok(st.next_at>Date.now()+4*60000);assert.equal(st.lease,null);
 assert.deepEqual(await s.runMailSync({},()=>{throw Error('cron must wait');}),{status:'waiting'});
 assert.equal((await s.runMailSync({manual:true},()=>fakeImap({password:'other'}))).status,'failed');assert.equal(s.state().failures,2);
 assert.ok(s.state().next_at>Date.now()+9*60000);
});

test('an active lease blocks concurrent runs, including manual ones',async()=>{
 const s=fixture();s.sql.prepare("UPDATE mail_sync_state SET lease='other',lease_until=? WHERE mailbox='INBOX'").run(Date.now()+60000);
 assert.deepEqual(await s.runMailSync({manual:true},()=>{throw Error('must not connect');}),{status:'busy'});
});

test('disabled or incomplete configuration never connects',async()=>{
 for(const env of [{MAIL_SYNC_ENABLED:''},{MAIL_IMAP_PASSWORD:''},{MAIL_IMAP_HOST:'bad host/x'}]){
  const s=fixture(env);assert.deepEqual(await s.runMailSync({},()=>{throw Error('must not connect');}),{status:'disabled'});
 }
});

test('internal endpoint requires the exact scheduler key',()=>{
 const s=fixture(),req=v=>new Request('https://x/api/internal/mail-sync',{method:'POST',headers:v?{Authorization:v}:{}});
 assert.doesNotThrow(()=>s.requireMailSyncKey(req('Bearer '+'b'.repeat(64))));
 for(const v of [null,'Bearer '+'c'.repeat(64),'Bearer short'])assert.throws(()=>s.requireMailSyncKey(req(v)),e=>e.status===401);
 assert.throws(()=>fixture({MAIL_SYNC_KEY:''}).requireMailSyncKey(req('Bearer '+'b'.repeat(64))),e=>e.status===503);
});

test('overview reports status, daily counts and recent messages without bodies',async()=>{
 const s=fixture();const now=new Date();const internal=d=>`${String(d.getUTCDate()).padStart(2,'0')}-${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]}-${d.getUTCFullYear()} ${String(d.getUTCHours()).padStart(2,'0')}:00:00 +0000`;
 await s.runMailSync({},()=>fakeImap({messages:[msg(1,{internal:internal(now)}),msg(2,{internal:internal(now)})]}));
 const o=await s.mailOverview();
 assert.equal(o.enabled,true);assert.equal(o.address,'automation@example.test');assert.equal(o.sync.status,'complete');assert.equal(o.sync.message,null);
 assert.equal(o.totals.messages,2);assert.equal(o.days.reduce((n,d)=>n+d.count,0),2);assert.equal(o.recent.length,2);
 assert.deepEqual(Object.keys(o.recent[0]).sort(),['attachments','cc','fromAddress','fromName','intake','intakeNote','receivedAt','subject','to','uid']);
});
