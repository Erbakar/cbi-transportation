import {requireUser} from '@/lib/server/auth';
import {errorResponse,json} from '@/lib/server/runtime';
import {tmaxxCalendar} from '@/lib/server/tmaxx-operations';
export async function GET(req:Request){try{return json(await tmaxxCalendar(await requireUser(req),new URL(req.url).searchParams.get('hideTests')==='true'));}catch(e){return errorResponse(e);}}
