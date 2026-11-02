import {requireControlApproval} from '@/lib/server/control-gate';
import {requireUser} from '@/lib/server/auth';
import {owned,view} from '@/lib/server/records';
import {AppError,db,errorResponse,json,sameOrigin} from '@/lib/server/runtime';
import {inspectTmaxxRecovery,applyRecoveryEdits,resolveRecoveryTypes,currentRecoveryBatch,type RecoveryBatch} from '@/lib/server/tmaxx-recovery';
import {contracts,platformSession,fetchJson} from '@/lib/server/platforms';
import {tmaxxClient,tmaxxSaveKeys,orderTmaxxUpdates} from '@/lib/server/tmaxx-workflow';
import {tmaxxValueEqual} from '@/lib/tmaxx-values';
import {overall} from '@/lib/domain';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 let id='',owner='',lease=0,locked=false,applying=false;
 try{
  sameOrigin(req);owner=await requireUser(req);id=(await params).id;const r=await owned(id,owner);
  const raw=await req.text();if(raw.length>200000)throw new AppError('Düzeltmeler çok uzun.',413);
  const input=raw?JSON.parse(raw):{};if(!['inspect','preview','apply',undefined].includes(input.action))throw new AppError('Geçersiz işlem.');
  lease=Date.now()+15*60000;
  const claim=await db().prepare('UPDATE records SET lock_until=? WHERE id=? AND owner=? AND lock_until<=?').bind(lease,id,owner,Date.now()).run();if(!claim.meta.changes)throw new AppError('Kayıt işleniyor.',409);locked=true;
  const d=await db().prepare("SELECT id,payload,status FROM deliveries WHERE record_id=? AND platform='tmaxx'").bind(id).first<{id:string;payload:string;status:string}>();
  if(!d?.payload||!['created','unknown','failed','sending'].includes(d.status))throw new AppError('Düzeltilecek T-MAXX aktarımı bulunamadı.',409);
  const stored=JSON.parse(d.payload),batch:RecoveryBatch=stored.loads?stored:{loads:[stored]};
  const editingBatch=d.status==='created'?await currentRecoveryBatch(owner,batch):batch;
  const before=await inspectTmaxxRecovery(owner,editingBatch);
  if(!input.action||input.action==='inspect')return json({loads:editingBatch.loads.map(l=>({goodId:l.goodId,reference:l.reference,booking:String(l.updates.find(u=>u.path.endsWith('seaGood'))?.body.bookingNo||'')})),rows:before.rows,issues:before.issues,blockers:before.blockers,fingerprint:before.fingerprint});
  if(input.fingerprint!==before.fingerprint)throw new AppError('T-MAXX bilgileri değişti. Değerleri yeniden kontrol edin.',409);
  if(before.blockers.length)throw new AppError(before.blockers.join(' '),409);
  if(!input.edits||typeof input.edits!=='object'||Array.isArray(input.edits))throw new AppError('Düzeltme alanları geçersiz.',422);
  const next=await resolveRecoveryTypes(owner,applyRecoveryEdits(editingBatch,before.rows,input.edits));
  const preview=await inspectTmaxxRecovery(owner,next);
  if(input.action==='preview'){
   return json({rows:preview.rows,issues:preview.issues,blockers:preview.blockers,fingerprint:before.fingerprint});
  }
  if(preview.issues.length)throw new AppError(preview.issues.map(i=>i.message).join(' '),422);
  // Retain the exact approved T-MAXX plan before any platform write. INTTRA stays immutable.
  await requireControlApproval({id,owner,revision:r.revision},'tmaxx-recovery',next);
  applying=true;
  await db().prepare("UPDATE deliveries SET status='sending',payload=?,message=? WHERE id=?").bind(JSON.stringify(next),'Kullanıcının kontrol ettiği T-MAXX düzeltmeleri uygulanıyor.',d.id).run();
  const get=await tmaxxClient(owner),session=await platformSession(contracts().find(c=>c.id==='tmaxx')!,owner);
  for(const load of next.loads)for(const u of orderTmaxxUpdates(load.updates)){
   const current=await get(u.path+'/'+u.entityId) as Record<string,unknown>;
   const old=before.entities.find(e=>e.id===u.entityId);
   const keys=tmaxxSaveKeys(u.path).filter(k=>Object.hasOwn(u.body,k));
   if(!old||keys.some(k=>!tmaxxValueEqual(k,current[k],old[k])&&!tmaxxValueEqual(k,current[k],u.body[k])))throw new AppError('T-MAXX kaydı inceleme sonrasında değişti. Yeniden kontrol edin.',409);
   if(keys.every(k=>tmaxxValueEqual(k,current[k],u.body[k])))continue;
   await requireControlApproval({id,owner,revision:r.revision},'tmaxx-recovery',next);
   const step='recovery:'+Date.now()+':'+u.entityId;
   await db().prepare("INSERT INTO platform_steps(record_id,revision,platform,step,status,request_hash,updated_at) VALUES(?,?,'tmaxx',?,'sending',?,?)").bind(id,r.revision,step,before.fingerprint,new Date().toISOString()).run();
   try{
    await fetchJson('http://95.216.243.19:8090'+u.path,{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.token,Cookie:session.cookie},body:JSON.stringify({...current,...Object.fromEntries(keys.map(k=>[k,u.body[k]]))})});
    const actual=await get(u.path+'/'+u.entityId) as Record<string,unknown>;
    const different=keys.filter(k=>!tmaxxValueEqual(k,actual[k],u.body[k]));
    if(different.length)throw new AppError('T-MAXX değişikliği kaydetmedi: '+different.join(', ')+'. Mevcut değerleri tekrar kontrol edin.',409);
    await db().prepare("UPDATE platform_steps SET status='complete',result=? WHERE record_id=? AND revision=? AND platform='tmaxx' AND step=?").bind(JSON.stringify({id:actual.id,version:actual.version}),id,r.revision,step).run();
   }catch(e){await db().prepare("UPDATE platform_steps SET status='unknown' WHERE record_id=? AND revision=? AND platform='tmaxx' AND step=?").bind(id,r.revision,step).run();throw e;}
  }
  const final=await inspectTmaxxRecovery(owner,next);if(final.rows.some(row=>!row.matches))throw new AppError('Bazı T-MAXX alanları henüz eşleşmiyor. Kontrol tablosunu yenileyin.',409);
  for(const load of next.loads)await db().prepare("INSERT INTO platform_steps(record_id,revision,platform,step,status,request_hash,result,updated_at) VALUES(?,?,'tmaxx',?,'complete','recovery',?,?) ON CONFLICT(record_id,revision,platform,step) DO UPDATE SET status='complete',result=excluded.result").bind(id,r.revision,'hbl-result:'+load.goodId,JSON.stringify({goodId:load.goodId,reference:load.reference}),new Date().toISOString()).run();
  await db().prepare("UPDATE platform_steps SET status='complete',result=COALESCE(result,'{}') WHERE record_id=? AND revision=? AND platform='tmaxx' AND status IN ('unknown','sending')").bind(id,r.revision).run();
  await db().prepare("UPDATE deliveries SET status='created',reference=?,message='Düzeltilen alanlar T-MAXX üzerinden tekrar okunarak doğrulandı.' WHERE id=?").bind(next.loads.map(l=>l.reference).join(' · '),d.id).run();
  const states=await db().prepare('SELECT status FROM deliveries WHERE record_id=?').bind(id).all<{status:string}>();await db().prepare("UPDATE records SET status=?,issues='[]' WHERE id=?").bind(overall(states.results),id).run();
  return json({record:await view(await owned(id,owner))});
 }catch(e){if(locked){if(applying){await db().prepare("UPDATE deliveries SET status='unknown' WHERE record_id=? AND platform='tmaxx'").bind(id).run();await db().prepare("UPDATE records SET status='unknown' WHERE id=?").bind(id).run();}const message=e instanceof AppError?e.message:'T-MAXX düzeltmesi tamamlanamadı. Mevcut değerleri tekrar kontrol edin.';await db().prepare("UPDATE deliveries SET message=? WHERE record_id=? AND platform='tmaxx' AND status<>'created'").bind(message,id).run();}return errorResponse(e);}
 finally{if(locked)await db().prepare('UPDATE records SET lock_until=0 WHERE id=? AND owner=? AND lock_until=?').bind(id,owner,lease).run();}
}
