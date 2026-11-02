import {cmaSubmissionEvidence} from '../cma-submission-evidence';
import {z} from 'zod';
import {AppError,db,runtime} from './runtime';
import {readCredentials} from './platforms';
export const cmaHistoryResult=z.object({action:z.literal('history-result'),id:z.string().uuid(),account:z.string().email().optional(),snapshot:z.object({state:z.literal('ready'),rows:z.array(z.array(z.string().max(1000)).length(9)).max(1000),total:z.number().int().min(0).max(1000),complete:z.literal(true)}).strict().optional(),message:z.string().max(500).optional()}).strict();
type Row={snapshot:string|null;checked_at:number|null;state:string;request_id:string|null;lease_until:number;next_attempt:number;message:string|null};
export async function cloudCmaHistory(owner:string,request=false){
 const configured=runtime().CMA_AGENT_OWNER===owner&&!!runtime().CMA_AGENT_KEY;
 if(!configured)throw new AppError('Bu hesap için CMA bağlantısı kurulmamış.',409);
 if(request)await db().prepare("INSERT INTO cma_history(owner) VALUES(?) ON CONFLICT(owner) DO UPDATE SET next_attempt=0 WHERE cma_history.state<>'reading' AND cma_history.next_attempt<?").bind(owner,Date.now()).run();
 const row=await db().prepare('SELECT * FROM cma_history WHERE owner=?').bind(owner).first<Row>();
 const agent=await db().prepare('SELECT heartbeat FROM cma_vgm_agents WHERE owner=?').bind(owner).first<{heartbeat:number}>();
 const online=!!agent&&Date.now()-agent.heartbeat<90000;
 const snapshot=row?.snapshot?JSON.parse(row.snapshot) as {rows:string[][];total:number;complete:true}:null;
 return {configured,extensionOnline:online,connected:online&&!!row?.checked_at&&Date.now()-row.checked_at<600000,submissionEnabled:false as const,checkedAt:row?.checked_at?new Date(row.checked_at).toISOString():null,state:snapshot?'ready':row?.state||'queued',...snapshot,refreshing:row?.state==='reading'||row?.state==='queued',message:row?.message||(!online?'CMA arka plan bağlantısı bekleniyor.':(row?.state==='ready'?'CMA kayıtları güncel.':'CMA kayıtları arka planda güncelleniyor.')),accountVerified:!!snapshot};
}
export async function claimCmaHistory(owner:string){
 const credentials=await readCredentials(owner,'cma-cgm');if(!credentials)return null;
 await db().prepare('INSERT OR IGNORE INTO cma_history(owner) VALUES(?)').bind(owner).run();
 const id=crypto.randomUUID(),now=Date.now();
 const claim=await db().prepare("UPDATE cma_history SET request_id=?,state='reading',lease_until=?,next_attempt=?,message=NULL WHERE owner=? AND next_attempt<=? AND lease_until<?").bind(id,now+180000,now+300000,owner,now,now).run();
 return claim.meta.changes?{id,mode:'history' as const,credentials}:null;
}
export async function completeCmaHistory(owner:string,input:z.infer<typeof cmaHistoryResult>){
 if(input.snapshot){const credentials=await readCredentials(owner,'cma-cgm');if(!input.account||credentials?.username.toLowerCase()!==input.account.toLowerCase()||input.snapshot.rows.length!==input.snapshot.total)throw new AppError('CMA hesabı veya liste bütünlüğü doğrulanamadı.',409);}
 const now=Date.now();
 const result=input.snapshot?await db().prepare("UPDATE cma_history SET snapshot=?,checked_at=?,state='ready',lease_until=0,message=NULL,next_attempt=? WHERE owner=? AND request_id=? AND state='reading' AND lease_until>?").bind(JSON.stringify(input.snapshot),now,now+300000,owner,input.id,now).run():await db().prepare("UPDATE cma_history SET state='blocked',lease_until=0,message=?,next_attempt=? WHERE owner=? AND request_id=? AND state='reading' AND lease_until>?").bind(input.message||'CMA okuması tamamlanamadı.',now+1800000,owner,input.id,now).run();
 if(!result.meta.changes)throw new AppError('Geçmiş okumasının süresi doldu.',409);
 if(input.snapshot){
  const jobs=(await db().prepare("SELECT id,payload,created_at FROM cma_vgm_jobs WHERE owner=? AND state='unknown' AND send_authorized=1 AND deleted_at IS NULL").bind(owner).all<{id:string;payload:string;created_at:string}>()).results;
  for(const job of jobs){
   const evidence=cmaSubmissionEvidence(input.snapshot.rows,JSON.parse(job.payload),job.created_at);
   if(evidence)await db().prepare("UPDATE cma_vgm_jobs SET state='submitted',result=?,updated_at=? WHERE id=? AND owner=? AND state='unknown' AND send_authorized=1").bind(evidence,new Date(now).toISOString(),job.id,owner).run();
  }
 }
 return {ok:true};
}
