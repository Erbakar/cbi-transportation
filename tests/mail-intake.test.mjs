import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {moduleAt,AppError} from './helpers/prealert-upload-fixture.mjs';
import {openImap,parseAddress,decodeWords,utf8Base64} from '../lib/mail/imap.ts';
import {names} from '../lib/domain.ts';
import {fakeImap} from './helpers/fake-imap.mjs';
import {fakeSmtp} from './helpers/fake-smtp.mjs';

const {parseMail,replyText}=moduleAt('lib/mail/mime.ts',{decodeWords},'parseMail,replyText');
const smtp=moduleAt('lib/mail/smtp.ts',{utf8Base64},'sendSmtp,buildReply,validAddress,SmtpError');
const requests=moduleAt('lib/mail/requests.ts',{names},'customerRequests,requestText');
const ME='automation@cbitransport.com.tr';

function mime({from='Ops <ops@customer.com>',subject='Shipping instruction',id,inReplyTo='',text='Please see attached.',pdf=true}){
 const head=[`From: ${from}`,`To: ${ME}`,'Cc: burcees@cbitransport.com, stranger@else.com',`Subject: ${subject}`,`Message-ID: ${id}`,...(inReplyTo?[`In-Reply-To: ${inReplyTo}`,`References: ${inReplyTo}`]:[])];
 if(!pdf)return [...head,'Content-Type: text/plain; charset=utf-8','',text,''].join('\r\n');
 return [...head,'Content-Type: multipart/mixed; boundary="b"','','--b','Content-Type: text/plain; charset=utf-8','',text,'--b','Content-Type: application/pdf; name="talimat.pdf"','Content-Disposition: attachment; filename="talimat.pdf"','Content-Transfer-Encoding: base64','',Buffer.from('%PDF-1.7\n'+id).toString('base64'),'--b--',''].join('\r\n');
}

