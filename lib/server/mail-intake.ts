import {connect} from 'cloudflare:sockets';
import {AppError,db,digest,runtime,randomToken} from '@/lib/server/runtime';
import {openImap,parseAddress,type ImapConnection} from '@/lib/mail/imap';
import {parseMail,replyText,type MimeAttachment} from '@/lib/mail/mime';
import {sendSmtp,buildReply,validAddress,SmtpError,type SmtpSocket} from '@/lib/mail/smtp';
import {confirmText,customerRequests,requestText,staffText} from '@/lib/mail/requests';
import {staffAnswers} from '@/lib/mail/staff-answers';
import {createRecord,type NewSource} from '@/lib/server/record-create';
import {checkRecord} from '@/lib/server/record-check';
import {ensurePlatformSessions} from '@/lib/server/platform-readiness';
import {platformAvailable,refreshPlatformHealth} from '@/lib/server/platform-health';
import {detectFile,documentsFor,owned} from '@/lib/server/records';
import {mailConfig} from '@/lib/server/mail-sync';
import {composeMail} from '@/lib/server/mail-compose';
import {findPosition} from '@/lib/server/mail-position';
import {analyzeMail,analysisNote,needsStaff,EMPTY,FAILED,type MailAnalysis} from '@/lib/server/mail-analysis';
import {operationKind,handleOperation,confirmPrealerts,confirmVgms,type OperationKind,type OpThread,type OpsContext} from '@/lib/server/mail-operations';

/**
 * Bill-of-lading e-mail loop. A new instruction with attachments from an allowed
 * sender becomes a record; missing customer information is requested by reply;
 * a reply in the same thread adds its text and files to the SAME record and the
 * check runs again. After MAX_ROUNDS, or for anything only CBI can resolve, the
 * thread goes to staff. Unknown SMTP outcomes are never re-sent automatically.
 */
export const MAX_ROUNDS=3;
const MAILBOX='INBOX',MAX_MESSAGE=25*1024*1024,MAX_ATTEMPTS=3,INTTRA_WAIT_MS=24*3600000,HOURLY_LIMIT=30,LEASE_MS=10*60000;
type Message={uid:number;uid_validity:number;message_id:string|null;from_address:string;reply_to:string;to_addresses:string;cc_addresses:string;subject:string;in_reply_to:string|null;references_header:string;automated:number;received_at:string;intake_attempts:number;attachments:number};
type Thread={id:string;tag:string;record_id:string;owner:string;subject:string;customer:string;cc:string;message_ids:string;rounds:number;state:string;hold?:string|null;hbl_numbers?:string|null;asked?:string|null;kind?:string;items?:string|null};
export type IntakeConfig={owner:string;address:string;fromName:string;allowed:string[];imap:{host:string;port:number;user:string;password:string};smtp:{host:string;port:number}};
export type IntakeDeps={openImap:(c:IntakeConfig)=>ImapConnection&{close():unknown};openSmtp:(c:IntakeConfig)=>SmtpSocket};

export function intakeConfig():IntakeConfig|null{
 const env=runtime(),mail=mailConfig();
 if(!mail||env.MAIL_INTAKE_ENABLED!=='true')return null;
 // Domains live in the config; individual addresses (kept out of git) in the MAIL_ALLOWED_EXTRA secret.
 const allowed=[env.MAIL_ALLOWED_SENDERS,env.MAIL_ALLOWED_EXTRA].join(',').split(/[,;\s]+/).map(s=>s.trim().toLowerCase().replace(/^@/,'')).filter(Boolean);
 const smtpHost=env.MAIL_SMTP_HOST||mail.host,smtpPort=Number(env.MAIL_SMTP_PORT||587);
 if(!allowed.length||!validAddress(mail.user)||!/^[a-z0-9.-]+$/i.test(smtpHost)||!Number.isInteger(smtpPort))return null;
 return {owner:env.MAIL_RECORD_OWNER||env.APP_USERNAME||'cbi',address:mail.user.toLowerCase(),fromName:'CBI Transportation',allowed,imap:mail,smtp:{host:smtpHost,port:smtpPort}};
}
/** An entry is a full address or a domain (sub-domains included). */
export function senderAllowed(address:string,allowed:string[]){
 const a=address.toLowerCase(),domain=a.split('@')[1]||'';
 return validAddress(a)&&allowed.some(e=>e.includes('@')?e===a:domain===e||domain.endsWith('.'+e));
}

const defaultDeps:IntakeDeps={
 openImap:c=>connect({hostname:c.imap.host,port:c.imap.port},{secureTransport:'on',allowHalfOpen:false}) as unknown as ImapConnection&{close():unknown},
 openSmtp:c=>connect({hostname:c.smtp.host,port:c.smtp.port},{secureTransport:'starttls',allowHalfOpen:false}) as unknown as SmtpSocket,
};

export async function runMailIntake({limit=1}:{limit?:number}={},deps:IntakeDeps=defaultDeps){
 const config=intakeConfig();if(!config)return {status:'disabled' as const};
 const now=Date.now(),lease=randomToken();
 const claimed=await db().prepare("UPDATE mail_intake_control SET lease=?,lease_until=?,started_at=COALESCE(started_at,?) WHERE id='intake' AND lease_until<?").bind(lease,now+LEASE_MS,new Date(now).toISOString(),now).run();
 if(!claimed.meta.changes)return {status:'busy' as const};
 try{
  const control=(await db().prepare("SELECT started_at FROM mail_intake_control WHERE id='intake'").first<{started_at:string}>())!;
  // Mail that arrived before the loop was switched on is observed only, never answered.
  await db().prepare("UPDATE mail_messages SET intake_state='observed' WHERE intake_state='pending' AND received_at<?").bind(control.started_at).run();
  for(const item of (await db().prepare("SELECT id FROM mail_outbox WHERE state='queued' ORDER BY created_at LIMIT 5").all<{id:string}>()).results)await deliver(config,deps,item.id);
  const {results}=await db().prepare("SELECT * FROM mail_messages WHERE mailbox=? AND intake_state='pending' ORDER BY received_at,uid LIMIT ?").bind(MAILBOX,limit).all<Message>();
  let processed=0;
  for(const message of results){
   try{const outcome=await processMessage(config,deps,message);await mark(message,outcome.state,outcome.note,outcome.threadId);}
   catch(error){
    const attempts=message.intake_attempts+1,note=error instanceof AppError?error.message:'İşlenemedi; yeniden denenecek.';
    await db().prepare('UPDATE mail_messages SET intake_attempts=?,intake_state=?,intake_note=? WHERE mailbox=? AND uid_validity=? AND uid=?').bind(attempts,attempts>=MAX_ATTEMPTS?'failed':'pending',note.slice(0,300),MAILBOX,message.uid_validity,message.uid).run();
    console.warn(JSON.stringify({event:'mail-intake',status:'error',uid:message.uid,attempts,error:error instanceof Error?`${error.name}: ${error.message}`.slice(0,300):'unknown'}));
   }
   processed++;
  }
  await confirmTransfers(config,deps);
  const ops=operationContext(config,deps,null,'',[],null,'');
  await confirmPrealerts(ops.notify,ops.setThread);
  await confirmVgms(config.owner,ops.notify,ops.setThread);
  return {status:'complete' as const,processed};
 }finally{await db().prepare("UPDATE mail_intake_control SET lease=NULL,lease_until=0 WHERE id='intake' AND lease=?").bind(lease).run();}
}

async function mark(m:Message,state:string,note:string,threadId?:string){
 await db().prepare('UPDATE mail_messages SET intake_state=?,intake_note=?,thread_id=COALESCE(?,thread_id) WHERE mailbox=? AND uid_validity=? AND uid=?').bind(state,note.slice(0,300),threadId||null,MAILBOX,m.uid_validity,m.uid).run();
}
const ids=(value:string)=>value.match(/<[^<>\s]+>/g)||[];

