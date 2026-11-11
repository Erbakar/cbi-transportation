import {errorResponse,json} from '@/lib/server/runtime';
import {requireMailSyncKey} from '@/lib/server/mail-sync';
import {runMailSubmit} from '@/lib/server/mail-intake';

/** Called by the scheduler after the mail sync, as a separate invocation with its own request budget. */
export async function POST(req:Request){
 try{requireMailSyncKey(req);return json(await runMailSubmit());}
 catch(error){return errorResponse(error);}
}
