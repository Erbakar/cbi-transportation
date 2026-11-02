import {AppError,errorResponse,json} from '@/lib/server/runtime';
import {requirePrealertQueueKey,runPrealertQueue} from '@/lib/server/prealert-queue';

export async function POST(req:Request){
 try{
  requirePrealertQueueKey(req);
  const documentId=new URL(req.url).searchParams.get('documentId')||undefined;
  if(documentId&&!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(documentId))throw new AppError('Geçersiz aktarım kaydı.',400);
  const receivedAt=Date.now(),dispatchedAt=Number(req.headers.get('X-Prealert-Dispatched-At'));
  const result=await runPrealertQueue({documentId});
  console.log(JSON.stringify({event:'prealert-dispatch',source:documentId?'queue':'cron',documentId,status:result.status,receivedAt,elapsedMs:Date.now()-receivedAt,...(dispatchedAt>0&&dispatchedAt<=receivedAt?{dispatchDelayMs:receivedAt-dispatchedAt}:{})}));
  return json(result);
 }
 catch(error){return errorResponse(error);}
}
