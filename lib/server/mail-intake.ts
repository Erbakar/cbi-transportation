import {connect} from 'cloudflare:sockets';
import {AppError,db,runtime,randomToken} from '@/lib/server/runtime';
import {openImap,parseAddress,type ImapConnection} from '@/lib/mail/imap';
import {parseMail,replyText,type MimeAttachment} from '@/lib/mail/mime';
import {sendSmtp,buildReply,validAddress,SmtpError,type SmtpSocket} from '@/lib/mail/smtp';
import {customerRequests,requestText} from '@/lib/mail/requests';
import {createRecord,type NewSource} from '@/lib/server/record-create';
import {checkRecord} from '@/lib/server/record-check';
import {detectFile,documentsFor,owned} from '@/lib/server/records';
import {mailConfig} from '@/lib/server/mail-sync';

/**
 * Bill-of-lading e-mail loop. A new instruction with attachments from an allowed
 * sender becomes a record; missing customer information is requested by reply;
 * a reply in the same thread adds its text and files to the SAME record and the
 * check runs again. After MAX_ROUNDS, or for anything only CBI can resolve, the
 * thread goes to staff. Unknown SMTP outcomes are never re-sent automatically.
 */
export const MAX_ROUNDS=3;
const MAILBOX='INBOX',MAX_MESSAGE=25*1024*1024,MAX_ATTEMPTS=3,HOURLY_LIMIT=30,LEASE_MS=10*60000;
type Message={uid:number;uid_validity:number;message_id:string|null;from_address:string;reply_to:string;to_addresses:string;cc_addresses:string;subject:string;in_reply_to:string|null;references_header:string;automated:number;received_at:string;intake_attempts:number;attachments:number};
type Thread={id:string;tag:string;record_id:string;owner:string;subject:string;customer:string;cc:string;message_ids:string;rounds:number;state:string};
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
    console.warn(JSON.stringify({event:'mail-intake',status:'error',uid:message.uid,attempts}));
   }
   processed++;
  }
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
 if(thread&&thread.state!=='waiting_customer'){
  await addMessageIds(thread.id,m.message_id?[m.message_id]:[]);
  return {state:'ignored',note:thread.state==='complete'?'Kayıt zaten hazır; ek bilgi operasyon ekibine bırakıldı.':'Bu konu operasyon ekibinde.',threadId:thread.id};
 }
 if(!thread&&!m.attachments)return {state:'ignored',note:'Ek yok; talimat olarak işlenmedi.'};
 const parsed=await fetchMessage(config,deps,m);if(!parsed)return {state:'ignored',note:'E-posta sunucuda bulunamadı.'};
 const files=attachmentsOf(parsed.attachments);
 if(!thread){
  if(!files.length)return {state:'ignored',note:'Desteklenen ek (PDF, Word, Excel, görsel) yok.'};
  if(files.length>5)return {state:'ignored',note:'5’ten fazla ek var; operasyon ekibi elle yüklemeli.'};
  const reference=(m.subject+'\n'+parsed.text).match(/\b(?:YK\.)?S\.E\.\d{2}\.\d{2}\.\d{5}\b/i)?.[0]||'';
  const {row,duplicate}=await createRecord(config.owner,{sources:files,reference});
  // A retry after a failed check finds its own record again; continue only if no conversation exists yet.
  if(duplicate){
   const existing=await db().prepare('SELECT * FROM mail_threads WHERE record_id=? ORDER BY created_at LIMIT 1').bind(row.id).first<Thread>();
   // Same message retried after its check failed (no reply sent yet): run the check again.
   if(existing&&existing.rounds===0&&existing.state==='waiting_customer'&&m.message_id&&(JSON.parse(existing.message_ids) as string[]).includes(m.message_id))return {state:'done',note:await decide(config,deps,existing,m),threadId:existing.id};
   if(existing)return {state:'ignored',note:'Aynı belgeler zaten kayıtlı.',threadId:existing.id};
  }
  const id=crypto.randomUUID(),now=new Date().toISOString(),newTag='CBI-'+id.replace(/-/g,'').slice(0,6).toUpperCase();
  const cc=[...new Set([...addresses(m.to_addresses),...addresses(m.cc_addresses)])].filter(a=>a!==config.address&&a!==sender&&senderAllowed(a,config.allowed)).slice(0,10);
  await db().prepare("INSERT INTO mail_threads(id,tag,record_id,owner,subject,customer,cc,message_ids,rounds,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,0,'waiting_customer',?,?)").bind(id,newTag,row.id,config.owner,m.subject.slice(0,300),sender,JSON.stringify(cc),JSON.stringify(m.message_id?[m.message_id]:[]),now,now).run();
  thread=(await db().prepare('SELECT * FROM mail_threads WHERE id=?').bind(id).first<Thread>())!;
  return {state:'done',note:await decide(config,deps,thread,m),threadId:thread.id};
 }
 // Reply: the new text and files are added to the same record, operator edits are kept.
 await addMessageIds(thread.id,m.message_id?[m.message_id]:[]);
 const record=await owned(thread.record_id,thread.owner);
 const previous=await Promise.all((await documentsFor(record)).map(async d=>{const object=await runtime().BUCKET.get(d.object_key);if(!object)throw new AppError('Kayıtlı belge okunamadı.',503);return {name:d.filename,bytes:await object.arrayBuffer(),role:d.role as NewSource['role'],mime:d.mime};}));
 const text=replyText(parsed.text).slice(0,20000),added:NewSource[]=[...files];
 if(text.replace(/\s/g,'').length>=3)added.push({name:`eposta-yaniti-${thread.rounds}-${m.uid}.txt`,bytes:new TextEncoder().encode(`E-posta yanıtı / e-mail reply\nGönderen / from: ${sender}\nTarih / date: ${m.received_at}\nKonu / subject: ${m.subject}\n\n${text}`).buffer as ArrayBuffer,role:'instruction',mime:'text/plain'});
 if(!added.length)return {state:'ignored',note:'Yanıtta yeni bilgi veya ek yok.',threadId:thread.id};
 if(previous.length+added.length>5){await setThread(thread.id,'staff','Belge sayısı 5’i aşıyor; operasyon ekibi tamamlamalı.');return {state:'done',note:'Belge sınırı; operasyon ekibine devredildi.',threadId:thread.id};}
 try{await createRecord(thread.owner,{sources:[...previous,...added],recordId:thread.record_id,keepManual:true});}
 catch(error){if(error instanceof AppError&&error.status===409){await setThread(thread.id,'staff',error.message);return {state:'done',note:error.message,threadId:thread.id};}throw error;}
 return {state:'done',note:await decide(config,deps,thread,m),threadId:thread.id};
}