async function processMessage(config:IntakeConfig,deps:IntakeDeps,m:Message):Promise<{state:string;note:string;threadId?:string}>{
 const sender=(m.reply_to||m.from_address).toLowerCase();
 if(m.automated)return {state:'ignored',note:'Otomatik e-posta; yanıt verilmez.'};
 if(m.from_address.toLowerCase()===config.address||sender===config.address)return {state:'ignored',note:'Kendi gönderdiğimiz e-posta.'};
 if(!senderAllowed(m.from_address,config.allowed)||!senderAllowed(sender,config.allowed))return {state:'ignored',note:'Gönderen izinli listede değil.'};
 const refs=[...ids(m.in_reply_to||''),...ids(m.references_header)];
 let thread=refs.length?await db().prepare('SELECT t.* FROM mail_threads t WHERE EXISTS(SELECT 1 FROM json_each(t.message_ids) j WHERE j.value IN (SELECT value FROM json_each(?))) ORDER BY t.created_at DESC LIMIT 1').bind(JSON.stringify(refs)).first<Thread>():null;
 const tag=m.subject.match(/\b(CBI-[0-9A-F]{6})\b/i)?.[1]?.toUpperCase();
 if(!thread&&tag)thread=await db().prepare('SELECT * FROM mail_threads WHERE tag=?').bind(tag).first<Thread>();
 const parsed=await fetchMessage(config,deps,m);if(!parsed)return {state:'ignored',note:'E-posta sunucuda bulunamadı.'};
 const files=attachmentsOf(parsed.attachments);
 // Staff often start a new instruction by replying to an old e-mail: without the [CBI-…] tag, new
 // documents in a B/L conversation already sent to the platforms are a NEW instruction, not a reply.
 // (Same documents are still caught as duplicates by their content below.)
 if(thread&&!tag&&(!thread.kind||thread.kind==='bl')&&files.length&&await transferred(thread.record_id))thread=null;
 // Pre-alert and VGM mail (by subject, or a reply in such a conversation) never enters the B/L flow below.
 const operation=thread?(thread.kind&&thread.kind!=='bl'?thread.kind as OperationKind:null):operationKind(m.subject);
 if(operation)return await handleOperation(operation,operationContext(config,deps,m,thread?replyText(parsed.text):parsed.text,files,thread,sender));
 // What the sender wrote is read before anything is filed: a hold, cancel, correction or question stops automation.
 let first:{text:string;analysis:MailAnalysis}|null=null;
 if(!thread){
  if(files.length>5)return {state:'ignored',note:'5’ten fazla ek var; operasyon ekibi elle yüklemeli.'};
  first=await readMail(m,parsed.text,'new',files.map(f=>f.name));const {text,analysis}=first;
  // With attached documents the body is a cover note: read for intent, not filed as a document
  // (container lists or order numbers in it were read as package counts).
  const typed=!files.length&&analysis.hasShipmentData&&analysis.intent==='instruction'?textSource(`eposta-metni-${m.uid}.txt`,'E-posta metni / e-mail text',m,text):null;
  if(!files.length&&!(typed&&analysis.intent==='instruction'))return {state:'ignored',note:(m.attachments?'Desteklenen ek yok. ':'Ek yok. ')+'Talimat olarak işlenmedi: '+analysis.summary};
  // A document already on a record ties this mail to that record's conversation: never a second record.
  const hashes=await Promise.all(files.map(f=>digest(f.bytes)));
  // Every attached file must already be on that record: a shared signature image or logo alone never ties a new instruction to an old one.
  const unique=[...new Set(hashes)];
  const known=unique.length?await db().prepare(`SELECT r.id FROM record_documents d JOIN records r ON r.id=d.record_id AND d.revision=r.revision WHERE r.owner=? AND r.status<>'deleted' AND d.hash IN (${unique.map(()=>'?').join(',')}) GROUP BY r.id HAVING COUNT(DISTINCT d.hash)=? ORDER BY MAX(r.created_at) DESC LIMIT 1`).bind(config.owner,...unique,unique.length).first<{id:string}>():null;
  const existing=known?await db().prepare('SELECT * FROM mail_threads WHERE record_id=? ORDER BY created_at LIMIT 1').bind(known.id).first<Thread>():null;
  if(existing){
   // Same message retried after its check failed (no reply sent yet): run the check again.
   if(existing.rounds===0&&existing.state==='waiting_customer'&&m.message_id&&(JSON.parse(existing.message_ids) as string[]).includes(m.message_id))return {state:'done',note:await decide(config,deps,existing,m),threadId:existing.id};
   thread=existing;
  }else{
   // Records without a conversation (uploaded on screen) keep the existing duplicate handling.
   const reference=positionReference(m.subject+'\n'+parsed.text);
   // Duplicates are judged on the documents alone; typed-in data then joins the same record.
   const created=await createRecord(config.owner,{sources:files.length?files:[typed!],reference}),duplicate=created.duplicate;let row=created.row;
   if(!duplicate&&files.length&&typed)row=(await createRecord(config.owner,{sources:[...files,typed],recordId:row.id,reference})).row;
   if(duplicate){
    const existing=await db().prepare('SELECT * FROM mail_threads WHERE record_id=? ORDER BY created_at LIMIT 1').bind(row.id).first<Thread>();
    if(existing&&existing.rounds===0&&existing.state==='waiting_customer'&&m.message_id&&(JSON.parse(existing.message_ids) as string[]).includes(m.message_id))return {state:'done',note:await decide(config,deps,existing,m),threadId:existing.id};
    if(existing)return {state:'ignored',note:'Aynı talimat zaten kayıtlı.',threadId:existing.id};
   }
   const id=crypto.randomUUID(),now=new Date().toISOString(),newTag='CBI-'+id.replace(/-/g,'').slice(0,6).toUpperCase();
   const cc=[...new Set([...addresses(m.to_addresses),...addresses(m.cc_addresses)])].filter(a=>a!==config.address&&a!==sender&&senderAllowed(a,config.allowed)).slice(0,10);
   await db().prepare("INSERT INTO mail_threads(id,tag,record_id,owner,subject,customer,cc,message_ids,rounds,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,0,'waiting_customer',?,?)").bind(id,newTag,row.id,config.owner,m.subject.slice(0,300),sender,JSON.stringify(cc),JSON.stringify(m.message_id?[m.message_id]:[]),now,now).run();
   thread=(await db().prepare('SELECT * FROM mail_threads WHERE id=?').bind(id).first<Thread>())!;
   if(needsStaff(analysis))await setHold(thread.id,analysis);
   await addHblNumbers(thread.id,analysis);
   if(analysis.intent==='cancel'){await setThread(thread.id,'staff',analysisNote(analysis));return {state:'done',note:'İptal talebi; operasyon ekibine devredildi.',threadId:thread.id};}
   return {state:'done',note:await decide(config,deps,thread,m),threadId:thread.id};
  }
 }
 // Reply: the new text and files are added to the same record, operator edits are kept.
 await addMessageIds(thread.id,m.message_id?[m.message_id]:[]);
 const record=await owned(thread.record_id,thread.owner);
 const documents=await documentsFor(record),known=new Set(documents.map(d=>d.hash));
 const fresh=[];for(const f of files)if(!known.has(await digest(f.bytes)))fresh.push(f);
 // A CBI sender's reply to a record still missing data is an answer, even while staff holds it:
 // they ARE the operations team, so what they type must reach the record.
 const waiting=thread.state==='waiting_customer'||(thread.state==='staff'&&internalSender(m.from_address)&&record.status==='missing'&&!await transferred(record.id));
 const {text,analysis}=first||await readMail(m,replyText(parsed.text),waiting?'reply':'followup',fresh.map(f=>f.name));
 const staffNeeded=needsStaff(analysis);
 if(staffNeeded)await setHold(thread.id,analysis);
 await addHblNumbers(thread.id,analysis);
 if(analysis.intent==='cancel'){await setThread(thread.id,'staff',analysisNote(analysis)+(await transferred(thread.record_id)?' · Kayıt platformlara aktarılmış; değiştirilmedi.':''));return {state:'done',note:'İptal talebi; operasyon ekibine devredildi.',threadId:thread.id};}
 // Outside the question round only new documents count; a request in the text still reaches staff.
 if(!waiting&&!fresh.length){
  if(!staffNeeded)return {state:'ignored',note:(files.length?'Aynı belgeler zaten bu konşimentoda. ':thread.state==='complete'?'Kayıt zaten hazır. ':'Bu konu operasyon ekibinde. ')+analysis.summary,threadId:thread.id};
  await setThread(thread.id,'staff',analysisNote(analysis)+(await transferred(thread.record_id)?' · Kayıt platformlara aktarılmış; değiştirilmedi.':''));
  return {state:'done',note:'Operasyon ekibine bildirildi: '+analysis.summary,threadId:thread.id};
 }
 if(!waiting&&(record.status==='complete'||await transferred(record.id))){
  await setThread(thread.id,'staff',`Konşimento aktarıldıktan sonra yeni ek geldi (${fresh.map(f=>f.name).join(', ').slice(0,200)}); kayıt değiştirilmedi, operasyon ekibi kontrol etmeli.`);
  return {state:'done',note:'Yeni ek aktarılmış kayda eklenemez; operasyon ekibine bildirildi.',threadId:thread.id};
 }
 const previous=await Promise.all(documents.map(async d=>{const object=await runtime().BUCKET.get(d.object_key);if(!object)throw new AppError('Kayıtlı belge okunamadı.',503);return {name:d.filename,bytes:await object.arrayBuffer(),role:d.role as NewSource['role'],mime:d.mime};}));
 const added:NewSource[]=[...fresh];
 // Only text carrying shipment data becomes a document; booking, B/L, HBL and T-MAXX numbers go
 // straight into their fields, so they are never compared against the PDFs as a third document.
 const codes=Boolean(analysis.bookingNumber||analysis.blReference||analysis.houseBillNumber||analysis.houseBillNumbers?.length||positionReference(m.subject+'\n'+text));
 // A CBI sender answering our gap list is not a shipment document: the document reader read
 // "NG24 2NH NEWARK" from such a reply as a building number (CBI-06858D). Only the values matched
 // to the asked questions are used (applyStaffAnswers), never the reply text as a source.
 const staffReply=internalSender(m.from_address)&&Boolean(await db().prepare('SELECT 1 FROM mail_outbox WHERE thread_id=? AND round<0 LIMIT 1').bind(thread.id).first());
 if(staffReply&&!fresh.length){await applyStaffAnswers(thread,text);return {state:'done',note:await decide(config,deps,thread,m,!waiting),threadId:thread.id};}
 if(!staffReply&&text.replace(/\s/g,'').length>=3&&!(codes&&onlyCodes(text,analysis)))added.push(textSource(`eposta-yaniti-${thread.rounds}-${m.uid}.txt`,'E-posta yanıtı / e-mail reply',m,text));
 if(!added.length&&!(waiting&&codes))return {state:'ignored',note:'Yanıtta yeni bilgi veya ek yok.',threadId:thread.id};
 if(previous.length+added.length>5){await setThread(thread.id,'staff','Belge sayısı 5’i aşıyor; operasyon ekibi tamamlamalı.');return {state:'done',note:'Belge sınırı; operasyon ekibine devredildi.',threadId:thread.id};}
 try{await createRecord(thread.owner,{sources:[...previous,...added],recordId:thread.record_id,keepManual:true,reference:positionReference(m.subject+'\n'+text)});}
 catch(error){if(error instanceof AppError&&error.status===409){await setThread(thread.id,'staff',error.message);return {state:'done',note:error.message,threadId:thread.id};}throw error;}
 if(internalSender(m.from_address))await applyStaffAnswers(thread,text);
 return {state:'done',note:await decide(config,deps,thread,m,!waiting),threadId:thread.id};
}

