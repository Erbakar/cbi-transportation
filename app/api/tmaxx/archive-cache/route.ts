import {requireUser} from '@/lib/server/auth';
import {errorResponse,json} from '@/lib/server/runtime';
import {cachedArchive} from '@/lib/server/platform-history-cache';
export async function GET(req:Request){try{return json(await cachedArchive(await requireUser(req)));}catch(e){return errorResponse(e);}}
