import {requireUser} from '@/lib/server/auth';
import {cmaBrowser} from '@/lib/server/cma-browser';
import {errorResponse,json,sameOrigin} from '@/lib/server/runtime';
export async function GET(req:Request){try{return json(await cmaBrowser(await requireUser(req)));}catch(e){return errorResponse(e);}}
export async function POST(req:Request){try{sameOrigin(req);return json(await cmaBrowser(await requireUser(req),true));}catch(e){return errorResponse(e);}}
