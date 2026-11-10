import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {moduleAt,AppError} from './helpers/prealert-upload-fixture.mjs';
import {openImap,parseAddress,decodeWords,utf8Base64} from '../lib/mail/imap.ts';
import {names} from '../lib/domain.ts';
import {fakeImap} from './helpers/fake-imap.mjs';
import {fakeSmtp} from './helpers/fake-smtp.mjs';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(Buffer.from(b)).digest('hex');

const {parseMail,replyText}=moduleAt('lib/mail/mime.ts',{decodeWords},'parseMail,replyText');
const smtp=moduleAt('lib/mail/smtp.ts',{utf8Base64},'sendSmtp,buildReply,validAddress,SmtpError');
const requests=moduleAt('lib/mail/requests.ts',{names},'customerRequests,requestText,confirmText');
const analysisLib=moduleAt('lib/server/mail-analysis.ts',{AppError,runtime:()=>({})},'needsStaff,analysisNote,parseAnalysis,EMPTY,FAILED');
const plainAnalysis=({stage})=>({intent:stage==='new'?'instruction':'answer',hasShipmentData:false,requests:[],summary:'test'});
const ME='automation@cbitransport.com.tr';

function mime({from='Ops <ops@customer.com>',subject='Shipping instruction',id,inReplyTo='',text='Please see attached.',pdf=true,content}){
 const head=[`From: ${from}`,`To: ${ME}`,'Cc: burcees@cbitransport.com, stranger@else.com',`Subject: ${subject}`,`Message-ID: ${id}`,...(inReplyTo?[`In-Reply-To: ${inReplyTo}`,`References: ${inReplyTo}`]:[])];
 if(!pdf)return [...head,'Content-Type: text/plain; charset=utf-8','',text,''].join('\r\n');
 return [...head,'Content-Type: multipart/mixed; boundary="b"','','--b','Content-Type: text/plain; charset=utf-8','',text,'--b','Content-Type: application/pdf; name="talimat.pdf"','Content-Disposition: attachment; filename="talimat.pdf"','Content-Transfer-Encoding: base64','',Buffer.from('%PDF-1.7\n'+(content||id)).toString('base64'),'--b--',''].join('\r\n');
}

