import {requireUser} from '@/lib/server/auth';
import {AppError,db,errorResponse,json,sameOrigin} from '@/lib/server/runtime';
import {owned,view} from '@/lib/server/records';
import {contracts,reconcile} from '@/lib/server/platforms';
import {reconcileTmaxxBatch} from '@/lib/server/tmaxx-batch';
import {overall} from '@/lib/domain';
import {inspectTmaxxCheckpoint,tmaxxSteps} from '@/lib/server/tmaxx-checkpoint';
import {platformEnabled} from '@/lib/server/platform-policy';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){let locked=false,owner='',id='',lease=0;try{sameOrigin(req);owner=await requireUser(req);id=(await params).id;const r=await owned(id,owner);if(r.lock_until>Date.now())throw new AppError('Talimat işleniyor. Lütfen bekleyin.',409);if(!platformEnabled('tmaxx')&&r.status==='unknown')throw new AppError('T-MAXX sonucu yeni hesap geldiğinde doğrulanacak. INTTRA kaydını yeniden göndermeyin.',409);if(!r.fields)throw new AppError('Belge alanları henüz okunmadı.');lease=Date.now()+15*60000;const claim=await db().prepare('UPDATE records SET lock_until=? WHERE id=? AND owner=? AND lock_until<=?').bind(lease,id,owner,Date.now()).run();if(!claim.meta.changes)throw new AppError('Talimat işleniyor. Lütfen bekleyin.',409);locked=true;const {results}=await db().prepare("SELECT id,platform,payload FROM deliveries WHERE record_id=? AND status IN ('unknown','sending')").bind(id).all<{id:string;platform:string;payload:string}>();for(const d of results.filter(d=>platformEnabled(d.platform))){const c=contracts().find(c=>c.id===d.platform);if(!c)throw new AppError('Platform bağlantısı eksik.',503);let reference:string;
if(d.platform==='tmaxx'&&d.payload){const stored=JSON.parse(d.payload);const batch=stored.loads?stored:{loads:[stored]};
const inttraDone=await db().prepare("SELECT id FROM deliveries WHERE record_id=? AND platform='inttra' AND status='created'").bind(id).first();
if(inttraDone){
 const {results:steps}=await tmaxxSteps({id,owner,revision:r.revision});
 let checkpoint:Awaited<ReturnType<typeof inspectTmaxxCheckpoint>>|null=null;
 try{checkpoint=await inspectTmaxxCheckpoint(owner,batch,steps);}catch(e){if(!(e instanceof AppError)||e.status!==409)throw e;}
 if(checkpoint?.remaining){
  const now=new Date().toISOString();
  await db().batch([
   ...checkpoint.verified.map(s=>db().prepare("UPDATE platform_steps SET status='complete',result=?,updated_at=? WHERE record_id=? AND revision=? AND platform='tmaxx' AND step=? AND request_hash=? AND status IN ('unknown','sending')").bind(JSON.stringify(s.result),now,id,r.revision,s.step,s.requestHash)),
   db().prepare("UPDATE deliveries SET status='failed',message=?,updated_at=? WHERE id=? AND status IN ('unknown','sending')").bind('Kaydedilen adımlar T-MAXX’ten okunarak doğrulandı. Kalan aktarımı tamamlayabilirsiniz.',now,d.id),
  ]);
  continue;
 }
}
const verified=await reconcileTmaxxBatch(owner,batch);reference=verified.map(v=>v.reference).join(' · ');for(const result of verified){await db().prepare("INSERT INTO platform_steps(record_id,revision,platform,step,status,request_hash,result,updated_at) VALUES(?,?,'tmaxx',?,'complete','reconciled',?,?) ON CONFLICT(record_id,revision,platform,step) DO UPDATE SET status='complete',result=excluded.result,updated_at=excluded.updated_at").bind(id,r.revision,'hbl-result:'+result.goodId,JSON.stringify(result),new Date().toISOString()).run();}await db().prepare("UPDATE platform_steps SET status='complete',result=COALESCE(result,'{}') WHERE record_id=? AND revision=? AND platform='tmaxx' AND status IN ('unknown','sending')").bind(id,r.revision).run();}else reference=await reconcile(c,owner,JSON.parse(r.fields));await db().prepare("UPDATE deliveries SET status='created',reference=?,message='Mevcut kayıt platformdan okunarak doğrulandı.' WHERE id=? AND status IN ('unknown','sending')").bind(reference,d.id).run()}const statuses=await db().prepare('SELECT status FROM deliveries WHERE record_id=?').bind(id).all<{status:string}>();await db().prepare("UPDATE records SET status=?,issues='[]' WHERE id=?").bind(statuses.results.some(d=>d.status==='created')&&statuses.results.some(d=>d.status==='failed')?'partial':overall(statuses.results),id).run();return json({record:await view(await owned(id,owner))})}catch(e){return errorResponse(e)}finally{if(locked)await db().prepare('UPDATE records SET lock_until=0 WHERE id=? AND owner=? AND lock_until=?').bind(id,owner,lease).run()}}