/**
 * Once a conversation's record is completed on the platforms, the sender gets one notice
 * (outbox round 0). Records already transferred before the e-mail arrived are skipped.
 */
async function confirmTransfers(config:IntakeConfig,deps:IntakeDeps){
 const {results}=await db().prepare("SELECT t.* FROM mail_threads t JOIN records r ON r.id=t.record_id WHERE r.status='complete' AND NOT EXISTS(SELECT 1 FROM mail_outbox o WHERE o.thread_id=t.id AND o.round=0) AND NOT EXISTS(SELECT 1 FROM deliveries d WHERE d.record_id=t.record_id AND d.status IN ('sending','unknown')) AND EXISTS(SELECT 1 FROM deliveries d WHERE d.record_id=t.record_id AND d.status='created' AND d.updated_at>t.created_at) ORDER BY t.updated_at LIMIT 3").all<Thread>();
 for(const thread of results){
  const {results:created}=await db().prepare("SELECT platform,kind,COALESCE(reference,'') AS reference FROM deliveries WHERE record_id=? AND status='created' ORDER BY platform DESC").bind(thread.record_id).all<{platform:string;kind:string;reference:string}>();
  const domain=config.address.split('@')[1],messageId=`<${thread.tag.toLowerCase()}.done.${randomToken().slice(0,16)}@${domain}>`;
  const base=thread.subject.replace(/\s*\[CBI-[0-9A-F]{6}\]/gi,'').trim()||'Konşimento talimatı';
  const subject=(/^(re|ynt|yanıt|aw|sv):/i.test(base)?base:'Re: '+base)+' ['+thread.tag+']';
  const references=JSON.parse(thread.message_ids) as string[],recipients={to:[thread.customer],cc:JSON.parse(thread.cc) as string[]};
  const data=buildReply({from:config.address,fromName:config.fromName,to:recipients.to,cc:recipients.cc,subject,messageId,inReplyTo:references.at(-1)||'',references,text:await composeMail({kind:'confirm',tag:thread.tag,created,senderRequests:await holdOf(thread.id)})||confirmText({tag:thread.tag,created})});
  const id=crypto.randomUUID(),now=new Date().toISOString();
  const inserted=await db().prepare("INSERT OR IGNORE INTO mail_outbox(id,thread_id,round,message_id,recipients,subject,body,state,created_at) VALUES(?,?,0,?,?,?,?,'queued',?)").bind(id,thread.id,messageId,JSON.stringify(recipients),subject,data,now).run();
  if(!inserted.meta.changes)continue;
  await db().prepare("UPDATE mail_threads SET state='complete',note=?,message_ids=?,updated_at=? WHERE id=?").bind('Konşimento platformlarda oluşturuldu; göndericiye bildirim gönderildi.',JSON.stringify([...references,messageId]),now,thread.id).run();
  await deliver(config,deps,id);
 }
}

/**
 * A complete instruction goes to T-MAXX (HBL) and INTTRA (MBL) without a click when
 * MAIL_AUTO_SUBMIT is on. The transfer itself never re-sends a created or uncertain
 * delivery; here a booking already used by another record stops before any write,
 * and INTTRA warnings are never approved automatically.
 */
