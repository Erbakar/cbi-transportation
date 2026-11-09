import {requireUser} from '@/lib/server/auth';
import {errorResponse,json,sameOrigin} from '@/lib/server/runtime';
import {mailOverview,runMailSync} from '@/lib/server/mail-sync';

export async function GET(req:Request){try{await requireUser(req);return json(await mailOverview());}catch(e){return errorResponse(e);}}
/** "Şimdi kontrol et": read-only check of the mailbox, same lease as the scheduler. */
export async function POST(req:Request){try{sameOrigin(req);await requireUser(req);const result=await runMailSync({manual:true});return json({result,overview:await mailOverview()});}catch(e){return errorResponse(e);}}
