import {errorResponse,json} from '@/lib/server/runtime';
import {requireMailSyncKey,runMailSync} from '@/lib/server/mail-sync';
import {runMailIntake} from '@/lib/server/mail-intake';

export async function POST(req:Request){
 try{
  requireMailSyncKey(req);
  const started=Date.now(),result=await runMailSync();
  // Intake runs even when the sync was skipped, so queued replies are not delayed.
  const intake=await runMailIntake({limit:2});
  console.log(JSON.stringify({event:'mail-sync',source:'cron',status:result.status,imported:result.imported??0,intake:intake.status,processed:'processed' in intake?intake.processed:0,elapsedMs:Date.now()-started}));
  return json({...result,intake:intake.status});
 }
 catch(error){return errorResponse(error);}
}
