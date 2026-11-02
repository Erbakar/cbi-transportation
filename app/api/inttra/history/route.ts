import {requireUser} from '@/lib/server/auth';
import {inttraHistory} from '@/lib/server/inttra-history';
import {errorResponse,json} from '@/lib/server/runtime';
export async function GET(req:Request){try{return json(await inttraHistory(await requireUser(req)));}catch(e){return errorResponse(e);}}
