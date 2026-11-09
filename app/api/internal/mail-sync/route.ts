import {errorResponse,json} from '@/lib/server/runtime';
import {requireMailSyncKey,runMailSync} from '@/lib/server/mail-sync';

export async function POST(req:Request){
 try{
  requireMailSyncKey(req);
  const started=Date.now(),result=await runMailSync();
  console.log(JSON.stringify({event:'mail-sync',source:'cron',status:result.status,imported:result.imported??0,elapsedMs:Date.now()-started}));
  return json(result);
 }
 catch(error){return errorResponse(error);}
}
