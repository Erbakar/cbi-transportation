import {requireUser} from '@/lib/server/auth';
import {json,errorResponse} from '@/lib/server/runtime';
import {prealertManifest} from '@/lib/server/bill-control';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{return json(await prealertManifest((await params).id,await requireUser(req)));}catch(e){return errorResponse(e);}}
