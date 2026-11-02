import {requireUser} from '@/lib/server/auth';
import {owned,view} from '@/lib/server/records';
import {AppError,db,errorResponse,json,sameOrigin} from '@/lib/server/runtime';
import {readExistingHbls} from '@/lib/server/tmaxx-import';
import {overall} from '@/lib/domain';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 let id='',owner='',lease=0,locked=false;
 try{
  sameOrigin(req);owner=await requireUser(req);id=(await params).id;const record=await owned(id,owner);
  lease=Date.now()+15*60000;const claim=await db().prepare('UPDATE records SET lock_until=? WHERE id=? AND owner=? AND lock_until<=?').bind(lease,id,owner,Date.now()).run();if(!claim.meta.changes)throw new AppError('Kayıt işleniyor.',409);locked=true;
  const delivery=await db().prepare("SELECT payload FROM deliveries WHERE record_id=? AND platform='tmaxx'").bind(id).first<{payload:string}>();
  if(!delivery?.payload)throw new AppError('Önceden eşleştirilmiş T-MAXX yükü bulunamadı.',409);
  const stored=JSON.parse(delivery.payload),results=await readExistingHbls(owner,stored.loads||[stored]);
  // All remote reads must succeed before atomically linking records locally.
  await db().batch([...results.map(result=>db().prepare("INSERT INTO platform_steps(record_id,revision,platform,step,status,request_hash,result,updated_at) VALUES(?,?,'tmaxx',?,'complete','existing-import',?,?) ON CONFLICT(record_id,revision,platform,step) DO UPDATE SET status='complete',request_hash='existing-import',result=excluded.result,updated_at=excluded.updated_at").bind(id,record.revision,'hbl-result:'+result.goodId,JSON.stringify(result),result.importedAt)),db().prepare("UPDATE deliveries SET status='created',reference=?,message=? WHERE record_id=? AND platform='tmaxx'").bind(results.map(r=>r.reference).join(' · '),'T-MAXX’te önceden oluşturulan HBL okundu ve eşleştirildi. T-MAXX üzerinde değişiklik yapılmadı; eski aktarım planıyla farklılıklar korunur.',id)]);
  const states=await db().prepare('SELECT status FROM deliveries WHERE record_id=?').bind(id).all<{status:string}>();
  await db().prepare("UPDATE records SET status=?,issues='[]' WHERE id=?").bind(overall(states.results),id).run();
  return json({record:await view(await owned(id,owner))});
 }catch(e){return errorResponse(e)}finally{if(locked)await db().prepare('UPDATE records SET lock_until=0 WHERE id=? AND owner=? AND lock_until=?').bind(id,owner,lease).run();}
}
