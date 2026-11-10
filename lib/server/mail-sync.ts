import {connect} from 'cloudflare:sockets';
import {AppError,db,runtime,randomToken} from '@/lib/server/runtime';
import {openImap,ImapError,type ImapConnection} from '@/lib/mail/imap';

/**
 * Phase 1 of the mail plan: connect the automation mailbox and observe silently.
 * Read-only by construction (EXAMINE + BODY.PEEK); no mail is ever sent from here.
 */
const MAILBOX='INBOX',BATCH=100,LEASE_MS=120000,DEADLINE_MS=90000,BASELINE_DAYS=30;
const MESSAGES:Record<string,string>={
 auth_failed:'E-posta sunucusu kullanıcı adı veya şifreyi kabul etmedi.',
 connection_closed:'E-posta sunucusu bağlantıyı kapattı.',
 timeout:'E-posta sunucusu zamanında yanıt vermedi.',
 protocol_error:'E-posta sunucusundan beklenmeyen yanıt alındı.',
 command_failed:'E-posta sunucusu okuma isteğini reddetti.',
 connection_failed:'E-posta sunucusuna bağlanılamadı.',
};
type Socket=ImapConnection&{opened?:Promise<unknown>;close():unknown};
export type MailConfig={host:string;port:number;user:string;password:string};
export type MailSyncResult={status:'complete'|'disabled'|'busy'|'waiting'|'failed';imported?:number;remaining?:boolean;message?:string};

export function mailConfig():MailConfig|null{
 const env=runtime();
 if(env.MAIL_SYNC_ENABLED!=='true'||!env.MAIL_IMAP_HOST||!env.MAIL_IMAP_USER||!env.MAIL_IMAP_PASSWORD)return null;
 const port=Number(env.MAIL_IMAP_PORT||993);
 if(!/^[a-z0-9.-]+$/i.test(env.MAIL_IMAP_HOST)||!Number.isInteger(port)||port<1||port>65535)return null;
 return {host:env.MAIL_IMAP_HOST,port,user:env.MAIL_IMAP_USER,password:env.MAIL_IMAP_PASSWORD};
}

export function requireMailSyncKey(req:Request){
 const expected=runtime().MAIL_SYNC_KEY,actual=req.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]||'';
 if(!expected||expected.length<32)throw new AppError('E-posta takibi yapılandırılmadı.',503);
 let mismatch=actual.length^expected.length;
 for(let i=0;i<expected.length;i++)mismatch|=(actual.charCodeAt(i)||0)^expected.charCodeAt(i);
 if(mismatch)throw new AppError('Yetkisiz işlem.',401);
}

function openSocket(config:MailConfig):Socket{return connect({hostname:config.host,port:config.port},{secureTransport:'on',allowHalfOpen:false}) as unknown as Socket;}
function sinceCriteria(now:number){const d=new Date(now-BASELINE_DAYS*86400000);return 'SINCE '+d.getUTCDate()+'-'+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]+'-'+d.getUTCFullYear();}

