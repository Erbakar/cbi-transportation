import {requireUser} from '@/lib/server/auth';
import {AppError,errorResponse,json,sameOrigin} from '@/lib/server/runtime';
import {lookupPrealertPosition} from '@/lib/server/prealert-upload';
import {positionReference} from '@/lib/server/tmaxx-workspace';
import {documentForm} from '@/lib/server/operation-documents';
import {detectPrealertPosition} from '@/lib/server/prealert-position';

export async function GET(req:Request){
 try{
  const owner=await requireUser(req),reference=positionReference.safeParse(new URL(req.url).searchParams.get('reference'));
  if(!reference.success)throw new AppError('Geçerli pozisyon referansı girin.',422);
  return json(await lookupPrealertPosition(owner,reference.data));
 }catch(error){return errorResponse(error);}
}

export async function POST(req:Request){
 try{
  sameOrigin(req);
  const owner=await requireUser(req);
  return json(await detectPrealertPosition(owner,await documentForm(req)));
 }catch(error){return errorResponse(error);}
}
