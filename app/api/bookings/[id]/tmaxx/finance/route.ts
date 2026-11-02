import {requireUser} from '@/lib/server/auth';
import {errorResponse,json} from '@/lib/server/runtime';
import {readTmaxxFinance} from '@/lib/server/tmaxx-finance';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{return json(await readTmaxxFinance((await params).id,await requireUser(req)));}catch(e){return errorResponse(e);}}