function fixture({script,env={},smtpOptions={}}={}){
 const sql=new DatabaseSync(':memory:');for(const f of ['0028_mail_inbox.sql','0029_mail_replies.sql'])sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
 const stmt=(q,args)=>({first:async()=>sql.prepare(q).get(...args)||null,all:async()=>({results:sql.prepare(q).all(...args)}),run:async()=>({meta:{changes:Number(sql.prepare(q).run(...args).changes)}})});
 const db=()=>({prepare:q=>({bind:(...a)=>stmt(q,a),first:()=>stmt(q,[]).first(),all:()=>stmt(q,[]).all(),run:()=>stmt(q,[]).run()}),batch:async list=>{sql.exec('BEGIN');try{for(const s of list)await s.run();sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}}});
 const config={MAIL_SYNC_ENABLED:'true',MAIL_INTAKE_ENABLED:'true',MAIL_ALLOWED_SENDERS:'customer.com, cbitransport.com',MAIL_IMAP_HOST:'mail.test',MAIL_IMAP_USER:ME,MAIL_IMAP_PASSWORD:'secret',APP_USERNAME:'cbi',...env};
 // Fake records: documents per record and a scripted check result per call.
 const records=new Map(),objects=new Map(),creates=[],checks=[],hashes=new Map();let n=0;
 const createRecord=async(owner,{sources,reference,recordId,keepManual})=>{
  const hash=sources.map(s=>Buffer.from(s.bytes).toString('base64')).join('|');if(!recordId&&hashes.has(hash))return {row:{id:hashes.get(hash)},duplicate:true};
  creates.push({owner,names:sources.map(s=>s.name),mimes:sources.map(s=>s.mime),reference,recordId,keepManual,texts:sources.filter(s=>s.mime==='text/plain').map(s=>new TextDecoder().decode(s.bytes))});
  const id=recordId||'rec-'+(++n);const docs=sources.map((s,i)=>{const key=id+'/'+creates.length+'/'+i;objects.set(key,s.bytes);return {filename:s.name,object_key:key,role:s.role,mime:s.mime};});
  records.set(id,{id,owner,docs});hashes.set(hash,id);return {row:{id},duplicate:false};
 };
 const checkRecord=async(owner,id)=>{const r=records.get(id);checks.push(id);const result=script(r,checks.length);if(result instanceof Error)throw result;return result;};
 const smtpServer=fakeSmtp(smtpOptions);const imapMessages=[];
 const deps={openImap:()=>fakeImap({messages:imapMessages}),openSmtp:()=>smtpServer.socket()};
 const {mailConfig}=moduleAt('lib/server/mail-sync.ts',{AppError,db,runtime:()=>config,randomToken:()=>'t',openImap,ImapError:Error,connect:()=>{throw Error('no network');},console},'mailConfig');
 let token=0;
 const mod=moduleAt('lib/server/mail-intake.ts',{AppError,db,runtime:()=>({...config,BUCKET:{get:async k=>objects.has(k)?{arrayBuffer:async()=>objects.get(k)}:null}}),randomToken:()=>String(++token).padStart(64,'0'),openImap,parseAddress,parseMail,replyText,...smtp,...requests,createRecord,checkRecord,detectFile:(bytes,name)=>{if(name.endsWith('.pdf'))return 'application/pdf';throw new AppError('unsupported');},documentsFor:async r=>records.get(r.id).docs,owned:async id=>records.get(id),mailConfig,connect:()=>{throw Error('no network');},console:{warn(){},log(){}}},'runMailIntake,senderAllowed,mailThreads,MAX_ROUNDS');
 let uid=0;
 const receive=(raw,{automated=0,from='ops@customer.com',received=new Date(Date.now()+60000).toISOString(),attachments=1}={})=>{
  const u=++uid,headers=parseMail(new TextEncoder().encode(raw)).headers;imapMessages.push({uid:u,raw,header:''});
  sql.prepare("INSERT INTO mail_messages(mailbox,uid_validity,uid,message_id,from_address,to_addresses,cc_addresses,subject,received_at,attachments,in_reply_to,references_header,automated,synced_at) VALUES('INBOX',7,?,?,?,?,?,?,?,?,?,?,?,?)").run(u,headers.get('message-id')||null,from,headers.get('to')||'',headers.get('cc')||'',decodeWords(headers.get('subject')||''),received,attachments,headers.get('in-reply-to')||null,headers.get('references')||'',automated,received);
  return u;
 };
 const msg=u=>sql.prepare("SELECT intake_state,intake_note,thread_id FROM mail_messages WHERE uid=?").get(u);
 const thread=()=>sql.prepare('SELECT * FROM mail_threads').get();
 const outbox=()=>sql.prepare('SELECT * FROM mail_outbox ORDER BY round').all();
 const sentBodies=()=>smtpServer.log.data.split(/\r\n\.\r\n|(?=^From: )/m).filter(Boolean);
 return {sql,mod,deps,receive,msg,thread,outbox,creates,checks,smtp:smtpServer,run:(o={limit:5})=>mod.runMailIntake(o,deps),sentBodies,config};
}
const missing=issues=>({status:'missing',issues});
const body=raw=>Buffer.from(raw.split('\r\n\r\n')[1].replace(/\r\n/g,''),'base64').toString();

