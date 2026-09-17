import {requireUser} from '@/lib/server/auth';
import {owned} from '@/lib/server/records';
import {AppError,db,errorResponse} from '@/lib/server/runtime';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 try{const owner=await requireUser(req),id=(await params).id;await owned(id,owner);
  const delivery=await db().prepare("SELECT reference,payload FROM deliveries WHERE record_id=? AND platform='inttra' AND status='created'").bind(id).first<{reference:string;payload:string}>();
  if(!delivery?.payload)throw new AppError('Gönderilmiş INTTRA kaydı bulunamadı.',404);
  const stored=JSON.parse(delivery.payload);const shipment=stored.payload?.ShipmentInstruction;if(!shipment)throw new AppError('Gönderim kopyası bulunamadı.',404);
  return new Response(JSON.stringify({inttraSiNumber:delivery.reference,documentType:'Submitted shipping instruction data — not a bill of lading',ShipmentInstruction:shipment},null,2),{headers:{'Content-Type':'application/json;charset=utf-8','Content-Disposition':'attachment; filename="INTTRA-SI-'+delivery.reference.replace(/[^0-9]/g,'')+'.json"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch(e){return errorResponse(e);}
}