async function submit(thread:Thread){
 const hold=await holdOf(thread.id);
 // "Separate HBLs under one MBL" needs no person when the record already has them: at least two
 // house bills and no container in two of them. Otherwise staff decides.
 const numbers=JSON.parse((await db().prepare('SELECT hbl_numbers FROM mail_threads WHERE id=?').bind(thread.id).first<{hbl_numbers:string|null}>())?.hbl_numbers||'{}') as Record<string,string>;
 if(numbers.SPLIT_HBL){
  const row=await db().prepare('SELECT manual FROM records WHERE id=?').bind(thread.record_id).first<{manual:string|null}>();
  const bills=(JSON.parse(row?.manual||'{}') as {houseBills?:Bill[]}).houseBills||[],containers=bills.flatMap(b=>b.containerNumbers||[]);
  if(bills.length<2||bills.some(b=>!(b.containerNumbers||[]).length)||new Set(containers).size!==containers.length){await setThread(thread.id,'staff','Gönderen ayrı HBL ve tek MBL istedi; kayıttaki HBL dağılımı bunu karşılamıyor, otomatik aktarılmadı.'+(hold?' '+hold:''));return 'Ayrı HBL talebi kayıtla karşılanmıyor; operasyon ekibine devredildi.';}
 }
 const choice=await applyPlatformChoice(thread);
 if(choice){await setThread(thread.id,'staff',choice);return 'Platform tercihi operasyon kararı gerektiriyor; operasyon ekibine devredildi.';}
 // Only the MBL is left and INTTRA is still in its sign-in back-off: wait without touching either platform.
 await refreshPlatformHealth();
 if(!platformAvailable('inttra')&&await onlyInttraLeft(thread.record_id))return waitForInttra(thread);
 // Sessions are checked again right before the transfer: a session that expired since the check is opened again.
 try{await ensurePlatformSessions(thread.owner,await skippedPlatforms(thread.record_id));}
 catch(error){await setThread(thread.id,'staff',(error instanceof Error?error.message:'Platform oturumu açılamadı.')+' Aktarım başlatılmadı.');return 'Platform oturumu açılamadı; aktarım başlatılmadı.';}
 if(!platformAvailable('inttra')&&await onlyInttraLeft(thread.record_id))return waitForInttra(thread);
 if(hold){await setThread(thread.id,'staff','Eksik bilgi kalmadı ama gönderenin e-postasında operasyon kararı gereken bir talep var; otomatik aktarılmadı. '+hold);return 'Gönderen talebi; operasyon ekibine devredildi.';}
 if(runtime().MAIL_AUTO_SUBMIT!=='true'){await setThread(thread.id,'complete','Eksik bilgi kalmadı; konşimento aktarıma hazır.');return 'Kayıt hazır.';}
 const other=await db().prepare("SELECT o.id FROM records r JOIN records o ON o.owner=r.owner AND o.id<>r.id AND o.status<>'deleted' AND json_extract(o.fields,'$.bookingNumber.value')=json_extract(r.fields,'$.bookingNumber.value') WHERE r.id=? AND COALESCE(json_extract(r.fields,'$.bookingNumber.value'),'')<>'' LIMIT 1").bind(thread.record_id).first<{id:string}>();
 if(other){await setThread(thread.id,'staff','Aynı booking numarası başka bir konşimento kaydında var; mükerrer aktarım olmaması için otomatik aktarılmadı.');return 'Mükerrer kontrolü: operasyon ekibine devredildi.';}
 let record:{status:string;issues?:string[]|null};
 // An INTTRA review approved below (fresh, same revision) is passed on exactly like the screen's "Onayla".
 const approved=await db().prepare("SELECT p.input_hash AS inputHash,p.created_at AS createdAt FROM platform_reviews p JOIN records r ON r.id=p.record_id AND r.revision=p.revision WHERE p.record_id=? AND p.approved=1 AND p.created_at>?").bind(thread.record_id,new Date(Date.now()-25*60000).toISOString()).first<{inputHash:string;createdAt:string}>();
 try{record=await checkRecord(thread.owner,thread.record_id,'submit',approved||undefined) as unknown as typeof record;}
 catch(error){
  // Never retried from here: an uncertain transfer must be verified by staff first.
  await setThread(thread.id,'staff','Otomatik aktarım tamamlanamadı: '+(error instanceof Error?error.message:'bilinmeyen hata').slice(0,250));
  return 'Aktarım hatası; operasyon ekibine devredildi.';
 }
 if(record.status==='complete'){await setThread(thread.id,'complete','Konşimento platformlara otomatik aktarıldı.');return 'Platformlara aktarıldı.';}
 if(record.status==='partial'&&!platformAvailable('inttra')&&await onlyInttraLeft(thread.record_id))return waitForInttra(thread);
 if(record.status==='review'){
  if(!approved&&await acceptBookingNotice(thread)){await setThread(thread.id,'submitting','INTTRA 10136 (booking INTTRA kayıtlarında yok) uyarısı, booking CBI yetkilisinin e-postasıyla doğrulandığı için otomatik kabul edildi; aktarım sırada.');return 'INTTRA 10136 otomatik kabul edildi; aktarım sırada.';}
  await setThread(thread.id,'staff','INTTRA uyarı verdi; aktarım operasyon ekibinin onayını bekliyor.');return 'INTTRA uyarısı; operasyon ekibinde.';
 }
 await setThread(thread.id,'staff','Otomatik aktarım tamamlanmadı'+((record.issues||[]).length?': '+(record.issues||[]).join(' ').slice(0,250):` (kayıt durumu: ${record.status}).`));
 return 'Aktarım tamamlanmadı; operasyon ekibine devredildi.';
}

/**
 * INTTRA 10136 only says the booking is not among INTTRA's own bookings (MSC books outside INTTRA)
 * and to proceed if it is correct. It is accepted, like staff do on screen, when it is the ONLY
 * warning and the record's booking is the one the CBI sender e-mailed or the T-MAXX position holds.
 */
async function acceptBookingNotice(thread:Thread){
 const row=await db().prepare("SELECT p.warnings,p.input_hash,p.created_at,json_extract(r.fields,'$.bookingNumber.value') AS booking,json_extract(r.fields,'$.bookingNumber.source') AS source,t.hbl_numbers FROM platform_reviews p JOIN records r ON r.id=p.record_id AND r.revision=p.revision JOIN mail_threads t ON t.record_id=r.id WHERE p.record_id=? AND t.id=? AND p.approved=0").bind(thread.record_id,thread.id).first<{warnings:string;input_hash:string;created_at:string;booking:string|null;source:string|null;hbl_numbers:string|null}>();
 if(!row)return false;
 const warnings=JSON.parse(row.warnings||'[]') as {code?:string}[],booking=(row.booking||'').replace(/\s/g,'').toUpperCase();
 const mailed=(JSON.parse(row.hbl_numbers||'{}') as Record<string,string>).BOOKING||'';
 if(warnings.length!==1||warnings[0].code!=='10136'||!booking||!(booking===mailed||(row.source||'').startsWith('T-MAXX')))return false;
 const result=await db().prepare('UPDATE platform_reviews SET approved=1 WHERE record_id=? AND input_hash=? AND created_at=? AND approved=0').bind(thread.record_id,row.input_hash,row.created_at).run();
 return result.meta.changes>0;
}
/** Everything but the INTTRA MBL is done (HBL created, or not needed) and INTTRA has not been sent. */
async function onlyInttraLeft(recordId:string){
 const {results}=await db().prepare('SELECT platform,status FROM deliveries WHERE record_id=?').bind(recordId).all<{platform:string;status:string}>();
 const inttra=results.find(d=>d.platform==='inttra');
 return Boolean(inttra&&['waiting','failed','blocked'].includes(inttra.status)&&results.every(d=>d.platform==='inttra'||['created','skipped'].includes(d.status)));
}
/**
 * INTTRA cannot be reached: the conversation stays in the transfer queue and the MBL instruction
 * is sent on its own once INTTRA answers again. After a day it goes to staff instead.
 */
async function waitForInttra(thread:Thread){
 const row=await db().prepare('SELECT created_at FROM mail_threads WHERE id=?').bind(thread.id).first<{created_at:string|null}>();
 const since=Date.parse(row?.created_at||'');
 if(Number.isFinite(since)&&Date.now()-since>INTTRA_WAIT_MS){await setThread(thread.id,'staff','INTTRA bir gündür erişilemiyor; HBL tamamlandı, MBL talimatı INTTRA’ya gönderilemedi. Operasyon ekibi tamamlamalı.');return 'INTTRA uzun süredir erişilemiyor; operasyon ekibine devredildi.';}
 await setThread(thread.id,'submitting','HBL tamamlandı. INTTRA şu an erişilemiyor; MBL talimatı INTTRA yeniden erişilebilir olunca otomatik gönderilecek.');
 return 'INTTRA bekleniyor; MBL talimatı sonra gönderilecek.';
}
async function transferred(recordId:string){
 return Boolean(await db().prepare("SELECT 1 FROM deliveries WHERE record_id=? AND status IN ('created','sending','unknown') LIMIT 1").bind(recordId).first());
}

