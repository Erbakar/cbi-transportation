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
const requests=moduleAt('lib/mail/requests.ts',{names},'customerRequests,requestText,confirmText,staffText');
import * as quality from '../lib/inttra-quality.ts';
const answersLib=moduleAt('lib/mail/staff-answers.ts',{...quality},'staffAnswers');
const analysisLib=moduleAt('lib/server/mail-analysis.ts',{AppError,runtime:()=>({})},'needsStaff,analysisNote,parseAnalysis,EMPTY,FAILED');
const plainAnalysis=({stage})=>({intent:stage==='new'?'instruction':'answer',hasShipmentData:false,requests:[],summary:'test'});
const ME='automation@cbitransport.com.tr';

function mime({from='Ops <ops@customer.com>',subject='Shipping instruction',id,inReplyTo='',text='Please see attached.',pdf=true,content}){
 const head=[`From: ${from}`,`To: ${ME}`,'Cc: burcees@cbitransport.com, stranger@else.com',`Subject: ${subject}`,`Message-ID: ${id}`,...(inReplyTo?[`In-Reply-To: ${inReplyTo}`,`References: ${inReplyTo}`]:[])];
 if(!pdf)return [...head,'Content-Type: text/plain; charset=utf-8','',text,''].join('\r\n');
 return [...head,'Content-Type: multipart/mixed; boundary="b"','','--b','Content-Type: text/plain; charset=utf-8','',text,'--b','Content-Type: application/pdf; name="talimat.pdf"','Content-Disposition: attachment; filename="talimat.pdf"','Content-Transfer-Encoding: base64','',Buffer.from('%PDF-1.7\n'+(content||id)).toString('base64'),'--b--',''].join('\r\n');
}

