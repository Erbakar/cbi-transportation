import {z} from 'zod';
import {claimCmaHistory,completeCmaHistory,cmaHistoryResult} from './cma-history-store';
import {AppError,db,digest,runtime} from './runtime';
import {ownBooking} from './operation-documents';
import {exportVgm} from './vgm';
import {readCredentials} from './platforms';
import {manualVgmInput,manualVgmPayload,cmaVgmInput,cmaVgmPayload,type CmaVgmPayload,type CmaJobState} from '../operations/cma-vgm';
type Job={id:string;owner:string;booking_id:string|null;payload:string;payload_hash:string;state:CmaJobState;send_authorized:number;lease:string|null;lease_until:number;result:string|null;created_at:string;updated_at:string};
const now=()=>new Date().toISOString();
async function expire(owner:string){await db().prepare("UPDATE cma_vgm_jobs SET state=CASE WHEN state='submitting' THEN 'unknown' ELSE 'blocked' END,result=?,updated_at=? WHERE owner=? AND state IN ('preparing','submitting') AND lease_until<?").bind('Bağlantı süresi doldu. Sonucu doğrulamadan yeniden gönderim yapılmaz.',now(),owner,Date.now()).run();}
export async function cmaJobs(id:string|null,owner:string){
 if(id)await ownBooking(id,owner);await expire(owner);
 const jobs=(await db().prepare('SELECT * FROM cma_vgm_jobs WHERE owner=? AND deleted_at IS NULL AND (booking_id=? OR ? IS NULL) ORDER BY created_at DESC LIMIT 100').bind(owner,id,id).all<Job>()).results;
 const agent=await db().prepare('SELECT heartbeat FROM cma_vgm_agents WHERE owner=?').bind(owner).first<{heartbeat:number}>();
 return {enabled:runtime().CMA_SUBMISSION_ENABLED==='true',agentOnline:!!agent&&Date.now()-agent.heartbeat<90000,credentialsSaved:!!await readCredentials(owner,'cma-cgm'),jobs:jobs.map(j=>({id:j.id,bookingId:j.booking_id,state:j.state,payload:JSON.parse(j.payload) as CmaVgmPayload,result:j.result,createdAt:j.created_at,updatedAt:j.updated_at}))};
}
async function fresh(job:Job){
 const p=JSON.parse(job.payload) as CmaVgmPayload;
 if(job.booking_id===null){
  if(!('source' in p)||p.source!=='manual')throw new AppError('VGM kaynağı doğrulanamadı.',409);
  const expected=manualVgmPayload({carrierBooking:p.booking,container:p.container,vgmKg:p.vgmKg,signature:p.signature,method:p.method,certificate:p.certificate,confirmed:true});
  if(JSON.stringify(p)!==JSON.stringify(expected)||await digest(JSON.stringify({id:null,payload:p}))!==job.payload_hash)throw new AppError('VGM bilgileri değişti.',409);
  return;
 }
 if('source' in p)throw new AppError('VGM onayı doğrulanamadı.',409);
 const reviewed=await exportVgm(job.booking_id,job.owner);
 const expected=cmaVgmPayload(reviewed,{approvalId:p.approvalId,carrierBooking:p.booking,method:p.method,signature:p.signature,certificate:p.certificate,confirmed:true});
 if(JSON.stringify(p)!==JSON.stringify(expected))throw new AppError('VGM onayı veya belge değişti. Yeni kontrol gerekli.',409);
}
export async function prepareCmaJob(id:string|null,owner:string,raw:unknown){
 if(id)await ownBooking(id,owner);
 const input=(id?cmaVgmInput:manualVgmInput).safeParse(raw);if(!input.success)throw new AppError(input.error.issues[0].message,422);
 if(!await readCredentials(owner,'cma-cgm'))throw new AppError('Önce CMA şirket hesabını kaydedin.',409);
 const env=runtime();if(!env.CMA_AGENT_KEY||env.CMA_AGENT_OWNER!==owner)throw new AppError('Bu hesap için arka plan CMA bağlantısı kurulmamış.',409);
 let payload:CmaVgmPayload;try{payload=id?cmaVgmPayload(await exportVgm(id,owner),input.data):manualVgmPayload(input.data);}catch(e){throw new AppError((e as Error).message,409);}
 const hash=await digest(JSON.stringify({id,payload}));
 // Serialise a carrier booking/container across all local booking files, including uncertain outcomes.
 const conflict=await db().prepare("SELECT id FROM cma_vgm_jobs WHERE owner=? AND json_extract(payload,'$.booking')=? AND json_extract(payload,'$.container')=? AND payload_hash<>? AND deleted_at IS NULL LIMIT 1").bind(owner,payload.booking,payload.container,hash).first();
 if(conflict)throw new AppError('Bu booking ve konteyner için zaten bir kayıt var. Mevcut kaydı kontrol edin; bilgileri değiştirmek için önce gönderilmemiş kaydı silin.',409);
 await db().prepare("INSERT INTO cma_vgm_jobs(id,owner,booking_id,payload,payload_hash,state,created_at,updated_at) VALUES(?,?,?,?,?,'queued',?,?) ON CONFLICT(owner,payload_hash) DO UPDATE SET state='queued',deleted_at=NULL,send_authorized=0,lease=NULL,lease_until=0,result=NULL,updated_at=excluded.updated_at WHERE cma_vgm_jobs.state='blocked'").bind(crypto.randomUUID(),owner,id,JSON.stringify(payload),hash,now(),now()).run();
 return cmaJobs(id,owner);
}
export async function retryCmaJob(owner:string,jobId:string){
 const j=await db().prepare('SELECT * FROM cma_vgm_jobs WHERE id=? AND owner=? AND booking_id IS NULL AND deleted_at IS NULL').bind(jobId,owner).first<Job>();
 if(!j||j.state!=='blocked'||j.send_authorized)throw new AppError('Yalnızca gönderimi başlamamış kayıt yeniden kontrol edilebilir.',409);
 await fresh(j);
 const p=JSON.parse(j.payload) as CmaVgmPayload;
 const active=await db().prepare("SELECT id FROM cma_vgm_jobs WHERE owner=? AND json_extract(payload,'$.booking')=? AND json_extract(payload,'$.container')=? AND state<>'blocked' LIMIT 1").bind(owner,p.booking,p.container).first();
 if(active)throw new AppError('Bu konteyner için başka bir işlem sürüyor. Önce sonucunu kontrol edin.',409);
 await db().prepare("UPDATE cma_vgm_jobs SET state='queued',result=NULL,lease=NULL,lease_until=0,updated_at=? WHERE id=? AND owner=? AND state='blocked' AND deleted_at IS NULL AND send_authorized=0").bind(now(),jobId,owner).run();
 return cmaJobs(null,owner);
}
export async function deleteCmaJob(id:string|null,owner:string,jobId:string){
 if(id)await ownBooking(id,owner);
 const result=await db().prepare("UPDATE cma_vgm_jobs SET deleted_at=?,state='blocked',updated_at=? WHERE id=? AND owner=? AND booking_id IS ? AND deleted_at IS NULL AND send_authorized=0 AND state IN ('queued','blocked','prepared')").bind(now(),now(),jobId,owner,id).run();
 if(!result.meta.changes)throw new AppError('Bu kayıt silinemiyor. İşlem sürüyor, gönderim başlatılmış veya kayıt artık mevcut değil. Durumunu yenileyin.',409);
 return cmaJobs(id,owner);
}
export async function submitCmaJob(id:string|null,owner:string,jobId:string){
 if(id)await ownBooking(id,owner);
 if(runtime().CMA_SUBMISSION_ENABLED!=='true')throw new AppError('CMA gönderimi henüz etkinleştirilmedi. Ön kontrol ve bağlantı doğrulaması gerekli.',409);
 const j=await db().prepare('SELECT * FROM cma_vgm_jobs WHERE id=? AND owner=? AND booking_id IS ?').bind(jobId,owner,id).first<Job>();
 if(!j||j.state!=='prepared')throw new AppError('Ön kontrolü tamamlanmış gönderim gerekli.',409);
 await fresh(j);
 const r=await db().prepare("UPDATE cma_vgm_jobs SET state='submit_queued',send_authorized=1,updated_at=? WHERE id=? AND owner=? AND state='prepared'").bind(now(),jobId,owner).run();
 if(!r.meta.changes)throw new AppError('Gönderim durumu değişti.',409);
 return cmaJobs(id,owner);
}
export async function cmaAgentOwner(req:Request){
 const env=runtime();if(!env.CMA_AGENT_KEY||!/^[a-f0-9]{64}$/.test(env.CMA_AGENT_KEY)||!env.CMA_AGENT_OWNER)throw new AppError('Bağlantı kurulmamış.',503);
 // Compare fixed-size digests; no browser cookies or general application session accepted.
 const actual=await digest(req.headers.get('authorization')||''),expected=await digest('Bearer '+env.CMA_AGENT_KEY);
 let difference=0;for(let i=0;i<actual.length;i++)difference|=actual.charCodeAt(i)^expected.charCodeAt(i);
 if(difference)throw new AppError('Yetkisiz bağlantı.',401);return env.CMA_AGENT_OWNER;
}
const agentInput=z.discriminatedUnion('action',[
 cmaHistoryResult,
 z.object({action:z.literal('connection-result'),id:z.string().uuid(),connected:z.boolean(),message:z.string().max(500)}).strict(),
 z.object({action:z.literal('next'),version:z.enum(['0.2.0','0.2.1','0.2.2','0.2.3'])}).strict(),
 z.object({action:z.literal('commit'),id:z.string().uuid(),lease:z.string().uuid(),account:z.string().email()}).strict(),
 z.object({action:z.literal('result'),id:z.string().uuid(),lease:z.string().uuid(),state:z.enum(['prepared','submitted','blocked','unknown']),message:z.string().max(500)}).strict(),
]);
export async function runCmaAgent(owner:string,raw:unknown){
 const parsed=agentInput.safeParse(raw);if(!parsed.success)throw new AppError('Bağlantı isteği geçersiz.');const input=parsed.data;
 await expire(owner);
 if(input.action==='history-result')return completeCmaHistory(owner,input);
 if(input.action==='connection-result'){const result=await db().prepare("UPDATE cma_vgm_agents SET check_state=?,check_message=?,checked_at=? WHERE owner=? AND check_id=? AND check_state='checking'").bind(input.connected?'connected':'blocked',input.message,Date.now(),owner,input.id).run();if(!result.meta.changes)throw new AppError('Bağlantı kontrolü değişti.',409);return {ok:true};}
 if(input.action==='next'){
  await db().prepare('INSERT INTO cma_vgm_agents(owner,heartbeat,version) VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET heartbeat=excluded.heartbeat,version=excluded.version').bind(owner,Date.now(),input.version).run();
  const check=await db().prepare("SELECT check_id FROM cma_vgm_agents WHERE owner=? AND check_state='queued'").bind(owner).first<{check_id:string}>();
  if(check){const credentials=await readCredentials(owner,'cma-cgm');if(credentials){const leased=await db().prepare("UPDATE cma_vgm_agents SET check_state='checking',checked_at=? WHERE owner=? AND check_id=? AND check_state='queued'").bind(Date.now(),owner,check.check_id).run();if(leased.meta.changes)return {job:{id:check.check_id,mode:'connect',credentials}};}}
  const active=await db().prepare("SELECT id FROM cma_vgm_jobs WHERE owner=? AND state IN ('preparing','submitting') LIMIT 1").bind(owner).first();if(active)return {job:null};
  const j=await db().prepare("SELECT * FROM cma_vgm_jobs WHERE owner=? AND state IN ('queued','submit_queued') ORDER BY created_at LIMIT 1").bind(owner).first<Job>();if(!j)return {job:input.version!=='0.2.0'?await claimCmaHistory(owner):null};
  if(j.state==='submit_queued'&&(runtime().CMA_SUBMISSION_ENABLED!=='true'||input.version!=='0.2.3'))return {job:null};
  const credentials=await readCredentials(owner,'cma-cgm');if(!credentials)return {job:null};
  try{await fresh(j);}catch{await db().prepare("UPDATE cma_vgm_jobs SET state='blocked',result=?,updated_at=? WHERE id=? AND state=?").bind('Kaynak VGM onayı değişti. Yeni kontrol gerekli.',now(),j.id,j.state).run();return {job:null};}
  const lease=crypto.randomUUID(),mode=j.state==='queued'?'prepare':'submit';
  const r=await db().prepare("UPDATE cma_vgm_jobs SET state='preparing',lease=?,lease_until=?,updated_at=? WHERE id=? AND state=? AND NOT EXISTS(SELECT 1 FROM cma_vgm_jobs WHERE owner=? AND state IN ('preparing','submitting'))").bind(lease,Date.now()+180000,now(),j.id,j.state,owner).run();
  if(!r.meta.changes)return {job:null};
  return {job:{id:j.id,lease,mode,payload:JSON.parse(j.payload),credentials}};
 }
 const j=await db().prepare('SELECT * FROM cma_vgm_jobs WHERE id=? AND owner=? AND lease=?').bind(input.id,owner,input.lease).first<Job>();
 if(!j||j.lease_until<Date.now())throw new AppError('İşlem süresi doldu; tekrar gönderilmez.',409);
 if(input.action==='commit'){
  if(runtime().CMA_SUBMISSION_ENABLED!=='true'||j.state!=='preparing'||j.send_authorized!==1)throw new AppError('Gönderim kapalı.',409);
  const credentials=await readCredentials(owner,'cma-cgm');if(credentials?.username.toLowerCase()!==input.account.toLowerCase())throw new AppError('CMA hesabı eşleşmiyor.',409);
  await fresh(j);
  const result=await db().prepare("UPDATE cma_vgm_jobs SET state='submitting',updated_at=? WHERE id=? AND owner=? AND lease=? AND state='preparing'").bind(now(),j.id,owner,input.lease).run();
  if(!result.meta.changes)throw new AppError('Gönderim zaten başlatıldı.',409);
  return {permitted:true};
 }
 if(j.state==='submitting'&&!['submitted','unknown'].includes(input.state))throw new AppError('Gönderim sonucu belirsiz; tekrar denenemez.',409);
 if(j.state!=='submitting'&&input.state==='submitted')throw new AppError('Gönderim başlatılmadı.',409);
 if(!['preparing','submitting'].includes(j.state))throw new AppError('İşlem tamamlanmış.',409);
 await db().prepare('UPDATE cma_vgm_jobs SET state=?,result=?,updated_at=? WHERE id=? AND owner=? AND lease=? AND state=?').bind(input.state,input.message,now(),j.id,owner,input.lease,j.state).run();
 if(input.state==='unknown')await db().prepare("UPDATE cma_history SET next_attempt=0 WHERE owner=? AND state<>'reading'").bind(owner).run();
 return {ok:true};
}