test('instruction with missing customer data gets one reply; the answer completes the SAME record',async()=>{
 const f=fixture({script:(r,call)=>call===1?missing(['Brüt ağırlık: belgede bulunamadı.','Konteyner 1: Mühür numarası eksik veya belirsiz.','MBL gönderen: belgede bulunamadı.']):{status:'ready',issues:[]}});
 const first=f.receive(mime({id:'<c1@customer.com>',subject:'Shipping instruction S.E.26.11.00123'}));
 assert.deepEqual(await f.run(),{status:'complete',processed:1});
 assert.deepEqual(f.creates[0],{owner:'cbi',names:['talimat.pdf'],mimes:['application/pdf'],reference:'S.E.26.11.00123',recordId:undefined,keepManual:undefined,texts:[]});
 const t=f.thread();assert.equal(t.state,'waiting_customer');assert.equal(t.rounds,1);assert.equal(t.customer,'ops@customer.com');assert.deepEqual(JSON.parse(t.cc),['burcees@cbitransport.com'],'only allowed colleagues are copied');
 const [out]=f.outbox();assert.equal(out.state,'sent');assert.deepEqual(JSON.parse(out.recipients),{to:['ops@customer.com'],cc:['burcees@cbitransport.com']});
 assert.match(out.subject,/^Re: Shipping instruction S\.E\.26\.11\.00123 \[CBI-[0-9A-F]{6}\]$/);
 assert.match(out.body,/^In-Reply-To: <c1@customer\.com>$/m);
 const text=body(out.body);assert.match(text,/1\. Brüt ağırlık \(kg\)/);assert.match(text,/Konteyner 1 – Mühür numarası/);assert.doesNotMatch(text,/MBL/);assert.match(text,/Gross weight/);
 assert.equal(f.msg(first).intake_state,'done');assert.equal(f.smtp.log.commands.filter(c=>c==='DATA').length,1);
 // Customer answers in the thread: text + no new file. Same record, operator values kept.
 const reply=f.receive(mime({id:'<c2@customer.com>',subject:'RE: '+out.subject,inReplyTo:out.message_id,pdf:false,text:'Gross weight 12400 kg, seal ML123\r\n\r\nOn Mon CBI wrote:\r\n> 1. Brüt ağırlık'}),{attachments:0});
 await f.run();
 const second=f.creates[1];assert.equal(second.recordId,'rec-1');assert.equal(second.keepManual,true);assert.deepEqual(second.mimes,['application/pdf','text/plain']);
 assert.match(second.texts[0],/Gross weight 12400 kg, seal ML123/);assert.doesNotMatch(second.texts[0],/On Mon CBI wrote/);
 assert.equal(f.thread().state,'complete');assert.equal(f.outbox().length,1,'no further e-mail once ready');assert.equal(f.msg(reply).intake_state,'done');
});

test('still missing after replies: asks again with only the remaining items, then hands over to staff after three rounds',async()=>{
 const f=fixture({script:()=>missing(['Navlun ödeme: belgede bulunamadı.'])});
 f.receive(mime({id:'<c1@customer.com>'}));await f.run();
 for(let i=2;i<=4;i++){const last=f.outbox().at(-1);f.receive(mime({id:`<c${i}@customer.com>`,subject:'RE: '+last.subject,inReplyTo:last.message_id,pdf:false,text:'prepaid I think'}),{attachments:0});await f.run();}
 const out=f.outbox();assert.equal(out.length,3);assert.deepEqual(out.map(o=>o.round),[1,2,3]);
 assert.match(body(out[1].body),/hâlâ eksik/);assert.match(body(out[2].body),/operasyon ekibimiz dönüş yapacaktır/);
 assert.equal(f.thread().state,'staff');assert.match(f.thread().note,/3 yanıttan sonra/);
 assert.equal(new Set(out.map(o=>o.subject)).size,1,'the subject stays stable for threading');
});

test('a reply found only by the [CBI-xxxxxx] tag still joins the record',async()=>{
 const f=fixture({script:(r,call)=>call===1?missing(['Hacim (m³): belgede bulunamadı.']):{status:'ready',issues:[]}});
 f.receive(mime({id:'<c1@customer.com>'}));await f.run();const tag=f.thread().tag;
 f.receive(mime({id:'<new@customer.com>',subject:`Volume for ${tag}`,pdf:true}));await f.run();
 assert.equal(f.creates[1].recordId,'rec-1');assert.equal(f.thread().state,'complete');
});

test('only CBI-side gaps: no customer e-mail, the thread goes to staff',async()=>{
 const f=fixture({script:()=>missing(['MBL gönderen: belgede bulunamadı.','Booking numarası: belgede bulunamadı.'])});
 f.receive(mime({id:'<c1@customer.com>'}));await f.run();
 assert.equal(f.outbox().length,0);assert.equal(f.thread().state,'staff');assert.equal(f.smtp.log.commands.length,0);
});