/** Runs the check and either finishes, hands over to staff, or asks the customer again. */
/** quiet: a conversation already with staff never sends a new question by itself. */
async function decide(config:IntakeConfig,deps:IntakeDeps,thread:Thread,m:Message,quiet=false){
 let record:{status:string;issues?:string[]|null};
 const choice=await applyPlatformChoice(thread);
 // T-MAXX and INTTRA sessions are checked (and opened again if expired) before the record is read
 // against them. A 503 leaves the e-mail pending, so it is tried again on the next run.
 if(!choice)await ensurePlatformSessions(thread.owner,await skippedPlatforms(thread.record_id));
 if(choice){await setThread(thread.id,'staff',choice);return 'Platform tercihi operasyon kararı gerektiriyor; operasyon ekibine devredildi.';}
 const check=async()=>{
  try{record=await checkRecord(thread.owner,thread.record_id,'check') as unknown as typeof record;}
  catch(error){
   if(error instanceof AppError&&error.status===503)throw error;
   // A malformed AI reading (502) is temporary, as "Yeniden kontrol et" on screen shows: retry on the next run.
   if(error instanceof AppError&&error.status===502&&m.intake_attempts<MAX_ATTEMPTS-1)throw new AppError(error.message,503);
   record={status:'blocked',issues:[error instanceof Error?error.message:'Kontrol tamamlanamadı.']};}
 };
 await check();
 // Like staff on screen: the T-MAXX position found from the containers fills booking, MBL parties and INTTRA settings.
 if(record!.status==='missing'&&!await hasReference(thread)){
  let reference='';try{reference=await findPosition(thread.owner,thread.record_id);}catch{/* T-MAXX unavailable: the reference is asked for instead. */}
  if(reference){
   await db().prepare("UPDATE records SET manual=json_set(COALESCE(manual,'{}'),'$.tmaxxReference',?) WHERE id=? AND COALESCE(json_extract(manual,'$.tmaxxReference'),'')=''").bind(reference,thread.record_id).run();
   await check();
  }
 }
 if(record!.status==='missing'&&await completeFromMail(thread))await check();
 record=record!;
 // A record already sent to the platforms (e.g. the same documents uploaded before) is never re-processed.
 if(record.status==='complete'){await setThread(thread.id,'complete','Bu talimat daha önce işlenmiş; konşimento platformlara aktarılmış.');return 'Talimat daha önce işlenmiş.';}
 // The transfer runs in its own Worker invocation (runMailSubmit), like "Aktar" on screen:
 // mail reading, AI and T-MAXX lookups here would otherwise exhaust the per-invocation request budget.
 if(record.status==='ready'){await setThread(thread.id,'submitting','Eksik bilgi kalmadı; aktarım sırada.');return 'Kayıt hazır; aktarım sırada.';}
 if(record.status!=='missing'){await setThread(thread.id,'staff','Talimat otomatik işlenemedi'+((record.issues||[]).length?': '+(record.issues||[]).join(' ').slice(0,200):` (kayıt durumu: ${record.status}).`));return 'Operasyon ekibine devredildi.';}
 const requests=customerRequests(record.issues||[]),staff=requests.staff;let ask=requests.ask;
 // Booking, MBL parties, carrier and INTTRA settings come from the T-MAXX position; CBI senders know its reference.
 if(staff.length&&!await hasReference(thread))ask.unshift({tr:'T-MAXX pozisyon referansı (örn. S.E.26.11.00123)',en:'T-MAXX position reference (e.g. S.E.26.11.00123)',detail:'With this reference booking, MBL parties, carrier and INTTRA settings are filled automatically from T-MAXX; ask it first.'});
 // One e-mail asks everything: a later round only repeats items already asked and still open.
 // Anything new after the sender answered is never put to them; staff checks it instead.
 if(thread.rounds>0&&thread.asked){
  const asked=new Set(JSON.parse(thread.asked) as string[]),fresh=ask.filter(a=>!asked.has(a.tr));
  if(fresh.length){await setThread(thread.id,'staff','Yanıttan sonra yeni eksik çıktı; firma yetkilisine sorulmadı, operasyon ekibi kontrol etmeli: '+fresh.map(a=>a.tr).join(' · ').slice(0,250));return 'Yeni eksikler firma yetkilisine sorulmadı; operasyon ekibine devredildi.';}
  ask=ask.filter(a=>asked.has(a.tr));
 }
 if(quiet){await setThread(thread.id,'staff','Yeni bilgi eklendi; kalan eksikler: '+[...ask.map(a=>a.tr),...staff].join(' · ').slice(0,250));return 'Yeni bilgi aynı konşimentoya eklendi; operasyon ekibinde.';}
 if(!ask.length){
  await setThread(thread.id,'staff','Kalan eksikler operasyon ekibinin: '+staff.join(' ').slice(0,200));
  if(internalSender(thread.customer)&&staff.length&&await staffNotice(config,deps,thread,m,staff))return 'Kalan eksikler operasyon ekibinin; göndericiye eksik listesi gönderildi.';
  return 'Firma yetkilisinden istenecek bilgi yok; operasyon ekibine devredildi.';
 }
 if(thread.rounds>=MAX_ROUNDS){await setThread(thread.id,'staff',`${MAX_ROUNDS} yanıttan sonra hâlâ eksik bilgi var.`);return 'Tur sınırı; operasyon ekibine devredildi.';}
 const round=thread.rounds+1,domain=config.address.split('@')[1],messageId=`<${thread.tag.toLowerCase()}.${round}.${randomToken().slice(0,16)}@${domain}>`;
 const base=thread.subject.replace(/\s*\[CBI-[0-9A-F]{6}\]/gi,'').trim()||'Konşimento talimatı';
 const subject=(/^(re|ynt|yanıt|aw|sv):/i.test(base)?base:'Re: '+base)+' ['+thread.tag+']';
 const hold=await holdOf(thread.id);
 const body=await composeMail({kind:'request',tag:thread.tag,round,maxRounds:MAX_ROUNDS,ask,senderRequests:hold})||requestText({tag:thread.tag,round,ask,maxRounds:MAX_ROUNDS,noted:Boolean(hold)}),recipients={to:[thread.customer],cc:JSON.parse(thread.cc) as string[]};
 const references=JSON.parse(thread.message_ids) as string[];
 const id=crypto.randomUUID(),now=new Date().toISOString();
 const data=buildReply({from:config.address,fromName:config.fromName,to:recipients.to,cc:recipients.cc,subject,messageId,inReplyTo:m.message_id||references.at(-1)||'',references,text:body});
 await db().batch([
  db().prepare("INSERT INTO mail_outbox(id,thread_id,round,message_id,recipients,subject,body,state,created_at) VALUES(?,?,?,?,?,?,?,'queued',?)").bind(id,thread.id,round,messageId,JSON.stringify(recipients),subject,data,now),
  db().prepare("UPDATE mail_threads SET rounds=?,state='waiting_customer',note=?,message_ids=?,asked=?,updated_at=? WHERE id=?").bind(round,`${ask.length} bilgi istendi (${round}. tur).`,JSON.stringify([...references,messageId]),JSON.stringify([...new Set([...JSON.parse(thread.asked||'[]') as string[],...ask.map(a=>a.tr)])]),now,thread.id),
 ]);
 await deliver(config,deps,id);
 return `${ask.length} eksik bilgi için yanıt gönderildi (${round}. tur).`;
}

const STAFF_NOTICE_ROUND=-1;
/** CBI's own operations addresses send most instructions; they must hear back even when nothing is asked of a customer. */
export function internalSender(address:string){return /@cbitransport\.com(\.tr)?$/i.test(address.trim());}
/** One notice per conversation (outbox round -1); the thread then waits for the sender's answer. */
async function staffNotice(config:IntakeConfig,deps:IntakeDeps,thread:Thread,m:Message,staff:string[]){
 // First notice -1; after the sender answered and gaps remain, one reminder -2; then staff only.
 const sent=await db().prepare('SELECT MIN(round) AS low FROM mail_outbox WHERE thread_id=? AND round<0').bind(thread.id).first<{low:number|null}>();
 const round=sent?.low==null?STAFF_NOTICE_ROUND:sent.low===STAFF_NOTICE_ROUND?STAFF_NOTICE_ROUND-1:null;
 if(round===null)return false;
 const domain=config.address.split('@')[1],messageId=`<${thread.tag.toLowerCase()}.staff${-round}.${randomToken().slice(0,16)}@${domain}>`;
 const base=thread.subject.replace(/\s*\[CBI-[0-9A-F]{6}\]/gi,'').trim()||'Konşimento talimatı';
 const subject=(/^(re|ynt|yanıt|aw|sv):/i.test(base)?base:'Re: '+base)+' ['+thread.tag+']';
 const references=JSON.parse(thread.message_ids) as string[],recipients={to:[thread.customer],cc:JSON.parse(thread.cc) as string[]};
 const data=buildReply({from:config.address,fromName:config.fromName,to:recipients.to,cc:recipients.cc,subject,messageId,inReplyTo:m.message_id||references.at(-1)||'',references,text:staffText({tag:thread.tag,staff,again:round!==STAFF_NOTICE_ROUND})});
 const id=crypto.randomUUID(),now=new Date().toISOString();
 const inserted=await db().prepare("INSERT OR IGNORE INTO mail_outbox(id,thread_id,round,message_id,recipients,subject,body,state,created_at) VALUES(?,?,?,?,?,?,?,'queued',?)").bind(id,thread.id,round,messageId,JSON.stringify(recipients),subject,data,now).run();
 if(!inserted.meta.changes)return false;
 // The sender was asked: their reply is read as an answer (text and numbers go into the record), not just noted.
 await db().prepare("UPDATE mail_threads SET state='waiting_customer',note=?,message_ids=?,asked=?,updated_at=? WHERE id=?").bind('Kalan eksikler göndericiye iletildi: '+staff.join(' ').slice(0,200),JSON.stringify([...references,messageId]),JSON.stringify(staff),now,thread.id).run();
 await deliver(config,deps,id);
 return true;
}

