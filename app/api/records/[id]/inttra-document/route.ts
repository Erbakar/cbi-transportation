import {requireUser} from '@/lib/server/auth';
import {owned} from '@/lib/server/records';
import {AppError,db,errorResponse} from '@/lib/server/runtime';
import {inttraDocument} from '@/lib/server/inttra-document';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 try{const owner=await requireUser(req),id=(await params).id;await owned(id,owner);
  const delivery=await db().prepare("SELECT reference FROM deliveries WHERE record_id=? AND platform='inttra' AND status='created'").bind(id).first<{reference:string}>();
  if(!delivery?.reference)throw new AppError('Bu talimat henüz INTTRA’ya gönderilmedi.',404);
  const bytes=await inttraDocument(owner,delivery.reference);
  return new Response(bytes,{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="INTTRA-SI-'+delivery.reference+'.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(error){return errorResponse(error);}
}