/** Runs the check and either finishes, hands over to staff, or asks the customer again. */
async function decide(config:IntakeConfig,deps:IntakeDeps,thread:Thread,m:Message){
 let record:{status:string;issues?:string[]|null};
 try{record=await checkRecord(thread.owner,thread.record_id,'check') as unknown as typeof record;}
 catch(error){if(error instanceof AppError&&error.status===503)throw error;record={status:'blocked',issues:[error instanceof Error?error.message:'Kontrol tamamlanamadı.']};}
 // A record already sent to the platforms (e.g. the same documents uploaded before) is never re-processed.
 if(record.status==='complete'){await setThread(thread.id,'complete','Bu talimat daha önce işlenmiş; konşimento platformlara aktarılmış.');return 'Talimat daha önce işlenmiş.';}
 if(record.status==='ready'){await setThread(thread.id,'complete','Eksik bilgi kalmadı; konşimento hazır.');return 'Kayıt hazır.';}
 if(record.status!=='missing'){await setThread(thread.id,'staff','Talimat otomatik işlenemedi'+((record.issues||[]).length?': '+(record.issues||[]).join(' ').slice(0,200):` (kayıt durumu: ${record.status}).`));return 'Operasyon ekibine devredildi.';}
 const {ask,staff}=customerRequests(record.issues||[]);
 if(!ask.length){await setThread(thread.id,'staff','Kalan eksikler operasyon ekibinin: '+staff.join(' ').slice(0,200));return 'Müşteriden istenecek bilgi yok; operasyon ekibine devredildi.';}
 if(thread.rounds>=MAX_ROUNDS){await setThread(thread.id,'staff',`${MAX_ROUNDS} yanıttan sonra hâlâ eksik bilgi var.`);return 'Tur sınırı; operasyon ekibine devredildi.';}
 const round=thread.rounds+1,domain=config.address.split('@')[1],messageId=`<${thread.tag.toLowerCase()}.${round}.${randomToken().slice(0,16)}@${domain}>`;
 const base=thread.subject.replace(/\s*\[CBI-[0-9A-F]{6}\]/gi,'').trim()||'Konşimento talimatı';
 const subject=(/^(re|ynt|yanıt|aw|sv):/i.test(base)?base:'Re: '+base)+' ['+thread.tag+']';
 const body=requestText({tag:thread.tag,round,ask,maxRounds:MAX_ROUNDS}),recipients={to:[thread.customer],cc:JSON.parse(thread.cc) as string[]};
 const references=JSON.parse(thread.message_ids) as string[];
 const id=crypto.randomUUID(),now=new Date().toISOString();
 const data=buildReply({from:config.address,fromName:config.fromName,to:recipients.to,cc:recipients.cc,subject,messageId,inReplyTo:m.message_id||references.at(-1)||'',references,text:body});
 await db().batch([
  db().prepare("INSERT INTO mail_outbox(id,thread_id,round,message_id,recipients,subject,body,state,created_at) VALUES(?,?,?,?,?,?,?,'queued',?)").bind(id,thread.id,round,messageId,JSON.stringify(recipients),subject,data,now),
  db().prepare("UPDATE mail_threads SET rounds=?,state='waiting_customer',note=?,message_ids=?,updated_at=? WHERE id=?").bind(round,`${ask.length} bilgi istendi (${round}. tur).`,JSON.stringify([...references,messageId]),now,thread.id),
 ]);
 await deliver(config,deps,id);
 return `${ask.length} eksik bilgi için yanıt gönderildi (${round}. tur).`;
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
 const {results}=await db().prepare("SELECT t.id,t.tag,t.record_id,t.subject,t.customer,t.rounds,t.state,t.note,t.created_at,t.updated_at,(SELECT state FROM mail_outbox o WHERE o.thread_id=t.id ORDER BY round DESC LIMIT 1) AS last_send FROM mail_threads t ORDER BY t.updated_at DESC LIMIT 50").all<{id:string;tag:string;record_id:string;subject:string;customer:string;rounds:number;state:string;note:string|null;created_at:string;updated_at:string;last_send:string|null}>();
 return results.map(t=>({id:t.id,tag:t.tag,recordId:t.record_id,subject:t.subject,customer:t.customer,rounds:t.rounds,state:t.state,note:t.note,lastSend:t.last_send,createdAt:t.created_at,updatedAt:t.updated_at}));
}
