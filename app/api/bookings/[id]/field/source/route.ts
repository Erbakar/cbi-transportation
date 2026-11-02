import { requireUser } from '@/lib/server/auth';
import { AppError,errorResponse,json } from '@/lib/server/runtime';
import { ownBooking } from '@/lib/server/operation-documents';
import { readFieldSource } from '@/lib/server/field-source';
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){try{
 const owner=await requireUser(req);await ownBooking((await ctx.params).id,owner);
 const q=new URL(req.url).searchParams, good=q.get('goodId');
 if(good&&(!/^\d+$/.test(good)||!Number.isSafeInteger(Number(good))||Number(good)<=0))throw new AppError('Yük kimliği geçersiz.');
 return json(await readFieldSource(owner,q.get('reference')||'',good?Number(good):undefined));
}catch(e){return errorResponse(e);}}
