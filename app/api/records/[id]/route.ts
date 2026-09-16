import {manualSchema} from '@/lib/manual';
import {requireUser} from '@/lib/server/auth';
import {owned,view} from '@/lib/server/records';
import {AppError,db,errorResponse,json,sameOrigin} from '@/lib/server/runtime';
export async function DELETE(req:Request,{params}:{params:Promise<{id:string}>}){
 try{
  sameOrigin(req);const owner=await requireUser(req);const {id}=await params;await owned(id,owner);const uncertain=await db().prepare("SELECT step FROM platform_steps WHERE record_id=? AND status IN ('sending','unknown') LIMIT 1").bind(id).first();if(uncertain)throw new AppError('Platform sonucu doğrulanmadan talimat silinemez.',409);
  // Logical deletion preserves audit history while removing the record and private file access.
  const [result]=await db().batch([db().prepare("UPDATE records SET status='deleted',hash=?,updated_at=? WHERE id=? AND owner=? AND status<>'deleted' AND lock_until<=? AND NOT EXISTS (SELECT 1 FROM deliveries WHERE record_id=? AND status IN ('created','sending','unknown'))").bind('deleted:'+id,new Date().toISOString(),id,owner,Date.now(),id),db().prepare("UPDATE deliveries SET business_key=NULL WHERE record_id=? AND EXISTS (SELECT 1 FROM records WHERE id=? AND owner=? AND status='deleted')").bind(id,id,owner)]);
  if(!result.meta.changes)throw new AppError('İşlenen, platforma aktarılmış veya sonucu belirsiz talimat silinemez.',409);
  return json({deleted:true});
 }catch(e){return errorResponse(e)}
}

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
 try{sameOrigin(req);const owner=await requireUser(req);const {id}=await params;await owned(id,owner);if(Number(req.headers.get('content-length')||0)>200000)throw new AppError('Alanlar çok uzun.',413);const raw=await req.text();if(raw.length>200000)throw new AppError('Alanlar çok uzun.',413);const parsed=manualSchema.safeParse(JSON.parse(raw));if(!parsed.success)throw new AppError('Manuel alanların biçimi geçersiz.');
 const uncertain=await db().prepare("SELECT step FROM platform_steps WHERE record_id=? AND status IN ('sending','unknown') LIMIT 1").bind(id).first();if(uncertain)throw new AppError('Önceki platform adımının sonucu doğrulanmalı.',409);const result=await db().prepare("UPDATE records SET manual=?,status='uploaded',issues=NULL,updated_at=? WHERE id=? AND owner=? AND lock_until<=? AND NOT EXISTS(SELECT 1 FROM deliveries WHERE record_id=? AND status IN ('created','sending','unknown'))").bind(JSON.stringify(parsed.data),new Date().toISOString(),id,owner,Date.now(),id).run();if(!result.meta.changes)throw new AppError('İşlenen veya aktarılmış kayıt değiştirilemez.',409);await db().prepare('UPDATE platform_reviews SET approved=0 WHERE record_id=?').bind(id).run();return json({record:await view(await owned(id,owner))});
 }catch(e){return errorResponse(e)}
}
