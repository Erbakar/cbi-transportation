import {requireUser} from '@/lib/server/auth';
import {owned} from '@/lib/server/records';
import {AppError,db,errorResponse,json,sameOrigin} from '@/lib/server/runtime';
export async function DELETE(req:Request,{params}:{params:Promise<{id:string}>}){
 try{
  sameOrigin(req);const owner=await requireUser(req);const {id}=await params;await owned(id,owner);
  // Logical deletion preserves audit history while removing the record and private file access.
  const [result]=await db().batch([db().prepare("UPDATE records SET status='deleted',hash=?,updated_at=? WHERE id=? AND owner=? AND status<>'deleted' AND lock_until<=? AND NOT EXISTS (SELECT 1 FROM deliveries WHERE record_id=? AND status IN ('created','sending','unknown'))").bind('deleted:'+id,new Date().toISOString(),id,owner,Date.now(),id),db().prepare("UPDATE deliveries SET business_key=NULL WHERE record_id=? AND EXISTS (SELECT 1 FROM records WHERE id=? AND owner=? AND status='deleted')").bind(id,id,owner)]);
  if(!result.meta.changes)throw new AppError('İşlenen, platforma aktarılmış veya sonucu belirsiz talimat silinemez.',409);
  return json({deleted:true});
 }catch(e){return errorResponse(e)}
}
