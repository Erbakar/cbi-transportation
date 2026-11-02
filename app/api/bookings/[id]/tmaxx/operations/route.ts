import {requireUser} from '@/lib/server/auth';
import {errorResponse,json} from '@/lib/server/runtime';
import {readTmaxxOperations} from '@/lib/server/tmaxx-operations';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{return json(await readTmaxxOperations((await params).id,await requireUser(req)));}catch(e){return errorResponse(e);}}