function fixture({script,env={},smtpOptions={},analyze=plainAnalysis,compose=async()=>null,position='S.E.26.11.00001',found=async()=>'',prealert={}}={}){
 const sql=new DatabaseSync(':memory:');for(const f of ['0028_mail_inbox.sql','0029_mail_replies.sql','0030_mail_hold.sql','0031_mail_hbl_numbers.sql','0032_mail_asked.sql','0033_mail_kinds.sql'])sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
 sql.exec("CREATE TABLE records(id TEXT PRIMARY KEY,owner TEXT,status TEXT,fields TEXT,manual TEXT,issues TEXT,updated_at TEXT,revision INTEGER DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP);CREATE TABLE record_documents(record_id TEXT,revision INTEGER,hash TEXT,mime TEXT);CREATE TABLE deliveries(record_id TEXT,platform TEXT,kind TEXT,status TEXT,reference TEXT,updated_at TEXT);CREATE TABLE prealert_uploads(id TEXT PRIMARY KEY,state TEXT,position_reference TEXT);CREATE TABLE cma_vgm_jobs(id TEXT PRIMARY KEY,state TEXT,send_authorized INTEGER DEFAULT 0,result TEXT);CREATE TABLE prealert_queue(document_id TEXT PRIMARY KEY,state TEXT);CREATE TABLE platform_reviews(record_id TEXT PRIMARY KEY,revision INTEGER,input_hash TEXT,payload TEXT,warnings TEXT,approved INTEGER,created_at TEXT)");
 const stmt=(q,args)=>({first:async()=>sql.prepare(q).get(...args)||null,all:async()=>({results:sql.prepare(q).all(...args)}),run:async()=>({meta:{changes:Number(sql.prepare(q).run(...args).changes)}})});
 const db=()=>({prepare:q=>({bind:(...a)=>stmt(q,a),first:()=>stmt(q,[]).first(),all:()=>stmt(q,[]).all(),run:()=>stmt(q,[]).run()}),batch:async list=>{sql.exec('BEGIN');try{for(const s of list)await s.run();sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}}});
 const config={MAIL_SYNC_ENABLED:'true',MAIL_INTAKE_ENABLED:'true',MAIL_ALLOWED_SENDERS:'customer.com, cbitransport.com',MAIL_IMAP_HOST:'mail.test',MAIL_IMAP_USER:ME,MAIL_IMAP_PASSWORD:'secret',APP_USERNAME:'cbi',...env};
 // Fake records: documents per record and a scripted check result per call.
 const records=new Map(),objects=new Map(),creates=[],checks=[],hashes=new Map(),analyses=[],composed=[],finds=[];let n=0;
 const createRecord=async(owner,{sources,reference,recordId,keepManual})=>{
  const hash=sources.map(s=>Buffer.from(s.bytes).toString('base64')).join('|');if(!recordId&&hashes.has(hash))return {row:{id:hashes.get(hash)},duplicate:true};
  creates.push({owner,names:sources.map(s=>s.name),mimes:sources.map(s=>s.mime),reference,recordId,keepManual,texts:sources.filter(s=>s.mime==='text/plain').map(s=>new TextDecoder().decode(s.bytes))});
  const id=recordId||'rec-'+(++n);const docs=sources.map((s,i)=>{const key=id+'/'+creates.length+'/'+i;objects.set(key,s.bytes);return {filename:s.name,object_key:key,role:s.role,mime:s.mime,hash:sha(s.bytes)};});
  records.set(id,{...records.get(id),id,owner,docs});sql.prepare('DELETE FROM record_documents WHERE record_id=?').run(id);for(const d of docs)sql.prepare('INSERT INTO record_documents VALUES(?,1,?,?)').run(id,d.hash,d.mime);hashes.set(hash,id);sql.prepare("INSERT OR IGNORE INTO records(id,owner,status,manual) VALUES(?,?,'uploaded',?)").run(id,owner,JSON.stringify({tmaxxReference:reference||position}));if(recordId&&reference)sql.prepare("UPDATE records SET manual=json_set(manual,'$.tmaxxReference',COALESCE(NULLIF(json_extract(manual,'$.tmaxxReference'),''),?)) WHERE id=?").run(reference,id);return {row:{id},duplicate:false};
 };
 const checkRecord=async(owner,id,action,approval)=>{const r=records.get(id);checks.push(id);const result=script(r,checks.length,action,approval);if(result instanceof Error)throw result;return result;};
 const smtpServer=fakeSmtp(smtpOptions);const imapMessages=[];
 const deps={openImap:()=>fakeImap({messages:imapMessages}),openSmtp:()=>smtpServer.socket()};
 const {mailConfig}=moduleAt('lib/server/mail-sync.ts',{AppError,db,runtime:()=>config,randomToken:()=>'t',openImap,ImapError:Error,connect:()=>{throw Error('no network');},console},'mailConfig');
 // Pre-alert side: the real mail-operations module with fake archive functions.
 const pre={detect:async()=>({status:'manual'}),uploads:[],enqueued:[],reading:null,cmaJobs:[],submitted:[],...prealert};
 const bucket={get:async k=>objects.has(k)?{arrayBuffer:async()=>objects.get(k)}:null,put:async(k,v)=>{objects.set(k,v);}};
 const ops=moduleAt('lib/server/mail-operations.ts',{AppError,db,runtime:()=>({...config,BUCKET:bucket}),
  createPrealert:async(owner,form)=>{const f=form.get('file'),ref=form.get('reference'),id='pa-'+(pre.uploads.length+1);pre.uploads.push({owner,ref,name:f.name});sql.prepare("INSERT INTO prealert_uploads VALUES(?,'saved',?)").run(id,ref);return {id,duplicate:false};},
  detectPrealertPosition:async(owner,form)=>pre.detect(form.get('file').name),
  enqueuePrealert:async id=>{pre.enqueued.push(id);sql.prepare("INSERT OR IGNORE INTO prealert_queue VALUES(?,'queued')").run(id);return {status:'queued'};},
  digest:async v=>sha(v),readVgmFile:async()=>{if(!pre.reading)throw new AppError('okunamadı',422);return pre.reading;},
  prepareCmaJob:async(id,owner,input)=>{const job={id:'job-'+(pre.cmaJobs.length+1),input};pre.cmaJobs.push(job);sql.prepare("INSERT INTO cma_vgm_jobs(id,state) VALUES(?,'queued')").run(job.id);return {jobs:pre.cmaJobs.map(j=>({id:j.id,state:'queued',payload:{booking:j.input.carrierBooking,container:j.input.container}}))};},
  submitCmaJob:async(id,owner,jobId)=>{pre.submitted.push(jobId);sql.prepare("UPDATE cma_vgm_jobs SET state='submit_queued',send_authorized=1 WHERE id=?").run(jobId);},
  normalizeMass:(v,u)=>u==='kg'?v:'',containerValid:c=>/^[A-Z]{4}\d{7}$/.test(c)},'operationKind,handleOperation,confirmPrealerts,confirmVgms');
 let token=0;
 const mod=moduleAt('lib/server/mail-intake.ts',{...ops,AppError,db,runtime:()=>({...config,BUCKET:{get:async k=>objects.has(k)?{arrayBuffer:async()=>objects.get(k)}:null}}),randomToken:()=>String(++token).padStart(64,'0'),openImap,parseAddress,parseMail,replyText,...smtp,...requests,...answersLib,createRecord,checkRecord,detectFile:(bytes,name)=>{if(name.endsWith('.pdf'))return 'application/pdf';throw new AppError('unsupported');},documentsFor:async r=>records.get(r.id).docs,owned:async id=>({...records.get(id),status:sql.prepare('SELECT status FROM records WHERE id=?').get(id)?.status}),digest:async b=>sha(b),mailConfig,...analysisLib,findPosition:async(owner,id)=>{finds.push(id);return found(id);},composeMail:async input=>{composed.push(input);return compose(input);},analyzeMail:async input=>{analyses.push(input);const r=await analyze(input);if(r instanceof Error)throw r;return r;},connect:()=>{throw Error('no network');},console:{warn(){},log(){}}},'runMailIntake,runMailSubmit,senderAllowed,mailThreads,MAX_ROUNDS,onlyCodes');
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
 return {pre,sql,mod,deps,receive,msg,thread,outbox,creates,checks,analyses,composed,finds,smtp:smtpServer,run:async(o={limit:5})=>{const r=await mod.runMailIntake(o,deps);await mod.runMailSubmit();return r;},sentBodies,config};
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

test('after the first e-mail nothing new is asked: a new gap goes to staff, never to the sender',async()=>{
 const f=fixture({script:(r,call)=>call===1?missing(['Navlun ödeme: belgede bulunamadı.']):missing(['Navlun ödeme: belgede bulunamadı.','Kap adedi: belgede bulunamadı.'])});
 f.receive(mime({id:'<c1@customer.com>'}));await f.run();
 const last=f.outbox().at(-1);f.receive(mime({id:'<c2@customer.com>',subject:'RE: '+last.subject,inReplyTo:last.message_id,pdf:false,text:'prepaid'}),{attachments:0});await f.run();
 assert.equal(f.outbox().length,1,'no second question e-mail');assert.equal(f.thread().state,'staff');assert.match(f.thread().note,/yeni eksik.*Kap adedi/);
});

test('a reply found only by the [CBI-xxxxxx] tag still joins the record',async()=>{
 const f=fixture({script:(r,call)=>call===1?missing(['Hacim (m³): belgede bulunamadı.']):{status:'ready',issues:[]}});
 f.receive(mime({id:'<c1@customer.com>'}));await f.run();const tag=f.thread().tag;
 f.receive(mime({id:'<new@customer.com>',subject:`Volume for ${tag}`,pdf:true}));await f.run();
 assert.equal(f.creates[1].recordId,'rec-1');assert.equal(f.thread().state,'complete');
});

const HBL_GAP='INTTRA: House Bill Number alanını doldurun.',ZIP_GAP='Gerçek gönderen: Posta kodu bilgisini tamamlayın.';
const internalMail=(id,extra={})=>mime({id,from:'Export <export@cbitransport.com>',...extra});
test('only CBI-side gaps from a CBI address: the sender gets the gap list once',async()=>{
 const f=fixture({script:()=>missing([HBL_GAP,ZIP_GAP])});
 f.receive(internalMail('<c1@cbitransport.com>'),{from:'export@cbitransport.com'});await f.run();
 const out=f.outbox();assert.equal(out.length,1);assert.equal(out[0].state,'sent');assert.equal(out[0].round,-1);
 assert.deepEqual(JSON.parse(out[0].recipients).to,['export@cbitransport.com']);
 assert.match(body(out[0].body),/House Bill Number/);assert.match(body(out[0].body),/Posta kodu/);assert.match(out[0].subject,/\[CBI-[0-9A-F]{6}\]/);
 assert.equal(f.thread().state,'waiting_customer');assert.match(f.thread().note,/göndericiye iletildi/);
 await f.run();assert.equal(f.outbox().length,1,'never sent twice');
});

test('the CBI sender typing the values after the notice lines fills those fields and the record goes on (CBI-BFA696)',async()=>{
 const f=fixture({script:(r,n)=>n===1?missing([HBL_GAP,ZIP_GAP]):{status:'ready',issues:[]}});
 f.receive(internalMail('<c1@cbitransport.com>'),{from:'export@cbitransport.com'});await f.run();
 const tag=f.thread().tag;
 f.receive(internalMail('<c2@cbitransport.com>',{subject:`RE: Shipping instruction [${tag}]`,inReplyTo:'<c1@cbitransport.com>',pdf:false,text:`1. ${HBL_GAP} : 1046473\n2. ${ZIP_GAP} : 34500\n\nSaygılarımla`}),{from:'export@cbitransport.com',attachments:0});
 await f.run();
 const manual=JSON.parse(f.sql.prepare("SELECT manual FROM records WHERE id='rec-1'").get().manual);
 assert.equal(manual.houseBillNumber,'1046473');assert.equal(manual.partyOverrides.shipper.postalCode,'34500');
 assert.equal(f.creates.length,2);assert.equal(f.creates[1].recordId,'rec-1');
 assert.notEqual(f.thread().state,'staff');assert.equal(f.outbox().length,1,'no reminder once nothing is missing');
});

test('a CBI answer that leaves gaps gets ONE reminder; later answers only reach staff',async()=>{
 const f=fixture({script:()=>missing([HBL_GAP,ZIP_GAP])});
 f.receive(internalMail('<c1@cbitransport.com>'),{from:'export@cbitransport.com'});await f.run();
 const tag=f.thread().tag;
 f.receive(internalMail('<c2@cbitransport.com>',{subject:`RE: Shipping instruction [${tag}]`,inReplyTo:'<c1@cbitransport.com>',pdf:false,text:'Bakıyorum, birazdan iletirim.'}),{from:'export@cbitransport.com',attachments:0});
 await f.run();
assert.deepEqual(f.outbox().map(o=>o.round),[-2,-1]);assert.match(body(f.outbox()[0].body),/hâlâ eksik/);
 f.receive(internalMail('<c3@cbitransport.com>',{subject:`RE: Shipping instruction [${tag}]`,inReplyTo:'<c2@cbitransport.com>',pdf:false,text:'Tamam.'}),{from:'export@cbitransport.com',attachments:0});
 await f.run();
 assert.equal(f.outbox().length,2,'no third notice');assert.equal(f.thread().state,'staff');
});

test('a customer (non-CBI) reply on a staff record is still only noted',async()=>{
 const f=fixture({script:()=>missing([HBL_GAP])});
 f.receive(mime({id:'<c1@customer.com>'}));await f.run();
 f.receive(mime({id:'<c2@customer.com>',subject:`RE: Shipping instruction [${f.thread().tag}]`,inReplyTo:'<c1@customer.com>',pdf:false,text:`1. ${HBL_GAP} : 1046473`}),{attachments:0});
 await f.run();
 assert.equal(JSON.parse(f.sql.prepare("SELECT manual FROM records WHERE id='rec-1'").get().manual).houseBillNumber,undefined);
 assert.equal(f.outbox().length,0);assert.equal(f.creates.length,1);
});

test('only CBI-side gaps: no customer e-mail, the thread goes to staff',async()=>{
 const f=fixture({script:()=>missing(['MBL gönderen: belgede bulunamadı.','INTTRA: Taşıyıcı seçimini tamamlayın.'])});
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
 const f=fixture({script:(r,call)=>call===1?missing(['MBL gönderen: belgede bulunamadı.']):missing(['Brüt ağırlık: belgede bulunamadı.','MBL gönderen: belgede bulunamadı.'])});
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
 // The transfer ran in its own invocation; the next minute's run sends the notice.
 await f.run();assert.deepEqual(actions,['check','check','submit']);
 const out=f.outbox();assert.equal(out.length,2);const notice=out.find(o=>o.round===0);assert.equal(notice.state,'sent');assert.match(body(notice.body),/T-MAXX platformunda oluşturuldu/);
 assert.equal(f.thread().state,'complete');
 // Later mail in the same conversation never submits again.
 f.receive(mime({id:'<c3@customer.com>',subject:'Re: Talimat',inReplyTo:'<c2@customer.com>',text:'Teşekkürler',pdf:false}),{attachments:0});await f.run();await f.run();
 assert.deepEqual(actions,['check','check','submit']);assert.equal(f.outbox().length,2);
});

test('"separate HBLs, one MBL" does not stop the transfer when the record already has them',async()=>{
 const two=[{containerNumbers:['MSMU7096485'],number:'1'},{containerNumbers:['FFAU1334406'],number:'2'}];
 for(const [bills,submitted,note] of [[two,true,/otomatik aktarıldı/],[[{containerNumbers:['MSMU7096485','FFAU1334406'],number:'1'}],false,/HBL dağılımı bunu karşılamıyor/],[[two[0],{...two[1],containerNumbers:['MSMU7096485']}],false,/HBL dağılımı/]]){
  const actions=[];
  const f=fixture({env:{MAIL_AUTO_SUBMIT:'true'},analyze:()=>said('instruction',{splitHouseBills:true}),script:(r,call,action)=>{actions.push(action);if(action==='submit')return {status:'complete',issues:[]};f.sql.prepare("UPDATE records SET manual=json_set(manual,'$.houseBills',json(?)) WHERE id=?").run(JSON.stringify(bills),r.id);return {status:'ready',issues:[]};}});
  f.receive(mime({id:'<c1@customer.com>'}));await f.run();
  assert.equal(actions.includes('submit'),submitted);assert.match(f.thread().note,note);assert.equal(f.thread().hold??null,null);
 }
});

test('INTTRA 10136 alone is accepted when the booking is the one the CBI sender e-mailed; anything else waits for staff',async()=>{
 for(const [warnings,booking,accepted] of [[[{code:'10136',message:'not found'}],'EBKG1',true],[[{code:'10136'},{code:'W2'}],'EBKG1',false],[[{code:'10136'}],'EBKG9',false]]){
  const calls=[];let f;
  f=fixture({env:{MAIL_AUTO_SUBMIT:'true'},analyze:()=>said('instruction',{bookingNumber:'EBKG1'}),script:(r,call,action,approval)=>{
   calls.push([action,approval?.inputHash||null]);
   f.sql.prepare("UPDATE records SET fields=? WHERE id=?").run(JSON.stringify({bookingNumber:{value:booking,source:'Kullanıcı tarafından doğrulandı'}}),r.id);
   if(action!=='submit')return {status:'ready',issues:[]};
   if(approval){f.sql.prepare("UPDATE records SET status='complete' WHERE id=?").run(r.id);return {status:'complete',issues:[]};}
   f.sql.prepare("INSERT OR REPLACE INTO platform_reviews VALUES(?,1,'h1','{}',?,0,?)").run(r.id,JSON.stringify(warnings),new Date().toISOString());
   return {status:'review',issues:['INTTRA 10136']};}});
  f.receive(mime({id:'<c1@customer.com>'}));await f.run();
  if(accepted){assert.equal(f.thread().state,'submitting');assert.match(f.thread().note,/10136.*otomatik kabul/);await f.run();assert.deepEqual(calls.filter(c=>c[0]==='submit'),[['submit',null],['submit','h1']]);assert.match(f.thread().note,/otomatik aktarıldı/);}
  else{assert.equal(f.thread().state,'staff');assert.match(f.thread().note,/onayını bekliyor/);assert.equal(f.sql.prepare('SELECT approved FROM platform_reviews').get().approved,0);}
 }
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

test('with attachments the body is a cover note, not a document; a forward of the same PDF never opens a second record',async()=>{
 const f=fixture({analyze:({stage})=>stage==='new'?said('instruction',{hasShipmentData:true}):said('answer'),script:()=>missing(['Brüt ağırlık: belgede bulunamadı.'])});
 f.receive(mime({id:'<c1@customer.com>',text:'MSMU 709648-5 : 1046472',content:'same'}));await f.run();
 assert.equal(f.creates.length,1);assert.deepEqual(f.creates[0].mimes,['application/pdf']);assert.match(f.analyses[0].text,/1046472/);
 // Same PDF, new conversation, different text: the record's document set changed, but the PDF still ties it.
 const fwd=f.receive(mime({id:'<c9@customer.com>',subject:'Fwd: talimat',text:'Fyi',content:'same'}));await f.run();
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM mail_threads').get().n,1);assert.equal(f.msg(fwd).thread_id,f.thread().id);
 assert.ok(f.creates.slice(1).every(c=>c.recordId==='rec-1'),'only the same record is updated');
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
 assert.deepEqual(analysisLib.parseAnalysis('{"intent":"hold","hasShipmentData":false,"requests":["  taslak  "],"summary":"Bekletin"}'),{intent:'hold',hasShipmentData:false,requests:['taslak'],summary:'Bekletin',houseBillNumbers:[],bookingNumber:'',blReference:''});
 assert.deepEqual(analysisLib.parseAnalysis('{"intent":"instruction","hasShipmentData":true,"requests":[],"summary":"x","houseBillNumbers":[{"container":"MSMU 709648-5","number":"1046472"},{"container":"bad","number":"1"}]}').houseBillNumbers,[{container:'MSMU7096485',number:'1046472'}]);
 assert.throws(()=>analysisLib.parseAnalysis('{"intent":"approve","hasShipmentData":false,"requests":[],"summary":""}'));
 assert.throws(()=>analysisLib.parseAnalysis('nope'));
 assert.equal(analysisLib.needsStaff(said('answer')),false);assert.equal(analysisLib.needsStaff(said('correction')),true);assert.equal(analysisLib.needsStaff(said('answer',{requests:['x']})),true);
});

test('one question per item even when two checks flag it',()=>{
 const {ask}=requests.customerRequests(['Belge çelişkisi · grossWeightKg: 1 / 2','Brüt ağırlık: belgede bulunamadı.']);
 assert.equal(ask.length,1);assert.match(ask[0].tr,/farklı değerler/);
});

test('without a T-MAXX position the first question asks for it; the reference in the reply fills the record',async()=>{
 const f=fixture({position:'',script:(r,call)=>call===1?missing(['Brüt ağırlık: belgede bulunamadı.','MBL gönderen: belgede bulunamadı.']):{status:'ready',issues:[]}});
 f.receive(mime({id:'<c1@customer.com>',subject:'Talimat YK.S.E.26.10.00893'}));await f.run();
 assert.equal(f.creates[0].reference,'','an HBL number is not a position reference');
 const out=f.outbox()[0];assert.match(body(out.body),/1\. T-MAXX pozisyon referansı/);assert.match(body(out.body),/2\. Brüt ağırlık/);
 f.receive(mime({id:'<c2@customer.com>',subject:'RE: '+out.subject,inReplyTo:out.message_id,pdf:false,text:'Pozisyon S.E.26.11.00784, brüt 22720 kg'}),{attachments:0});await f.run();
 assert.equal(f.creates[1].reference,'S.E.26.11.00784');assert.equal(JSON.parse(f.sql.prepare('SELECT manual FROM records').get().manual).tmaxxReference,'S.E.26.11.00784');
 assert.equal(f.thread().state,'complete');
});

test('the AI-written e-mail is used when it passes the check; the facts it gets are the check result',async()=>{
 const f=fixture({compose:async i=>i.kind==='request'?`Sayın İlgili, ${i.tag}\n1. Brüt ağırlığı yazar mısınız?\n\n----------\n\nDear Sir or Madam, ${i.tag}\n1. Could you state the gross weight?`:null,script:()=>missing(['Belge çelişkisi · grossWeightKg: 22720 / 22270','Brüt ağırlık: belgede bulunamadı.'])});
 f.receive(mime({id:'<c1@customer.com>'}));await f.run();
 assert.equal(f.composed[0].ask.length,1);assert.match(f.composed[0].ask[0].detail,/22720 \/ 22270/);
 assert.match(body(f.outbox()[0].body),/Brüt ağırlığı yazar mısınız/);
});

test('the T-MAXX position found from the containers is set and checked again before anything is asked',async()=>{
 const f=fixture({position:'',found:async()=>'S.E.26.11.00784',script:(r,call)=>call===1?missing(['MBL gönderen: belgede bulunamadı.','Brüt ağırlık: belgede bulunamadı.']):JSON.parse(f.sql.prepare('SELECT manual FROM records').get().manual).tmaxxReference==='S.E.26.11.00784'?missing(['Brüt ağırlık: belgede bulunamadı.']):missing(['x'])});
 f.receive(mime({id:'<c1@customer.com>'}));await f.run();
 assert.equal(f.checks.length,2);const text=body(f.outbox()[0].body);
 assert.match(text,/1\. Brüt ağırlık/);assert.doesNotMatch(text,/T-MAXX pozisyon/);
});

test('no single position found: the reference is asked; a T-MAXX error never blocks the question',async()=>{
 for(const found of [async()=>'',async()=>{throw new Error('T-MAXX down');}]){
  const f=fixture({position:'',found,script:()=>missing(['MBL gönderen: belgede bulunamadı.','Brüt ağırlık: belgede bulunamadı.'])});
  f.receive(mime({id:'<c1@customer.com>'}));await f.run();
  assert.equal(f.checks.length,1);assert.match(body(f.outbox()[0].body),/1\. T-MAXX pozisyon referansı/);
 }
});

test('a malformed AI reading is retried on the next run on the same record, then handed to staff',async()=>{
 let calls=0;const f=fixture({script:()=>++calls<3?new AppError('Belge alanları eksik veya tekrarlı döndü.',502):missing(['Brüt ağırlık: belgede bulunamadı.'])});
 const u=f.receive(mime({id:'<c1@customer.com>'}));
 await f.run();assert.equal(f.msg(u).intake_state,'pending');
 await f.run();assert.equal(f.msg(u).intake_state,'pending');
 await f.run();assert.equal(f.msg(u).intake_state,'done');
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM mail_threads').get().n,1);assert.equal(f.creates.filter(c=>!c.recordId).length,1);
 assert.equal(f.outbox().length,1);
});

test('House B/L numbers written next to containers and the shipper postal code from the last completed record are filled',async()=>{
 const bills=[{goodId:1,reference:'YK.S.E.1',number:'',containerNumbers:['MSMU7096485'],fieldOverrides:{},partyOverrides:{}},{goodId:2,reference:'YK.S.E.2',number:'',containerNumbers:['FFAU1334406'],fieldOverrides:{},partyOverrides:{}}];
 let f;f=fixture({analyze:()=>said('instruction',{houseBillNumbers:[{container:'MSMU7096485',number:'1046472'},{container:'FFAU1334406',number:'1046471'}]}),script:(r,call)=>{
  const manual=JSON.parse(f.sql.prepare('SELECT manual FROM records WHERE id=?').get(r.id).manual);
  if(call===1){f.sql.prepare("UPDATE records SET manual=?,fields=? WHERE id=?").run(JSON.stringify({...manual,houseBills:bills}),JSON.stringify({shipperName:{value:'FIRAT PLASTIK'}}),r.id);f.sql.prepare("UPDATE records SET issues=? WHERE id=?").run(JSON.stringify(['HBL 1: Gerçek gönderen: Posta kodu bilgisini tamamlayın.']),r.id);return missing(['HBL 1: House Bill Number alanını doldurun.','HBL 1: Gerçek gönderen: Posta kodu bilgisini tamamlayın.','Brüt ağırlık: belgede bulunamadı.']);}
  return missing(['Brüt ağırlık: belgede bulunamadı.']);}});
 f.sql.prepare("INSERT INTO records(id,owner,status,fields,manual) VALUES('old','cbi','complete',?,?)").run(JSON.stringify({shipperName:{value:'FIRAT PLASTIK'}}),JSON.stringify({houseBills:[{...bills[0],partyOverrides:{shipper:{postalCode:'34537'}}}]}));
 f.receive(mime({id:'<c1@customer.com>',text:'MSMU 709648-5 : 1046472\nFFAU 133440-6 : 1046471'}));await f.run();
 const filled=JSON.parse(f.sql.prepare("SELECT manual FROM records WHERE id='rec-1'").get().manual).houseBills;
 assert.deepEqual(filled.map(b=>b.number),['1046472','1046471']);assert.deepEqual(filled.map(b=>b.partyOverrides.shipper?.postalCode),['34537','34537']);
 assert.equal(f.checks.length,2);assert.doesNotMatch(body(f.outbox()[0].body),/House Bill|Posta/);
});

test('booking and the carrier B/L number are asked once; the reply fills them',async()=>{
 let f;f=fixture({analyze:({stage})=>stage==='new'?said('instruction'):said('answer',{bookingNumber:'EBKG19292551',blReference:'MEDUJX361689'}),script:()=>{const m=JSON.parse(f.sql.prepare('SELECT manual FROM records').get().manual);return m.bookingNumber&&m.blReference?{status:'ready',issues:[]}:missing(['Booking numarası: belgede bulunamadı.','INTTRA: Carrier Booking Number alanını doldurun.','INTTRA: B/L Reference Number alanını doldurun.']);}});
 f.receive(mime({id:'<c1@customer.com>'}));await f.run();
 const out=f.outbox()[0],text=body(out.body);assert.match(text,/1\. Booking numarası\r?\n2\. Taşıyıcının B\/L numarası/);assert.doesNotMatch(text,/3\./);
 f.receive(mime({id:'<c2@customer.com>',subject:'RE: '+out.subject,inReplyTo:out.message_id,pdf:false,text:'Booking EBKG19292551, B/L MEDUJX361689'}),{attachments:0});await f.run();
 const m=JSON.parse(f.sql.prepare('SELECT manual FROM records').get().manual);assert.equal(m.bookingNumber,'EBKG19292551');assert.equal(m.blReference,'MEDUJX361689');assert.equal(f.thread().state,'complete');
 // The codes go into fields; the reply is not filed as a third shipment document.
 assert.ok(f.creates.every(c=>!c.texts.length));assert.equal(f.outbox().length,1);
});

test('a reply holding only codes is not a shipment document; one with figures is',()=>{
 const intake=fixture().mod;
 const a={bookingNumber:'EBKG19335968',blReference:'MEDUJX363834',houseBillNumbers:[{container:'MSMU7096485',number:'1046472'}]};
 assert.equal(intake.onlyCodes('booking no : EBKG19335968\nBL NO : MEDUJX363834',a),true);
 assert.equal(intake.onlyCodes('MSMU 709648-5 : 1046472, pozisyon S.E.26.11.00796',a),true);
 assert.equal(intake.onlyCodes('Booking EBKG19335968, brüt ağırlık 22720 kg',a),false);
 assert.equal(intake.onlyCodes('booking no : EBKG19335968\n BL NO : MEDUJX363834\n\nCBI Transportation <automation@cbitransport.com.tr>, 10 Kas 2026 Sal, 23:38',a),true);
 assert.equal(intake.onlyCodes('Booking EBKG19335968, freight prepaid',a),false);
 assert.equal(intake.onlyCodes('booking no : EBKG19335968 // BL NO : MEDUJX363834\n\nCBI Transportation <automation@cbitransport.com.tr>, 11 Kas 2026 Çar, 11:09',a),true);
 assert.equal(intake.onlyCodes('Booking: EBKG19335968 | B/L - MEDUJX363834',a),true);
});

test('the subject routes pre-alert and VGM mail; everything else stays on the B/L flow',()=>{
 const {operationKind}=moduleAt('lib/server/mail-operations.ts',{AppError,db:()=>null,runtime:()=>({}),createPrealert:null,detectPrealertPosition:null,enqueuePrealert:null},'operationKind');
 for(const [subject,kind] of [['PRE-ALERT S.E.26.11.00796','prealert'],['Fwd: Prealert MSC','prealert'],['pre alert docs','prealert'],['VGM - TRHU3971713','vgm'],['vgm belgesi','vgm'],['konsimento talimati','bl'],['VGMS ok','bl'],['Re: konsimento [CBI-ABC123]','bl']])assert.equal(operationKind(subject)||'bl',kind,subject);
});

test('pre-alert with the position in the subject goes to the T-MAXX archive queue and the sender is told once it is archived',async()=>{
 const f=fixture({script:()=>{throw Error('B/L check must not run');}});
 f.receive(mime({id:'<p1@customer.com>',subject:'PRE-ALERT S.E.26.11.00796'}));await f.run();
 assert.equal(f.creates.length,0,'no B/L record');assert.deepEqual(f.pre.uploads.map(u=>u.ref),['S.E.26.11.00796']);assert.deepEqual(f.pre.enqueued,['pa-1']);
 assert.equal(f.thread().kind,'prealert');assert.equal(f.thread().state,'processing');assert.equal(f.outbox().length,0);
 await f.run();assert.equal(f.outbox().length,0,'no notice before the archive confirms');
 f.sql.prepare("UPDATE prealert_uploads SET state='synced'").run();await f.run();
 const out=f.outbox();assert.equal(out.length,1);assert.equal(out[0].round,0);assert.match(body(out[0].body),/T-MAXX Pre-alert arşivine eklenmiştir:\r?\n\r?\n- talimat\.pdf → S\.E\.26\.11\.00796/);
 assert.equal(f.thread().state,'complete');await f.run();assert.equal(f.outbox().length,1,'notified once');
});

test('pre-alert position is read from the PDF; when it cannot be found the sender is asked once and the reply files it',async()=>{
 let f=fixture({prealert:{detect:async()=>({status:'matched',snapshot:{position:{reference:'S.E.26.11.00800'}}})}});
 f.receive(mime({id:'<p1@customer.com>',subject:'Prealert'}));await f.run();
 assert.deepEqual(f.pre.uploads.map(u=>u.ref),['S.E.26.11.00800']);assert.equal(f.thread().state,'processing');
 f=fixture();
 f.receive(mime({id:'<p2@customer.com>',subject:'Prealert'}));await f.run();
 assert.equal(f.pre.uploads.length,0);assert.equal(f.thread().state,'waiting_customer');const ask=f.outbox()[0];assert.match(body(ask.body),/1\. talimat\.pdf/);
 f.receive(mime({id:'<p3@customer.com>',subject:'RE: '+ask.subject,inReplyTo:ask.message_id,pdf:false,text:'Pozisyon S.E.26.11.00801'}),{attachments:0});await f.run();
 assert.deepEqual(f.pre.uploads.map(u=>[u.ref,u.name]),[['S.E.26.11.00801','talimat.pdf']]);assert.equal(f.thread().state,'processing');assert.equal(f.creates.length,0);
});

test('a pre-alert reply without a position goes to staff; a VGM for a carrier other than CMA goes to staff',async()=>{
 let f=fixture();
 f.receive(mime({id:'<p2@customer.com>',subject:'Prealert'}));await f.run();const ask=f.outbox()[0];
 f.receive(mime({id:'<p3@customer.com>',subject:'RE: '+ask.subject,inReplyTo:ask.message_id,pdf:false,text:'bilmiyorum'}),{attachments:0});await f.run();
 assert.equal(f.thread().state,'staff');assert.equal(f.outbox().length,1);
 f=fixture({script:()=>{throw Error('B/L check must not run');}});
 f.receive(mime({id:'<v1@customer.com>',subject:'VGM TRHU3971713'}));await f.run();
 assert.equal(f.thread().kind,'vgm');assert.equal(f.thread().state,'staff');assert.equal(f.creates.length,0);assert.equal(f.outbox().length,0);
});

const ev=(value,unit=null,confidence=1)=>({value,unit,source:'s',page:1,confidence});
const vgmRow=(o={})=>({documentNumber:ev(null),weighedAt:ev(null),containerNumber:ev('TRHU3971713'),tare:ev(null),cargo:ev(null),vgm:ev('25950','kg'),company:ev('ACME'),person:ev('Ali Veli'),vehicle:ev(null),plate:ev(null),terminal:ev(null),...o});

test('a CMA VGM by mail is read, prepared, submitted automatically and reported once CMA confirms',async()=>{
 const f=fixture({script:()=>{throw Error('B/L check must not run');},prealert:{reading:{documentType:'vgm',rows:[vgmRow()],issues:[]}}});
 f.receive(mime({id:'<v1@customer.com>',subject:'VGM - TRHU3971713',text:'BOOKING NO : ISB2086617 -- CMA CGM'}));await f.run();
 assert.equal(f.creates.length,0);assert.deepEqual(f.pre.cmaJobs.map(j=>j.input),[{carrierBooking:'ISB2086617',container:'TRHU3971713',vgmKg:'25950',signature:'Ali Veli',method:'',certificate:'',confirmed:true}]);
 assert.equal(f.thread().state,'processing');assert.equal(f.outbox().length,0);
 await f.run();assert.deepEqual(f.pre.submitted,[],'nothing submitted before the agent prepared the job');
 f.sql.prepare("UPDATE cma_vgm_jobs SET state='prepared'").run();await f.run();assert.deepEqual(f.pre.submitted,['job-1']);
 f.sql.prepare("UPDATE cma_vgm_jobs SET state='submitted'").run();await f.run();
 const out=f.outbox();assert.equal(out.length,1);assert.equal(out[0].round,0);assert.match(body(out[0].body),/CMA CGM'e iletilmiştir \(booking ISB2086617\):\r?\n\r?\n- TRHU3971713: 25950 kg/);
 assert.equal(f.thread().state,'complete');await f.run();assert.equal(f.outbox().length,1);
});

test('a CMA VGM without booking asks once; uncertain readings or a blocked CMA job go to staff',async()=>{
 let f=fixture({prealert:{reading:{documentType:'vgm',rows:[vgmRow()],issues:[]}}});
 f.receive(mime({id:'<v1@customer.com>',subject:'VGM CMA'}));await f.run();
 assert.equal(f.pre.cmaJobs.length,0);assert.equal(f.thread().state,'waiting_customer');const ask=f.outbox()[0];assert.match(body(ask.body),/1\. TRHU3971713/);
 f.receive(mime({id:'<v2@customer.com>',subject:'RE: '+ask.subject,inReplyTo:ask.message_id,pdf:false,text:'Booking: ISB2086617'}),{attachments:0});await f.run();
 assert.equal(f.pre.cmaJobs[0].input.carrierBooking,'ISB2086617');assert.equal(f.thread().state,'processing');
 f.sql.prepare("UPDATE cma_vgm_jobs SET state='blocked',result='CMA formu reddetti'").run();await f.run();
 assert.equal(f.thread().state,'staff');assert.match(f.thread().note,/CMA formu reddetti/);
 f=fixture({prealert:{reading:{documentType:'vgm',rows:[vgmRow({vgm:ev('25950','kg',0.6)})],issues:[]}}});
 f.receive(mime({id:'<v3@customer.com>',subject:'VGM CMA booking ISB2086617'}));await f.run();
 assert.equal(f.pre.cmaJobs.length,0);assert.equal(f.thread().state,'staff');assert.match(f.thread().note,/kesin okunamadı/);
});
