import {requireUser} from '@/lib/server/auth';
import {errorResponse,json,sameOrigin} from '@/lib/server/runtime';
import {mailOverview,runMailSync} from '@/lib/server/mail-sync';
import {intakeConfig,mailThreads,runMailIntake} from '@/lib/server/mail-intake';

async function overview(){return {...await mailOverview(),intake:{enabled:Boolean(intakeConfig())},threads:await mailThreads()};}
export async function GET(req:Request){try{await requireUser(req);return json(await overview());}catch(e){return errorResponse(e);}}
/** "Şimdi kontrol et": reads the mailbox and processes waiting e-mails, same leases as the scheduler. */
export async function POST(req:Request){try{sameOrigin(req);await requireUser(req);const result=await runMailSync({manual:true});const intake=await runMailIntake({limit:2});return json({result,intake,overview:await overview()});}catch(e){return errorResponse(e);}}
