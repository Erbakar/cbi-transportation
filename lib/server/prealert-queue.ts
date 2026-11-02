import {AppError,db,runtime} from './runtime';
import {readTmaxxArchiveFile} from './tmaxx-workspace';
import {syncPrealert} from './prealert-upload';

const minute=60_000;
const queuedMessage='PDF güvenle kaydedildi. T-MAXX arşivi erişilebilir olduğunda otomatik aktarılacak; bu sayfayı kapatabilirsiniz.';
const waitingMessage='T-MAXX bağlantısı bekleniyor. PDF korunuyor ve aktarım otomatik yeniden kontrol edilecek.';
const reviewMessage='Önceki gönderimin sonucu belirsiz. Mükerrer kayıt oluşturmamak için yeniden yüklenmiyor; mevcut arşiv kaydı otomatik kontrol ediliyor.';
type Job={document_id:string;owner:string;attempts:number;state:string};

export function queueDelay(attempts:number){return Math.min(30,5*2**Math.min(Math.max(attempts-1,0),3))*minute;}
export function requirePrealertQueueKey(req:Request){
 const expected=runtime().PREALERT_QUEUE_KEY,actual=req.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]||'';
 if(!expected||expected.length<32)throw new AppError('Aktarım kuyruğu yapılandırılmadı.',503);
 let mismatch=actual.length^expected.length;
 for(let i=0;i<expected.length;i++)mismatch|=(actual.charCodeAt(i)||0)^expected.charCodeAt(i);
 if(mismatch)throw new AppError('Yetkisiz işlem.',401);
}
export async function enqueuePrealert(id:string,owner:string){
 const doc=await db().prepare('SELECT state,remote_id FROM prealert_uploads WHERE id=? AND owner=?').bind(id,owner).first<{state:string;remote_id:number|null}>();
 if(!doc)throw new AppError('Pre-alert bulunamadı.',404);
 if(doc.state==='synced')return {status:'synced',remoteId:doc.remote_id};
 await db().prepare("INSERT OR IGNORE INTO prealert_queue(document_id,owner,updated_at) VALUES(?,?,?)").bind(id,owner,new Date().toISOString()).run();
 // User clicks never break an active lease or bypass the shared outage backoff.
 await db().prepare("UPDATE prealert_queue SET next_at=0,updated_at=? WHERE document_id=? AND owner=? AND state<>'processing'").bind(new Date().toISOString(),id,owner).run();
 // Publish only after the PDF and outbox row are durable. A failed notification
 // leaves the existing cron recovery path intact; it never fails the upload.
 const env=runtime();
 if(env.PREALERT_QUEUE_ENABLED==='true'&&env.PREALERT_WAKEUPS){
  try{await env.PREALERT_WAKEUPS.send({documentId:id,enqueuedAt:Date.now()});}
  catch{console.warn(JSON.stringify({event:'prealert-wakeup',status:'cron-fallback',documentId:id}));}
 }
 return {status:'queued',message:queuedMessage};
}
async function uncertain(id:string){
 const steps=(await db().prepare("SELECT step,status,result FROM prealert_upload_steps WHERE document_id=? AND step IN ('upload','link')").bind(id).all<{step:string;status:string;result:string|null}>()).results;
 return steps.some(row=>{
  if(row.status==='complete'&&row.result)return false;
  try{if(row.step==='upload'&&row.status==='rejected'&&row.result&&JSON.parse(row.result).failure?.retryable===true)return false;}catch{}
  return true;
 });
}
async function archiveReadable(owner:string){
 // A previously verified file exercises Mongo, unlike login or document metadata.
 // No hardcoded customer position and no legacy getList dependency.
 const probes=(await db().prepare("SELECT position_reference,remote_id FROM prealert_uploads WHERE owner=? AND state='synced' AND remote_id IS NOT NULL ORDER BY size ASC LIMIT 3").bind(owner).all<{position_reference:string;remote_id:number}>()).results;
 for(const probe of probes){
  try{await readTmaxxArchiveFile(owner,probe.position_reference,probe.remote_id);return;}
  catch(error){if(error instanceof AppError&&error.status===404)continue;throw error;}
 }
 // A first-ever archive has no known file to probe. Its single journaled upload
 // is still bounded; any ambiguous response permanently forbids replay.
}
export async function runPrealertQueue(options:{documentId?:string}={}){
 if(runtime().PREALERT_QUEUE_ENABLED!=='true')return {status:'disabled'};
 const started=Date.now(),token=crypto.randomUUID();
 const retryAfter=(due:number)=>Math.max(1,Math.ceil((due-Date.now())/1000));
 if(options.documentId){
  const target=await db().prepare('SELECT d.state,q.next_at FROM prealert_uploads d LEFT JOIN prealert_queue q ON q.document_id=d.id WHERE d.id=?').bind(options.documentId).first<{state:string;next_at:number|null}>();
  // Redelivery of a completed notification is a read-only no-op.
  if(!target||target.state==='synced')return {status:'idle'};
  if(target.next_at&&target.next_at>started)return {status:'waiting',retryAfterSeconds:retryAfter(target.next_at)};
 }
 await db().prepare("UPDATE prealert_queue_control SET last_tick_at=? WHERE id='tmaxx'").bind(started).run();
 const lock=await db().prepare("UPDATE prealert_queue_control SET lease=?,lease_until=? WHERE id='tmaxx' AND lease_until<=? AND next_at<=?").bind(token,started+10*minute,started,started).run();
 if(!lock.meta.changes){
  const control=await db().prepare("SELECT next_at FROM prealert_queue_control WHERE id='tmaxx'").bind().first<{next_at:number}>();
  return {status:'waiting',retryAfterSeconds:control&&control.next_at>started?retryAfter(control.next_at):30};
 }
 let job:Job|null=null,finishedStatus='idle';
 const timings:{probeMs?:number;syncMs?:number}={};
 const guard=async()=>{
  if(Date.now()-started>4*minute)throw new AppError('Aktarım kontrol süresi doldu; sonraki kontrolde devam edilecek.',503);
  const lease=await db().prepare("SELECT id FROM prealert_queue_control WHERE id='tmaxx' AND lease=? AND lease_until>?").bind(token,Date.now()).first();
  if(!lease)throw new AppError('Aktarım başka bir görev tarafından kontrol ediliyor.',409);
 };
 try{
  // Recover a saved PDF even if its HTTP request ended before enqueue completed.
  await db().prepare("INSERT OR IGNORE INTO prealert_queue(document_id,owner,updated_at) SELECT id,owner,updated_at FROM prealert_uploads WHERE state<>'synced'").bind().run();
  job=await db().prepare("SELECT q.document_id,q.owner,q.attempts,q.state FROM prealert_queue q JOIN prealert_uploads d ON d.id=q.document_id AND d.owner=q.owner WHERE q.state<>'complete' AND q.next_at<=?"+(options.documentId?' AND q.document_id=?':'')+" ORDER BY q.next_at,d.created_at LIMIT 1").bind(started,...(options.documentId?[options.documentId]:[])).first<Job>();
  if(!job)return {status:'idle'};
  await db().prepare("UPDATE prealert_queue SET state='processing',attempts=attempts+1,last_attempt_at=?,lease=?,message=NULL,updated_at=? WHERE document_id=?").bind(started,token,new Date().toISOString(),job.document_id).run();
  const doc=await db().prepare('SELECT state FROM prealert_uploads WHERE id=?').bind(job.document_id).first<{state:string}>();
  let synced=doc?.state==='synced',review=false;
  if(!synced){
   const probeStarted=Date.now();await archiveReadable(job.owner);timings.probeMs=Date.now()-probeStarted;
   await guard();
   review=await uncertain(job.document_id);
   const syncStarted=Date.now(),result=await syncPrealert(job.document_id,job.owner,{beforeWrite:guard,readOnly:review});timings.syncMs=Date.now()-syncStarted;
   synced=result.status==='synced';
   review=!synced&&await uncertain(job.document_id);
  }
  finishedStatus=synced?'complete':review?'review':'waiting';
  const next=Date.now()+(review?30*minute:queueDelay(job.attempts+1));
  await db().prepare('UPDATE prealert_queue SET state=?,next_at=?,lease=NULL,message=?,updated_at=? WHERE document_id=? AND lease=?').bind(finishedStatus,synced?0:next,synced?null:review?reviewMessage:waitingMessage,new Date().toISOString(),job.document_id,token).run();
  await db().prepare("UPDATE prealert_queue_control SET failures=0,next_at=0 WHERE id='tmaxx' AND lease=?").bind(token).run();
  return {status:finishedStatus,...(synced?{}:{retryAfterSeconds:retryAfter(next)})};
 }catch{
  // No raw response/PDF/credential is persisted in queue diagnostics.
  finishedStatus='waiting';
  const control=await db().prepare("SELECT failures FROM prealert_queue_control WHERE id='tmaxx' AND lease=?").bind(token).first<{failures:number}>();
  const next=Date.now()+queueDelay((control?.failures||0)+1);
  if(job)await db().prepare("UPDATE prealert_queue SET state='waiting',next_at=?,lease=NULL,message=?,updated_at=? WHERE document_id=? AND lease=?").bind(next,waitingMessage,new Date().toISOString(),job.document_id,token).run();
  await db().prepare("UPDATE prealert_queue_control SET failures=failures+1,next_at=? WHERE id='tmaxx' AND lease=?").bind(next,token).run();
  return {status:'waiting',retryAfterSeconds:retryAfter(next)};
 }finally{
  await db().prepare("UPDATE prealert_queue_control SET lease=NULL,lease_until=0,last_finished_at=?,last_status=? WHERE id='tmaxx' AND lease=?").bind(Date.now(),finishedStatus,token).run();
  if(job)console.log(JSON.stringify({event:'prealert-transfer',documentId:job.document_id,status:finishedStatus,elapsedMs:Date.now()-started,...timings}));
 }
}