/**
 * Transfers one ready mail record per call, in an invocation of its own. The thread is claimed
 * before the transfer starts and is never re-queued: an interrupted transfer stays with staff.
 */
export async function runMailSubmit(){
 const config=intakeConfig();if(!config)return {status:'disabled' as const};
 const thread=await db().prepare("SELECT * FROM mail_threads WHERE state='submitting' ORDER BY updated_at LIMIT 1").first<Thread>();
 if(!thread)return {status:'idle' as const};
 const claimed=await db().prepare("UPDATE mail_threads SET state='staff',note=?,updated_at=? WHERE id=? AND state='submitting'").bind('Otomatik aktarım başladı ama sonuç kaydedilmedi; platformlardaki durumu kontrol edin.',new Date().toISOString(),thread.id).run();
 if(!claimed.meta.changes)return {status:'busy' as const};
 const note=await submit(thread);
 console.log(JSON.stringify({event:'mail-submit',thread:thread.tag,note}));
 return {status:'complete' as const,note};
}

/** At most one SMTP attempt per call; after DATA an unknown outcome is never retried. */
async function deliver(config:IntakeConfig,deps:IntakeDeps,id:string){
 const hour=new Date().toISOString().slice(0,13);
 const quota=await db().prepare("UPDATE mail_intake_control SET sent_in_hour=CASE WHEN sent_hour=? THEN sent_in_hour+1 ELSE 1 END,sent_hour=? WHERE id='intake' AND (sent_hour IS NOT ? OR sent_in_hour<?)").bind(hour,hour,hour,HOURLY_LIMIT).run();
 if(!quota.meta.changes)return;
 const claimed=await db().prepare("UPDATE mail_outbox SET state='sending',attempts=attempts+1 WHERE id=? AND state='queued'").bind(id).run();
 if(!claimed.meta.changes)return;
 const item=(await db().prepare('SELECT * FROM mail_outbox WHERE id=?').bind(id).first<{thread_id:string;recipients:string;body:string;attempts:number}>())!;
 const recipients=JSON.parse(item.recipients) as {to:string[];cc:string[]};
 try{
  await sendSmtp(deps.openSmtp(config),{host:config.smtp.host,user:config.imap.user,password:config.imap.password,from:config.address,recipients:[...recipients.to,...recipients.cc].filter(validAddress),data:item.body});
  await db().prepare("UPDATE mail_outbox SET state='sent',sent_at=?,error=NULL WHERE id=?").bind(new Date().toISOString(),id).run();
 }catch(error){
  const code=error instanceof SmtpError?error.code:'connection_failed',afterData=error instanceof SmtpError&&error.phase==='after_data';
  const state=afterData?'unknown':item.attempts>=MAX_ATTEMPTS||code==='auth_failed'||code==='recipient_rejected'?'failed':'queued';
  await db().prepare('UPDATE mail_outbox SET state=?,error=? WHERE id=?').bind(state,code,id).run();
  if(state!=='queued')await setThread(item.thread_id,'staff',state==='unknown'?'Yanıtın gönderilip gönderilmediği doğrulanamadı; tekrar gönderilmedi.':'Yanıt gönderilemedi: '+code);
  console.warn(JSON.stringify({event:'mail-outbox',status:state,code}));
 }
}

/**
 * Analyses the e-mail text. A temporary AI failure leaves the mail pending for the
 * next run; on the last attempt the mail continues, but without automatic transfer.
 */