function fixture({script,env={},smtpOptions={},analyze=plainAnalysis}={}){
 const sql=new DatabaseSync(':memory:');for(const f of ['0028_mail_inbox.sql','0029_mail_replies.sql','0030_mail_hold.sql'])sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
 sql.exec("CREATE TABLE records(id TEXT PRIMARY KEY,owner TEXT,status TEXT,fields TEXT,revision INTEGER DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP);CREATE TABLE record_documents(record_id TEXT,revision INTEGER,hash TEXT,mime TEXT);CREATE TABLE deliveries(record_id TEXT,platform TEXT,kind TEXT,status TEXT,reference TEXT,updated_at TEXT)");
 const stmt=(q,args)=>({first:async()=>sql.prepare(q).get(...args)||null,all:async()=>({results:sql.prepare(q).all(...args)}),run:async()=>({meta:{changes:Number(sql.prepare(q).run(...args).changes)}})});
 const db=()=>({prepare:q=>({bind:(...a)=>stmt(q,a),first:()=>stmt(q,[]).first(),all:()=>stmt(q,[]).all(),run:()=>stmt(q,[]).run()}),batch:async list=>{sql.exec('BEGIN');try{for(const s of list)await s.run();sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}}});
 const config={MAIL_SYNC_ENABLED:'true',MAIL_INTAKE_ENABLED:'true',MAIL_ALLOWED_SENDERS:'customer.com, cbitransport.com',MAIL_IMAP_HOST:'mail.test',MAIL_IMAP_USER:ME,MAIL_IMAP_PASSWORD:'secret',APP_USERNAME:'cbi',...env};
 // Fake records: documents per record and a scripted check result per call.
 const records=new Map(),objects=new Map(),creates=[],checks=[],hashes=new Map(),analyses=[];let n=0;
 const createRecord=async(owner,{sources,reference,recordId,keepManual})=>{
  const hash=sources.map(s=>Buffer.from(s.bytes).toString('base64')).join('|');if(!recordId&&hashes.has(hash))return {row:{id:hashes.get(hash)},duplicate:true};
  creates.push({owner,names:sources.map(s=>s.name),mimes:sources.map(s=>s.mime),reference,recordId,keepManual,texts:sources.filter(s=>s.mime==='text/plain').map(s=>new TextDecoder().decode(s.bytes))});
  const id=recordId||'rec-'+(++n);const docs=sources.map((s,i)=>{const key=id+'/'+creates.length+'/'+i;objects.set(key,s.bytes);return {filename:s.name,object_key:key,role:s.role,mime:s.mime,hash:sha(s.bytes)};});
  records.set(id,{...records.get(id),id,owner,docs});sql.prepare('DELETE FROM record_documents WHERE record_id=?').run(id);for(const d of docs)sql.prepare('INSERT INTO record_documents VALUES(?,1,?,?)').run(id,d.hash,d.mime);hashes.set(hash,id);sql.prepare("INSERT OR IGNORE INTO records(id,owner,status) VALUES(?,?,'uploaded')").run(id,owner);return {row:{id},duplicate:false};
 };
 const checkRecord=async(owner,id,action)=>{const r=records.get(id);checks.push(id);const result=script(r,checks.length,action);if(result instanceof Error)throw result;return result;};
 const smtpServer=fakeSmtp(smtpOptions);const imapMessages=[];
 const deps={openImap:()=>fakeImap({messages:imapMessages}),openSmtp:()=>smtpServer.socket()};
 const {mailConfig}=moduleAt('lib/server/mail-sync.ts',{AppError,db,runtime:()=>config,randomToken:()=>'t',openImap,ImapError:Error,connect:()=>{throw Error('no network');},console},'mailConfig');
 let token=0;
 const mod=moduleAt('lib/server/mail-intake.ts',{AppError,db,runtime:()=>({...config,BUCKET:{get:async k=>objects.has(k)?{arrayBuffer:async()=>objects.get(k)}:null}}),randomToken:()=>String(++token).padStart(64,'0'),openImap,parseAddress,parseMail,replyText,...smtp,...requests,createRecord,checkRecord,detectFile:(bytes,name)=>{if(name.endsWith('.pdf'))return 'application/pdf';throw new AppError('unsupported');},documentsFor:async r=>records.get(r.id).docs,owned:async id=>({...records.get(id),status:sql.prepare('SELECT status FROM records WHERE id=?').get(id)?.status}),digest:async b=>sha(b),mailConfig,...analysisLib,analyzeMail:async input=>{analyses.push(input);const r=await analyze(input);if(r instanceof Error)throw r;return r;},connect:()=>{throw Error('no network');},console:{warn(){},log(){}}},'runMailIntake,senderAllowed,mailThreads,MAX_ROUNDS');
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
 return {sql,mod,deps,receive,msg,thread,outbox,creates,checks,analyses,smtp:smtpServer,run:(o={limit:5})=>mod.runMailIntake(o,deps),sentBodies,config};
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

test('not an instruction, ready at once or already completed: no e-mail',async()=>{
 for(const result of [{status:'blocked',issues:['Bu dosya yeni denizyolu ihracat konşimento talimatı olarak işlenemez.']},{status:'ready',issues:[]},{status:'complete',issues:[]}]){
  const f=fixture({script:()=>result});f.receive(mime({id:'<c1@customer.com>'}));await f.run();
  assert.equal(f.outbox().length,0);assert.equal(f.thread().state,result.status==='blocked'?'staff':'complete');if(result.status==='complete')assert.match(f.thread().note,/daha önce işlenmiş/);
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
 const g=fixture({script:()=>({status:'ready',issues:[]}),env:{MAIL_ALLOWED_SENDERS:'',MAIL_ALLOWED_EXTRA:'me@gmail.com'}});g.receive(mime({id:'<g@gmail.com>',from:'me@gmail.com'}),{from:'me@gmail.com'});await g.run();assert.equal(g.thread().customer,'me@gmail.com','an address in the extra list is allowed on its own');
 const h=fixture({script:()=>({status:'ready',issues:[]}),env:{MAIL_ALLOWED_EXTRA:'me@gmail.com'}});h.receive(mime({id:'<o@gmail.com>',from:'other@gmail.com'}),{from:'other@gmail.com'});await h.run();assert.equal(h.thread(),undefined,'other addresses on the same domain stay blocked');
 assert.equal(f.mod.senderAllowed('a@evilcustomer.com',['customer.com']),false);
 assert.equal(f.mod.senderAllowed('boss@x.com',['boss@x.com']),true);assert.equal(f.mod.senderAllowed('other@x.com',['boss@x.com']),false);
});

test('new files in a conversation already with staff join the SAME record without a new question',async()=>{
 const f=fixture({script:(r,call)=>call===1?missing(['Booking numarası: belgede bulunamadı.']):missing(['Brüt ağırlık: belgede bulunamadı.','Booking numarası: belgede bulunamadı.'])});
 f.receive(mime({id:'<c1@customer.com>'}));await f.run();assert.equal(f.thread().state,'staff');
 // A forward of the same document is not added twice.
 f.receive(mime({id:'<c2@customer.com>',subject:'Fwd: Shipping instruction',inReplyTo:'<c1@customer.com>',content:'<c1@customer.com>'}));await f.run();
 assert.match(f.msg(2).intake_note,/^Aynı belgeler zaten bu konşimentoda\./);assert.equal(f.creates.length,1);
 f.receive(mime({id:'<c3@customer.com>',subject:'Fwd: Shipping instruction',inReplyTo:'<c1@customer.com>',text:'Ek belge'}));await f.run();
 assert.equal(f.creates.length,2);assert.equal(f.creates[1].recordId,'rec-1');assert.equal(f.creates[1].keepManual,true);
 assert.deepEqual(f.creates[1].names.slice(0,2),['talimat.pdf','talimat.pdf']);
 assert.equal(f.outbox().length,0);assert.equal(f.thread().state,'staff');assert.match(f.thread().note,/Yeni bilgi eklendi; kalan eksikler: Brüt ağırlık/);
});

test('a new file for a record already on the platforms is reported to staff, never changes the record',async()=>{
 const f=fixture({script:()=>({status:'ready',issues:[]})});
 f.receive(mime({id:'<c1@customer.com>'}));await f.run();assert.equal(f.thread().state,'complete');
 f.sql.prepare("UPDATE records SET status='complete'").run();
 f.receive(mime({id:'<c2@customer.com>',subject:'Fwd: Shipping instruction',inReplyTo:'<c1@customer.com>'}));await f.run();
 assert.equal(f.creates.length,1);assert.equal(f.thread().state,'staff');assert.match(f.thread().note,/aktarıldıktan sonra yeni ek geldi/);
});

test('when the record is created on T-MAXX and INTTRA the sender gets exactly one notice',async()=>{
 const f=fixture({script:()=>({status:'ready',issues:[]})});
 f.receive(mime({id:'<c1@customer.com>',subject:'Talimat'}));await f.run();
 const created=f.thread().created_at,later=new Date(Date.parse(created)+60000).toISOString();
 f.sql.prepare("INSERT INTO deliveries VALUES('rec-1','inttra','MBL talimatı','created','551944100',?),('rec-1','tmaxx','HBL','created','YK.S.E.26.11.00926',?)").run(later,later);
 await f.run();assert.equal(f.outbox().length,0,'not before the record is complete');
 f.sql.prepare("UPDATE records SET status='complete'").run();
 await f.run();await f.run();
 const out=f.outbox();assert.equal(out.length,1);assert.equal(out[0].round,0);assert.equal(out[0].state,'sent');
 assert.match(out[0].subject,/^Re: Talimat \[CBI-[0-9A-F]{6}\]$/);assert.deepEqual(JSON.parse(out[0].recipients).to,['ops@customer.com']);
 const text=body(out[0].body);
 assert.match(text,/House B\/L \(HBL\): T-MAXX platformunda oluşturuldu \(referans: YK\.S\.E\.26\.11\.00926\)/);
 assert.match(text,/Master B\/L talimatı \(MBL\): INTTRA platformunda oluşturuldu \(referans: 551944100\)/);
 assert.match(text,/Master B\/L instruction \(MBL\): created on INTTRA/);
 assert.equal(f.thread().state,'complete');assert.match(f.thread().note,/platformlarda oluşturuldu/);
});

test('a record transferred before the e-mail arrived (same documents again) gets no notice',async()=>{
 const f=fixture({script:()=>({status:'complete',issues:[]})});
 f.sql.exec("INSERT INTO deliveries VALUES('rec-1','inttra','MBL talimatı','created','1','2026-10-27T21:35:17.987Z')");
 f.receive(mime({id:'<c1@customer.com>'}));await f.run();
 f.sql.prepare("UPDATE records SET status='complete'").run();await f.run();
 assert.equal(f.outbox().length,0);assert.match(f.thread().note,/daha önce işlenmiş/);
});

test('automatic transfer: a complete instruction is submitted once and the sender gets the platform notice',async()=>{
 const actions=[];
 const f=fixture({env:{MAIL_AUTO_SUBMIT:'true'},script:(r,call,action)=>{actions.push(action);if(action!=='submit')return call===1?missing(['Brüt ağırlık: belgede bulunamadı.']):{status:'ready',issues:[]};
  f.sql.prepare("UPDATE records SET status='complete' WHERE id=?").run(r.id);
  f.sql.prepare("INSERT INTO deliveries VALUES(?,'inttra','MBL talimatı','created','551000001',?),(?,'tmaxx','HBL','created','YK.S.E.26.11.00999',?)").run(r.id,new Date(Date.now()+60000).toISOString(),r.id,new Date(Date.now()+60000).toISOString());
  return {status:'complete',issues:[]};}});
 f.receive(mime({id:'<c1@customer.com>',subject:'Talimat'}));await f.run();
 assert.equal(f.outbox().length,1);assert.deepEqual(actions,['check']);
 f.receive(mime({id:'<c2@customer.com>',subject:'Re: Talimat',inReplyTo:f.outbox()[0].message_id,text:'Brüt ağırlık 10.200 kg',pdf:false}),{attachments:0});await f.run();
 assert.deepEqual(actions,['check','check','submit']);
 const out=f.outbox();assert.equal(out.length,2);const notice=out.find(o=>o.round===0);assert.equal(notice.state,'sent');assert.match(body(notice.body),/T-MAXX platformunda oluşturuldu/);
 assert.equal(f.thread().state,'complete');
 // Later mail in the same conversation never submits again.
 f.receive(mime({id:'<c3@customer.com>',subject:'Re: Talimat',inReplyTo:'<c2@customer.com>',text:'Teşekkürler',pdf:false}),{attachments:0});await f.run();await f.run();
 assert.deepEqual(actions,['check','check','submit']);assert.equal(f.outbox().length,2);
});

test('automatic transfer stops for a booking used by another record, INTTRA warnings and transfer errors',async()=>{
 for(const [setup,submitResult,note] of [
  [sql=>{sql.prepare("INSERT INTO records(id,owner,status,fields) VALUES('old','cbi','complete','{\"bookingNumber\":{\"value\":\"EBKG1\"}}')").run();},null,/Aynı booking numarası başka bir konşimento/],
  [()=>{},{status:'review',issues:['INTTRA W1: x']},/INTTRA uyarı verdi/],
  [()=>{},new AppError('Önceki platform isteğinin sonucu belirsiz.',409),/Otomatik aktarım tamamlanamadı: Önceki platform/],
 ]){
  const actions=[];
  const f=fixture({env:{MAIL_AUTO_SUBMIT:'true'},script:(r,call,action)=>{actions.push(action);if(action!=='submit'){f.sql.prepare("UPDATE records SET fields='{\"bookingNumber\":{\"value\":\"EBKG1\"}}' WHERE id=?").run(r.id);return {status:'ready',issues:[]};}return submitResult;}});
  setup(f.sql);f.receive(mime({id:'<c1@customer.com>'}));await f.run();await f.run();
  assert.equal(f.thread().state,'staff');assert.match(f.thread().note,note);assert.equal(f.outbox().length,0);
  assert.deepEqual(actions,submitResult?['check','submit']:['check']);
 }
});

const said=(intent,extra={})=>({intent,hasShipmentData:false,requests:[],summary:'özet '+intent,...extra});

test('the mail text is read: a hold or special request asks the missing data but never transfers automatically',async()=>{
 const actions=[];
 const f=fixture({env:{MAIL_AUTO_SUBMIT:'true'},analyze:({stage})=>stage==='new'?said('instruction',{requests:['Konşimentoyu basmadan önce taslak onayı istiyor']}):said('answer'),script:(r,call,action)=>{actions.push(action);return call===1?missing(['Brüt ağırlık: belgede bulunamadı.']):{status:'ready',issues:[]};}});
 f.receive(mime({id:'<c1@customer.com>',text:'Lütfen basmadan önce taslak gönderin.'}));await f.run();
 assert.equal(f.analyses[0].stage,'new');assert.match(f.analyses[0].text,/taslak gönderin/);
 const out=f.outbox()[0];assert.match(body(out.body),/talebiniz operasyon ekibimize iletildi/);
 f.receive(mime({id:'<c2@customer.com>',subject:'RE: '+out.subject,inReplyTo:out.message_id,pdf:false,text:'Gross 12400 kg'}),{attachments:0});await f.run();
 assert.deepEqual(actions,['check','check'],'never submitted');
 assert.equal(f.thread().state,'staff');assert.match(f.thread().note,/otomatik aktarılmadı.*taslak onayı/);
});

test('a cancel in a reply stops the conversation; nothing is added or asked',async()=>{
 const f=fixture({analyze:({stage})=>stage==='new'?said('instruction'):said('cancel'),script:()=>missing(['Brüt ağırlık: belgede bulunamadı.'])});
 f.receive(mime({id:'<c1@customer.com>'}));await f.run();const out=f.outbox()[0];
 f.receive(mime({id:'<c2@customer.com>',subject:'RE: '+out.subject,inReplyTo:out.message_id,pdf:false,text:'Bu yüklemeyi iptal edin.'}),{attachments:0});await f.run();
 assert.equal(f.thread().state,'staff');assert.match(f.thread().note,/iptal talebi/);assert.equal(f.creates.length,1);assert.equal(f.outbox().length,1);
});

test('a question after the transfer reaches staff; a thank-you does not',async()=>{
 const f=fixture({env:{MAIL_AUTO_SUBMIT:'true'},analyze:({text})=>/teşekkür/i.test(text)?said('info'):/\?/.test(text)?said('question'):said('instruction'),script:()=>({status:'complete',issues:[]})});
 f.receive(mime({id:'<c1@customer.com>'}));await f.run();const t=f.thread();assert.equal(t.state,'complete');
 const thanks=f.receive(mime({id:'<c2@customer.com>',subject:'RE: x ['+t.tag+']',pdf:false,text:'Teşekkürler'}),{attachments:0});await f.run();
 assert.equal(f.msg(thanks).intake_state,'ignored');assert.equal(f.thread().state,'complete');
 f.receive(mime({id:'<c3@customer.com>',subject:'RE: x ['+t.tag+']',pdf:false,text:'Telex release ne zaman olur?'}),{attachments:0});await f.run();
 assert.equal(f.thread().state,'staff');assert.match(f.thread().note,/soru/);assert.equal(f.creates.length,1);
});

test('typed-in shipment data joins the record; a forward of the same PDF in a new mail never opens a second record',async()=>{
 const f=fixture({analyze:({stage})=>stage==='new'?said('instruction',{hasShipmentData:true}):said('answer'),script:()=>missing(['Brüt ağırlık: belgede bulunamadı.'])});
 f.receive(mime({id:'<c1@customer.com>',text:'Consignee: NORDSEE GMBH, Hamburg',content:'same'}));await f.run();
 assert.equal(f.creates.length,2);assert.deepEqual(f.creates[0].mimes,['application/pdf']);assert.equal(f.creates[1].recordId,'rec-1');assert.match(f.creates[1].texts[0],/NORDSEE/);
 // Same PDF, new conversation, different text: the record's document set changed, but the PDF still ties it.
 const fwd=f.receive(mime({id:'<c9@customer.com>',subject:'Fwd: talimat',text:'Fyi',content:'same'}));await f.run();
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM mail_threads').get().n,1);assert.equal(f.msg(fwd).thread_id,f.thread().id);
 assert.ok(f.creates.every(c=>!c.recordId||c.recordId==='rec-1'));assert.equal(new Set(f.creates.map(c=>c.recordId||'new')).size,2);
});

test('a plain mail with a typed instruction becomes a record; small talk does not',async()=>{
 const f=fixture({analyze:({text})=>/Shipper/.test(text)?said('instruction',{hasShipmentData:true}):said('other'),script:()=>missing(['Brüt ağırlık: belgede bulunamadı.'])});
 const chat=f.receive(mime({id:'<p1@customer.com>',pdf:false,text:'Toplantı yarın 10da'}),{attachments:0});
 const typed=f.receive(mime({id:'<p2@customer.com>',pdf:false,text:'Shipper: ANADOLU A.S.\nConsignee: NORDSEE GMBH\nContainer CSQU3054383'}),{attachments:0});
 await f.run();
 assert.equal(f.msg(chat).intake_state,'ignored');assert.equal(f.msg(typed).intake_state,'done');
 assert.equal(f.creates.length,1);assert.deepEqual(f.creates[0].mimes,['text/plain']);
});

test('the AI reading fails twice then the mail continues without automatic transfer',async()=>{
 const actions=[];
 const f=fixture({env:{MAIL_AUTO_SUBMIT:'true'},analyze:()=>new AppError('down',502),script:(r,c,action)=>{actions.push(action);return {status:'ready',issues:[]};}});
 const u=f.receive(mime({id:'<c1@customer.com>'}));
 await f.run();assert.equal(f.msg(u).intake_state,'pending');assert.equal(f.creates.length,0);
 await f.run();assert.equal(f.msg(u).intake_state,'pending');
 await f.run();assert.equal(f.msg(u).intake_state,'done');
 assert.deepEqual(actions,['check']);assert.equal(f.thread().state,'staff');assert.match(f.thread().note,/analiz edilemedi/);
});

test('analysis output is validated',()=>{
 assert.deepEqual(analysisLib.parseAnalysis('{"intent":"hold","hasShipmentData":false,"requests":["  taslak  "],"summary":"Bekletin"}'),{intent:'hold',hasShipmentData:false,requests:['taslak'],summary:'Bekletin'});
 assert.throws(()=>analysisLib.parseAnalysis('{"intent":"approve","hasShipmentData":false,"requests":[],"summary":""}'));
 assert.throws(()=>analysisLib.parseAnalysis('nope'));
 assert.equal(analysisLib.needsStaff(said('answer')),false);assert.equal(analysisLib.needsStaff(said('correction')),true);assert.equal(analysisLib.needsStaff(said('answer',{requests:['x']})),true);
});

test('one question per item even when two checks flag it',()=>{
 const {ask}=requests.customerRequests(['Belge çelişkisi · grossWeightKg: 1 / 2','Brüt ağırlık: belgede bulunamadı.']);
 assert.equal(ask.length,1);assert.match(ask[0].tr,/farklı değerler/);
});