/** Cron calls honour the backoff; a user's "check now" only skips the wait, never the lease. */
export async function runMailSync({manual=false}:{manual?:boolean}={},open:(c:MailConfig)=>Socket=openSocket):Promise<MailSyncResult>{
 const config=mailConfig();if(!config)return {status:'disabled'};
 const now=Date.now(),lease=randomToken();
 const claimed=await db().prepare('UPDATE mail_sync_state SET lease=?,lease_until=?,last_attempt_at=? WHERE mailbox=? AND lease_until<? AND (?=1 OR next_at<=?)').bind(lease,now+LEASE_MS,new Date(now).toISOString(),MAILBOX,now,manual?1:0,now).run();
 if(!claimed.meta.changes){
  const state=await db().prepare('SELECT lease_until FROM mail_sync_state WHERE mailbox=?').bind(MAILBOX).first<{lease_until:number}>();
  return {status:state&&state.lease_until>=now?'busy':'waiting'};
 }
 const state=(await db().prepare('SELECT uid_validity,last_uid,failures FROM mail_sync_state WHERE mailbox=?').bind(MAILBOX).first<{uid_validity:number|null;last_uid:number;failures:number}>())!;
 let socket:Socket|undefined,timer:ReturnType<typeof setTimeout>|undefined;
 try{
  socket=open(config);
  const work=(async()=>{
   if(socket!.opened)await socket!.opened.catch(()=>{throw new ImapError('connection_closed','connection_failed');});
   const imap=await openImap(socket!,{user:config.user,password:config.password});
   try{
    const box=await imap.examine(MAILBOX),reset=state.uid_validity!==box.uidValidity;
    const uids=(reset?await imap.search(sinceCriteria(now)):await imap.search('UID '+(state.last_uid+1)+':*')).filter(uid=>reset||uid>state.last_uid);
    const batch=uids.slice(0,BATCH),headers=await imap.headers(batch),syncedAt=new Date().toISOString();
    const inserts=headers.map(m=>db().prepare('INSERT OR IGNORE INTO mail_messages(mailbox,uid_validity,uid,message_id,from_name,from_address,to_addresses,cc_addresses,subject,sent_at,received_at,size,attachments,in_reply_to,synced_at,reply_to,references_header,automated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
     .bind(MAILBOX,box.uidValidity,m.uid,m.messageId||null,m.fromName,m.fromAddress,m.to,m.cc,m.subject,m.sentAt||null,m.internalDate||syncedAt,m.size,m.attachments,m.inReplyTo||null,syncedAt,m.replyTo,m.references,m.automated?1:0));
    // An empty first look starts from the current end of the mailbox, never from older history.
    const lastUid=batch.length?batch[batch.length-1]:reset?Math.max(0,box.uidNext-1):state.last_uid;
    await db().batch([...inserts,db().prepare("UPDATE mail_sync_state SET uid_validity=?,last_uid=?,failures=0,next_at=0,last_success_at=?,last_status='complete',message=NULL,lease=NULL,lease_until=0 WHERE mailbox=? AND lease=?").bind(box.uidValidity,lastUid,syncedAt,MAILBOX,lease)]);
    return {status:'complete' as const,imported:headers.length,remaining:uids.length>batch.length};
   }finally{await imap.logout();}
  })();
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new ImapError('timeout')),DEADLINE_MS);});
  return await Promise.race([work,timeout]);
 }catch(error){
  const code=error instanceof ImapError?(error.message==='connection_failed'?'connection_failed':error.code):'connection_failed';
  // Repeated login failures can lock the account: back off 5, 10, 20 ... up to 60 minutes.
  const failures=state.failures+1,wait=Math.min(60,5*2**(failures-1))*60000;
  await db().prepare("UPDATE mail_sync_state SET failures=?,next_at=?,last_status='failed',message=?,lease=NULL,lease_until=0 WHERE mailbox=? AND lease=?").bind(failures,Date.now()+wait,code,MAILBOX,lease).run();
  console.warn(JSON.stringify({event:'mail-sync',status:'failed',code,failures}));
  return {status:'failed',message:MESSAGES[code]||MESSAGES.connection_failed};
 }finally{
  if(timer)clearTimeout(timer);
  try{socket?.close();}catch{/* Already closed. */}
 }
}

type Row={uid:number;from_name:string;from_address:string;subject:string;received_at:string;attachments:number;to_addresses:string;cc_addresses:string;intake_state:string;intake_note:string|null};
export async function mailOverview(){
 const config=mailConfig(),env=runtime();
 const state=await db().prepare('SELECT last_attempt_at,last_success_at,last_status,message,failures,next_at FROM mail_sync_state WHERE mailbox=?').bind(MAILBOX).first<{last_attempt_at:string|null;last_success_at:string|null;last_status:string;message:string|null;failures:number;next_at:number}>();
 const since=new Date(Date.now()-14*86400000).toISOString();
 const [recent,days,totals]=await Promise.all([
  db().prepare('SELECT uid,from_name,from_address,subject,received_at,attachments,to_addresses,cc_addresses,intake_state,intake_note FROM mail_messages WHERE mailbox=? ORDER BY received_at DESC LIMIT 50').bind(MAILBOX).all<Row>(),
  // Turkey has no DST; +3 hours gives the local calendar day.
  db().prepare("SELECT substr(datetime(received_at,'+3 hours'),1,10) AS day,COUNT(*) AS count,SUM(attachments>0) AS with_attachments FROM mail_messages WHERE mailbox=? AND received_at>=? GROUP BY day ORDER BY day DESC").bind(MAILBOX,since).all<{day:string;count:number;with_attachments:number}>(),
  db().prepare('SELECT COUNT(*) AS total,COUNT(DISTINCT from_address) AS senders,MIN(received_at) AS first FROM mail_messages WHERE mailbox=?').bind(MAILBOX).first<{total:number;senders:number;first:string|null}>(),
 ]);
 return {
  enabled:Boolean(config),address:config?.user||env.MAIL_IMAP_USER||'',mailbox:MAILBOX,
  sync:state?{lastAttemptAt:state.last_attempt_at,lastSuccessAt:state.last_success_at,status:state.last_status,message:state.message?MESSAGES[state.message]||MESSAGES.connection_failed:null,retryAt:state.next_at>Date.now()?new Date(state.next_at).toISOString():null}:null,
  totals:{messages:totals?.total||0,senders:totals?.senders||0,since:totals?.first||null},
  days:days.results.map(d=>({day:d.day,count:d.count,withAttachments:d.with_attachments||0})),
  recent:recent.results.map(r=>({uid:r.uid,fromName:r.from_name,fromAddress:r.from_address,subject:r.subject,receivedAt:r.received_at,attachments:r.attachments,to:r.to_addresses,cc:r.cc_addresses,intake:r.intake_state,intakeNote:r.intake_note})),
 };
}
