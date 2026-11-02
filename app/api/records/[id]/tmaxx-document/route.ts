import {requireUser} from '@/lib/server/auth';
import {owned} from '@/lib/server/records';
import {AppError,db,errorResponse,json} from '@/lib/server/runtime';
import {tmaxxDocument} from '@/lib/server/tmaxx-document';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 try{const owner=await requireUser(req),id=(await params).id;const record=await owned(id,owner);const u=new URL(req.url),goodId=Number(u.searchParams.get('goodId')),report=u.searchParams.get('reportId');
  if(!Number.isSafeInteger(goodId)||goodId<=0||report!==null&&(!/^\d+$/.test(report)||!Number.isSafeInteger(Number(report))))throw new AppError('Belge kimliği geçersiz.',422);
  const completed=await db().prepare("SELECT result FROM platform_steps WHERE record_id=? AND revision=? AND platform='tmaxx' AND step=? AND status='complete'").bind(id,record.revision,'hbl-result:'+goodId).first();
  const delivery=await db().prepare("SELECT payload FROM deliveries WHERE record_id=? AND platform='tmaxx' AND status='created'").bind(id).first<{payload:string}>();
  const saved=delivery?.payload?JSON.parse(delivery.payload):null;
  if(!completed&&!(saved?.loads||[saved]).some((l:{goodId?:number}|null)=>l?.goodId===goodId))throw new AppError('Bu kayıtta doğrulanmış HBL bulunamadı.',404);
  const result=await tmaxxDocument(owner,goodId,report===null?undefined:Number(report));
  if(!result.bytes)return json({reports:result.reports});
  return new Response(result.bytes,{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="TMAXX-HBL-'+goodId+'.pdf"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch(e){return errorResponse(e);}
}
