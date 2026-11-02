import {requireUser} from '@/lib/server/auth';
import {AppError,errorResponse,json} from '@/lib/server/runtime';
import {bookingErpDocuments,bookingErpFile,bookingErpHbl} from '@/lib/server/tmaxx-booking-documents';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{
 const owner=await requireUser(req),id=(await params).id,u=new URL(req.url),file=u.searchParams.get('file'),report=u.searchParams.get('report');
 for(const v of [file,report])if(v!==null&&(!/^\d+$/.test(v)||!Number.isSafeInteger(Number(v))||Number(v)<=0))throw new AppError('Belge kimliği geçersiz.',422);
 if(file!==null){const d=await bookingErpFile(id,owner,Number(file));return new Response(d.bytes,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(d.filename),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
 if(u.searchParams.get('hbl')==='1'){const d=await bookingErpHbl(id,owner,report===null?undefined:Number(report));if(!d.bytes)return json({reports:d.reports});return new Response(d.bytes,{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="TMAXX-HBL.pdf"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
 return json(await bookingErpDocuments(id,owner));
 }catch(e){return errorResponse(e);}}
