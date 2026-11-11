import {AppError,errorResponse,json,runtime} from '@/lib/server/runtime';
import {mscSession} from '@/lib/server/msc-connection';

/**
 * Operator check of the myMSC server sign-in, protected by its own key. It opens a session
 * with the saved account only; nothing is submitted to MSC and no cookies are returned.
 */
export async function POST(req:Request){
 try{
  const expected=runtime().MSC_CHECK_KEY,actual=req.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]||'';
  if(!expected||expected.length<64)throw new AppError('Kontrol anahtarı yapılandırılmadı.',503);
  let mismatch=actual.length^expected.length;
  for(let i=0;i<expected.length;i++)mismatch|=(actual.charCodeAt(i)||0)^expected.charCodeAt(i);
  if(mismatch)throw new AppError('Yetkisiz istek.',401);
  const state=await mscSession(runtime().MAIL_RECORD_OWNER||runtime().APP_USERNAME||'cbi',true);
  delete state.cookies;
  return json(state);
 }catch(error){return errorResponse(error);}
}