async function readMail(m:Message,raw:string,stage:'new'|'reply'|'followup',attachments:string[]):Promise<{text:string;analysis:MailAnalysis}>{
 const text=raw.replace(/\r\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim().slice(0,20000);
 if(text.replace(/\s/g,'').length<3)return {text,analysis:EMPTY};
 try{return {text,analysis:await analyzeMail({subject:m.subject,text,stage,attachments})};}
 catch(error){
  if(m.intake_attempts<MAX_ATTEMPTS-1)throw error instanceof AppError?new AppError(error.message,503):error;
  return {text,analysis:FAILED};
 }
}
/**
 * True when, apart from the numbers the analysis already read (booking, B/L, HBL, T-MAXX), the
 * reply holds nothing: no figures and no words beyond labels and greetings. Quote headers
 * ("X <a@b>, 10 Kas 2026 Sal, 23:38"), addresses, dates and times are ignored.
 */
export function onlyCodes(text:string,a:Pick<MailAnalysis,'bookingNumber'|'blReference'|'houseBillNumbers'|'houseBillNumber'>){
 let rest=text.toUpperCase().replace(/İ/g,'I').replace(/I\u0307/g,'I').split(/\n/).filter(l=>!/@|YAZDI|WROTE|^\s*>/i.test(l)).join(' ');
 for(const c of [a.bookingNumber,a.blReference,a.houseBillNumber,...(a.houseBillNumbers||[]).flatMap(p=>[p.number,p.container])])if(c)rest=rest.split(c).join(' ');
 rest=rest.replace(/[A-Z]{4}[\s-]?\d{6}[\s-]?\d/g,' ').replace(/(?<![A-Z0-9.])(?:YK\.)?S\.?E\.?\d{2}\.?\d{2}\.?\d{5}/g,' ');
 if(/\d/.test(rest))return false;
 const filler=new Set(['BOOKING','BKG','NO','NR','NUMARASI','NUMARA','NUMBER','BL','B/L','HBL','MBL','MASTER','HOUSE','KONŞIMENTO','KONSIMENTO','REFERANS','REFERENCE','POZISYON','VE','AND','MERHABA','SELAM','IYI','ÇALIŞMALAR','TEŞEKKÜRLER','TEŞEKKÜR','EDERIM','SAYGILARIMLA','RICA','THANKS','THANK','YOU','REGARDS','KIND','BEST','HELLO','HI','DEAR']);
 // Separators such as "//", "-" or "|" are not words.
 return rest.split(/[^A-ZÇĞÖŞÜ/]+/).filter(w=>/[A-ZÇĞÖŞÜ]/.test(w)&&!filler.has(w)).length===0;
}
function textSource(name:string,title:string,m:Message,text:string):NewSource{
 return {name,bytes:new TextEncoder().encode(`${title}\nGönderen / from: ${(m.reply_to||m.from_address).toLowerCase()}\nTarih / date: ${m.received_at}\nKonu / subject: ${m.subject}\n\n${text}`).buffer as ArrayBuffer,role:'instruction',mime:'text/plain'};
}
/** T-MAXX position reference (S.E.yy.mm.nnnnn); HBL numbers such as YK.S.E.… are not positions. */
export function positionReference(text:string){
 const m=text.match(/(?<![A-Z0-9.])S\.?E\.?(\d{2})\.?(0[1-9]|1[0-2])\.?(\d{5})(?!\d)/i);
 return m?`S.E.${m[1]}.${m[2]}.${m[3]}`:'';
}
async function hasReference(thread:Thread){
 const row=await db().prepare("SELECT COALESCE(json_extract(manual,'$.tmaxxReference'),'') AS ref FROM records WHERE id=?").bind(thread.record_id).first<{ref:string}>();
 return Boolean(row?.ref);
}
async function addHblNumbers(id:string,a:MailAnalysis){
 // Facts typed in the e-mail: container → House B/L number, plus the reserved keys BOOKING and BLREFERENCE.
 if(!a.houseBillNumbers?.length&&!a.houseBillNumber&&!a.bookingNumber&&!a.blReference&&!a.splitHouseBills&&!a.hblPlatform&&!a.mblPlatform)return;
 const row=await db().prepare('SELECT hbl_numbers FROM mail_threads WHERE id=?').bind(id).first<{hbl_numbers:string|null}>();
 const map={...JSON.parse(row?.hbl_numbers||'{}') as Record<string,string>};for(const p of a.houseBillNumbers||[])map[p.container]=p.number;
 if(a.splitHouseBills)map.SPLIT_HBL='1';
 if(a.bookingNumber)map.BOOKING=a.bookingNumber;if(a.blReference)map.BLREFERENCE=a.blReference;if(a.houseBillNumber)map.HBL=a.houseBillNumber;if(a.hblPlatform)map.HBL_PLATFORM=a.hblPlatform;if(a.mblPlatform)map.MBL_PLATFORM=a.mblPlatform;
 await db().prepare('UPDATE mail_threads SET hbl_numbers=? WHERE id=?').bind(JSON.stringify(map),id).run();
}
type Bill={containerNumbers:string[];number:string;partyOverrides?:Record<string,Record<string,string>>};
/**
 * Fills what staff would type on screen from sources already at hand: House B/L numbers the
 * sender wrote next to the containers, and the shipper's postal code from this shipper's last
 * completed record. Only empty values are filled; returns true when the record changed.
 */
async function completeFromMail(thread:Thread){
 const row=await db().prepare("SELECT manual,json_extract(fields,'$.shipperName.value') AS shipper,issues FROM records WHERE id=?").bind(thread.record_id).first<{manual:string|null;shipper:string|null;issues:string|null}>();
 if(!row?.manual)return false;
 const manual=JSON.parse(row.manual) as {houseBills?:Bill[];bookingNumber?:string;blReference?:string;houseBillNumber?:string;inttra?:{houseBill?:string};partyOverrides?:Record<string,Record<string,string>|undefined>};
 const numbers=JSON.parse((await db().prepare('SELECT hbl_numbers FROM mail_threads WHERE id=?').bind(thread.id).first<{hbl_numbers:string|null}>())?.hbl_numbers||'{}') as Record<string,string>;
 const clean=(v:string)=>v.replace(/[\s-]/g,'').toUpperCase();let changed=false;
 if(!manual.bookingNumber&&numbers.BOOKING){manual.bookingNumber=numbers.BOOKING;changed=true;}
 if(!manual.blReference&&numbers.BLREFERENCE){manual.blReference=numbers.BLREFERENCE;changed=true;}
 const bills=manual.houseBills||[];
 for(const bill of bills){
  if(bill.number)continue;
  const found=[...new Set(bill.containerNumbers.map(c=>numbers[clean(c)]).filter(Boolean))];
  if(found.length===1){bill.number=found[0];changed=true;}
  else if(!found.length&&bills.length===1&&numbers.HBL){bill.number=numbers.HBL;changed=true;}
 }
 // INTTRA's single House Bill Number (one HBL under the MBL): the HBL the sender wrote, alone or next to every container.
 if(manual.inttra?.houseBill==='2'&&!manual.houseBillNumber){
  const byContainer=[...new Set(Object.entries(numbers).filter(([k])=>/^[A-Z]{4}\d{7}$/.test(k)).map(([,v])=>v))];
  const single=numbers.HBL&&(!byContainer.length||(byContainer.length===1&&byContainer[0]===numbers.HBL))?numbers.HBL:!numbers.HBL&&byContainer.length===1?byContainer[0]:'';
  if(single){manual.houseBillNumber=single;changed=true;}
 }
 if(row.shipper&&/Gerçek gönderen: Posta kodu/.test(row.issues||'')){
  const name=row.shipper.replace(/\s+/g,' ').trim().toUpperCase();
  const {results}=await db().prepare("SELECT manual FROM records WHERE owner=? AND id<>? AND status='complete' AND UPPER(TRIM(json_extract(fields,'$.shipperName.value')))=? ORDER BY updated_at DESC LIMIT 5").bind(thread.owner,thread.record_id,name).all<{manual:string|null}>();
  const codes=new Set<string>(),topCodes=new Set<string>();
  for(const r of results){
   const previous=JSON.parse(r.manual||'{}') as {houseBills?:Bill[];partyOverrides?:Record<string,Record<string,string>|undefined>};
   for(const b of previous.houseBills||[]){const code=b.partyOverrides?.shipper?.postalCode;if(code&&/^\d{4,10}$/.test(code))codes.add(code);}
   const top=previous.partyOverrides?.shipper?.postalCode;if(top&&/^\d{4,10}$/.test(top))topCodes.add(top);
  }
  // INTTRA's actual shipper (the record's own party, not an HBL's) keeps the code staff confirmed for that same role before.
  const issues=(()=>{try{return JSON.parse(row.issues||'[]') as string[];}catch{return [] as string[];}})();
  if(issues.some(i=>/^Gerçek gönderen: Posta kodu/.test(i))&&topCodes.size===1&&!manual.partyOverrides?.shipper?.postalCode){
   manual.partyOverrides={...manual.partyOverrides,shipper:{...manual.partyOverrides?.shipper,postalCode:[...topCodes][0]}};changed=true;
  }
  if(codes.size===1){const code=[...codes][0];for(const bill of manual.houseBills||[]){const shipper=bill.partyOverrides?.shipper||{};if(!shipper.postalCode){bill.partyOverrides={...bill.partyOverrides,shipper:{...shipper,postalCode:code}};changed=true;}}}
 }
 if(!changed)return false;
 await db().prepare('UPDATE records SET manual=? WHERE id=?').bind(JSON.stringify(manual),thread.record_id).run();
 return true;
}
/** Values the CBI sender typed for the items in the gap notice go straight into those fields; filled fields are never overwritten. */
async function applyStaffAnswers(thread:Thread,text:string){
 const row=await db().prepare('SELECT r.manual,r.issues,t.asked FROM records r JOIN mail_threads t ON t.record_id=r.id WHERE r.id=? AND t.id=?').bind(thread.record_id,thread.id).first<{manual:string|null;issues:string|null;asked:string|null}>();
 if(!row)return;
 // The notice's numbered list comes first so "2. … : value" points at the item the sender saw as 2.
 const issues=[...new Set([...JSON.parse(row.asked||'[]') as string[],...JSON.parse(row.issues||'[]') as string[]])];
 const answers=staffAnswers(text,issues);if(!answers.length)return;
 const manual=JSON.parse(row.manual||'{}') as {houseBillNumber?:string;houseBills?:Bill[];partyOverrides?:Record<string,Record<string,string>>};let changed=false;
 for(const a of answers){
  if(a.path[0]==='houseBillNumber'){if(!manual.houseBillNumber){manual.houseBillNumber=a.value;changed=true;}}
  else if(a.path[0]==='houseBills'){const bill=manual.houseBills?.[a.path[1]];if(bill&&!bill.number){bill.number=a.value;changed=true;}}
  else{const [,role,key]=a.path;manual.partyOverrides||={};const party=manual.partyOverrides[role]||={};if(!party[key]){party[key]=a.value;changed=true;}}
 }
 if(!changed)return;
 await db().prepare('UPDATE records SET manual=? WHERE id=?').bind(JSON.stringify(manual),thread.record_id).run();
 console.log(JSON.stringify({event:'mail-staff-answers',thread:thread.tag,fields:answers.map(a=>a.path.join('.'))}));
}
/**
 * Where the sender wants the House B/L (T-MAXX) and Master B/L (INTTRA) created. "Not to be created"
 * is written to the record; a platform we are not connected to, or neither one, is left to staff
 * (returns the note). Nothing is changed once a platform already holds the record.
 */
async function applyPlatformChoice(thread:Thread):Promise<string>{
 const numbers=JSON.parse((await db().prepare('SELECT hbl_numbers FROM mail_threads WHERE id=?').bind(thread.id).first<{hbl_numbers:string|null}>())?.hbl_numbers||'{}') as Record<string,string>;
 const hbl=numbers.HBL_PLATFORM,mbl=numbers.MBL_PLATFORM;
 if(!hbl&&!mbl)return '';
 if(hbl==='other'||mbl==='other')return 'Gönderen konşimentonun bağlı olmadığımız bir platformda oluşturulmasını istedi (House B/L: '+(hbl||'-')+', Master B/L: '+(mbl||'-')+'); otomatik aktarılmadı.';
 if(hbl==='none'&&mbl==='none')return 'Gönderen House B/L ve Master B/L için "oluşturulmasın" yazdı; otomatik aktarılmadı, operasyon ekibi kontrol etmeli.';
 const skip=[...(hbl==='none'?['tmaxx']:[]),...(mbl==='none'?['inttra']:[])];
 const row=await db().prepare('SELECT manual FROM records WHERE id=?').bind(thread.record_id).first<{manual:string|null}>();
 const manual=JSON.parse(row?.manual||'{}') as {skipPlatforms?:string[]};
 if(JSON.stringify([...(manual.skipPlatforms||[])].sort())===JSON.stringify([...skip].sort()))return '';
 const started=await db().prepare("SELECT platform FROM deliveries WHERE record_id=? AND status IN ('created','sending','unknown') LIMIT 1").bind(thread.record_id).first();
 if(started)return 'Gönderenin platform tercihi kayıt bir platforma aktarıldıktan sonra geldi; kayıt değiştirilmedi.';
 if(skip.length)manual.skipPlatforms=skip;else delete manual.skipPlatforms;
 await db().prepare('UPDATE records SET manual=? WHERE id=?').bind(JSON.stringify(manual),thread.record_id).run();
 return '';
}
async function skippedPlatforms(recordId:string){const row=await db().prepare("SELECT json_extract(manual,'$.skipPlatforms') AS skip FROM records WHERE id=?").bind(recordId).first<{skip:string|null}>();try{const v=JSON.parse(row?.skip||'[]');return Array.isArray(v)?v.map(String):[];}catch{return [];}}
async function holdOf(id:string){return (await db().prepare('SELECT hold FROM mail_threads WHERE id=?').bind(id).first<{hold:string|null}>())?.hold||'';}
async function setHold(id:string,a:MailAnalysis){await db().prepare("UPDATE mail_threads SET hold=substr(COALESCE(hold||' | ','')||?,1,1000),updated_at=? WHERE id=?").bind(analysisNote(a),new Date().toISOString(),id).run();}
async function setThread(id:string,state:string,note:string){await db().prepare('UPDATE mail_threads SET state=?,note=?,updated_at=? WHERE id=?').bind(state,note.slice(0,400),new Date().toISOString(),id).run();}
async function addMessageIds(id:string,add:string[]){
 if(!add.length)return;
 const row=await db().prepare('SELECT message_ids FROM mail_threads WHERE id=?').bind(id).first<{message_ids:string}>();
 const list=[...new Set([...(JSON.parse(row?.message_ids||'[]') as string[]),...add])].slice(-50);
 await db().prepare('UPDATE mail_threads SET message_ids=?,updated_at=? WHERE id=?').bind(JSON.stringify(list),new Date().toISOString(),id).run();
}
function addresses(value:string){return value.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(v=>parseAddress(v).address).filter(validAddress);}

async function fetchMessage(config:IntakeConfig,deps:IntakeDeps,m:Message){
 const socket=deps.openImap(config);
 try{
  const imap=await openImap(socket,{user:config.imap.user,password:config.imap.password});
  try{
   const box=await imap.examine(MAILBOX);if(box.uidValidity!==m.uid_validity)return null;
   const raw=await imap.message(m.uid,MAX_MESSAGE);return raw?parseMail(raw):null;
  }finally{await imap.logout();}
 }finally{try{socket.close();}catch{/* Closed. */}}
}

/** Supported documents only; small images are usually signature logos. */
function attachmentsOf(list:MimeAttachment[]):NewSource[]{
 const out:NewSource[]=[];
 for(const a of list){
  try{
   const bytes=a.bytes.slice().buffer as ArrayBuffer,mime=detectFile(new Uint8Array(bytes),a.filename);
   if(mime.startsWith('image/')&&bytes.byteLength<40*1024)continue;
   out.push({name:a.filename,bytes,role:'instruction',mime});
  }catch{/* Unsupported file type. */}
 }
 return out;
}

export async function mailThreads(){
 const {results}=await db().prepare("SELECT t.id,t.tag,t.record_id,t.kind,t.subject,t.customer,t.rounds,t.state,t.note,t.created_at,t.updated_at,(SELECT state FROM mail_outbox o WHERE o.thread_id=t.id ORDER BY created_at DESC LIMIT 1) AS last_send FROM mail_threads t ORDER BY t.updated_at DESC LIMIT 50").all<{id:string;tag:string;record_id:string;subject:string;customer:string;rounds:number;state:string;note:string|null;created_at:string;updated_at:string;last_send:string|null}>();
 return results.map(t=>({id:t.id,tag:t.tag,kind:(t as {kind?:string}).kind||'bl',recordId:t.record_id,subject:t.subject,customer:t.customer,rounds:t.rounds,state:t.state,note:t.note,lastSend:t.last_send,createdAt:t.created_at,updatedAt:t.updated_at}));
}

/** Thread and reply plumbing for pre-alert/VGM conversations; the B/L functions above are not used. */
function operationContext(config:IntakeConfig,deps:IntakeDeps,m:Message|null,text:string,files:NewSource[],thread:Thread|null,sender:string):OpsContext{
 const send=async(t:OpThread,round:number,body:string,state:string,note:string)=>{
  const full=(await db().prepare('SELECT * FROM mail_threads WHERE id=?').bind(t.id).first<Thread>())!;
  const domain=config.address.split('@')[1],messageId=`<${full.tag.toLowerCase()}.${round}.${randomToken().slice(0,16)}@${domain}>`;
  const base=full.subject.replace(/\s*\[CBI-[0-9A-F]{6}\]/gi,'').trim()||'Pre-alert';
  const subject=(/^(re|ynt|yanıt|aw|sv):/i.test(base)?base:'Re: '+base)+' ['+full.tag+']';
  const references=JSON.parse(full.message_ids) as string[],recipients={to:[full.customer],cc:JSON.parse(full.cc) as string[]};
  const data=buildReply({from:config.address,fromName:config.fromName,to:recipients.to,cc:recipients.cc,subject,messageId,inReplyTo:m?.message_id||references.at(-1)||'',references,text:body});
  const id=crypto.randomUUID(),now=new Date().toISOString();
  const inserted=await db().prepare("INSERT OR IGNORE INTO mail_outbox(id,thread_id,round,message_id,recipients,subject,body,state,created_at) VALUES(?,?,?,?,?,?,?,'queued',?)").bind(id,full.id,round,messageId,JSON.stringify(recipients),subject,data,now).run();
  if(!inserted.meta.changes)return;
  await db().prepare('UPDATE mail_threads SET rounds=MAX(rounds,?),state=?,note=?,message_ids=?,updated_at=? WHERE id=?').bind(round,state,note,JSON.stringify([...references,messageId]),now,full.id).run();
  await deliver(config,deps,id);
 };
 return {
  owner:config.owner,subject:m?.subject||'',text,thread:thread as OpThread|null,reference:positionReference,
  files:files.map(f=>({name:f.name,bytes:f.bytes,mime:f.mime||''})),
  open:async(kind)=>{
   const id=crypto.randomUUID(),now=new Date().toISOString(),tag='CBI-'+id.replace(/-/g,'').slice(0,6).toUpperCase();
   const cc=m?[...new Set([...addresses(m.to_addresses),...addresses(m.cc_addresses)])].filter(a=>a!==config.address&&a!==sender&&senderAllowed(a,config.allowed)).slice(0,10):[];
   await db().prepare("INSERT INTO mail_threads(id,tag,record_id,owner,subject,customer,cc,message_ids,rounds,state,kind,created_at,updated_at) VALUES(?,?,'',?,?,?,?,?,0,'processing',?,?,?)").bind(id,tag,config.owner,(m?.subject||'').slice(0,300),sender,JSON.stringify(cc),JSON.stringify(m?.message_id?[m.message_id]:[]),kind,now,now).run();
   return (await db().prepare('SELECT * FROM mail_threads WHERE id=?').bind(id).first<OpThread>())!;
  },
  ask:(t,body)=>send(t,t.rounds+1,body,'waiting_customer','Firma yetkilisine soru gönderildi.'),
  notify:(t,body)=>send(t,0,body,'complete','Tamamlandı; göndericiye bildirim gönderildi.'),
  setThread,
 };
}