export async function cmaAgentConnection(owner:string,request=false){
 const env=runtime();const configured=!!env.CMA_AGENT_KEY&&env.CMA_AGENT_OWNER===owner;
 if(request){if(!configured)throw new AppError('CMA arka plan bağlantısı kurulmamış.',409);if(!await readCredentials(owner,'cma-cgm'))throw new AppError('Önce şirket hesabını kaydedin.',409);
 await db().prepare("INSERT INTO cma_vgm_agents(owner,heartbeat,version,check_id,check_state,checked_at) VALUES(?,0,'',?,'queued',?) ON CONFLICT(owner) DO UPDATE SET check_id=excluded.check_id,check_state='queued',check_message=NULL,checked_at=excluded.checked_at WHERE cma_vgm_agents.check_state NOT IN ('queued','checking') OR cma_vgm_agents.check_state IS NULL OR cma_vgm_agents.checked_at<?").bind(owner,crypto.randomUUID(),Date.now(),Date.now()-180000).run();}
 const agent=await db().prepare('SELECT heartbeat,check_state,check_message,checked_at FROM cma_vgm_agents WHERE owner=?').bind(owner).first<{heartbeat:number;check_state:string;check_message:string|null;checked_at:number}>();
 const online=!!agent&&Date.now()-agent.heartbeat<90000;
 return {configured,online,state:agent?.check_state||'not_checked',message:agent?.check_message||'',connected:online&&agent?.check_state==='connected'&&Date.now()-agent.checked_at<120000};
}