test('not an instruction or ready at once: no e-mail',async()=>{
 for(const result of [{status:'blocked',issues:['Bu dosya yeni denizyolu ihracat konşimento talimatı olarak işlenemez.']},{status:'ready',issues:[]}]){
  const f=fixture({script:()=>result});f.receive(mime({id:'<c1@customer.com>'}));await f.run();
  assert.equal(f.outbox().length,0);assert.equal(f.thread().state,result.status==='ready'?'complete':'staff');
 }
});

test('auto-replies, unknown senders, own mail, mail without files and old mail are never answered',async()=>{
 const f=fixture({script:()=>missing(['Brüt ağırlık: belgede bulunamadı.'])});
 await f.run({limit:0});// switches the loop on now
 const old=f.receive(mime({id:'<old@customer.com>'}),{received:'2020-01-01T00:00:00.000Z'});
 const auto=f.receive(mime({id:'<a@customer.com>'}),{automated:1});
 const stranger=f.receive(mime({id:'<s@else.com>',from:'x@else.com'}),{from:'x@else.com'});
 const own=f.receive(mime({id:'<o@x>',from:ME}),{from:ME});
 const plain=f.receive(mime({id:'<p@customer.com>',pdf:false}),{attachments:0});
 await f.run();
 assert.equal(f.msg(old).intake_state,'observed');
 for(const u of [auto,stranger,own,plain])assert.equal(f.msg(u).intake_state,'ignored');
 assert.equal(f.creates.length,0);assert.equal(f.outbox().length,0);assert.equal(f.smtp.log.commands.length,0);
});

test('a reply that may have been delivered is never sent twice',async()=>{
 const f=fixture({script:()=>missing(['Brüt ağırlık: belgede bulunamadı.']),smtpOptions:{failAt:'message-close'}});
 f.receive(mime({id:'<c1@customer.com>'}));await f.run();
 assert.equal(f.outbox()[0].state,'unknown');assert.equal(f.thread().state,'staff');
 await f.run();await f.run();
 assert.equal(f.smtp.log.commands.filter(c=>c==='DATA').length,1);
});

test('a refused login before DATA is retried later, then reported',async()=>{
 const f=fixture({script:()=>missing(['Brüt ağırlık: belgede bulunamadı.']),smtpOptions:{password:'other'}});
 f.receive(mime({id:'<c1@customer.com>'}));await f.run();
 assert.equal(f.outbox()[0].state,'failed');assert.equal(f.outbox()[0].error,'auth_failed');assert.equal(f.thread().state,'staff');
 assert.equal(f.smtp.log.commands.filter(c=>c==='DATA').length,0);
});

test('a temporary failure (AI unavailable) leaves the mail pending, then marks it failed after three tries',async()=>{
 const f=fixture({script:()=>new AppError('Yapay zekâ bağlantısı henüz tanımlanmadı.',503)});
 const u=f.receive(mime({id:'<c1@customer.com>'}));
 await f.run();assert.equal(f.msg(u).intake_state,'pending');
 // Retries reuse the same record (duplicate documents) instead of creating new ones.
 await f.run();await f.run();assert.equal(f.msg(u).intake_state,'failed');assert.equal(f.outbox().length,0);assert.equal(new Set(f.creates.map(c=>c.names.join())).size,1);assert.equal(f.checks.length,3);assert.ok(f.checks.every(id=>id==='rec-1'));
});

test('disabled without an allow-list; addresses and sub-domains match exactly',async()=>{
 const f=fixture({script:()=>({status:'ready'}),env:{MAIL_ALLOWED_SENDERS:''}});assert.deepEqual(await f.run(),{status:'disabled'});
 assert.equal(f.mod.senderAllowed('a@ops.customer.com',['customer.com']),true);
 assert.equal(f.mod.senderAllowed('a@evilcustomer.com',['customer.com']),false);
 assert.equal(f.mod.senderAllowed('boss@x.com',['boss@x.com']),true);assert.equal(f.mod.senderAllowed('other@x.com',['boss@x.com']),false);
});
