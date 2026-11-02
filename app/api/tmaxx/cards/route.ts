import {requireUser} from '@/lib/server/auth';
import {errorResponse,json} from '@/lib/server/runtime';
import {searchErpCards} from '@/lib/server/tmaxx-booking-write';
import type {CardKind} from '@/lib/operations/tmaxx-booking';
export async function GET(req:Request){try{const owner=await requireUser(req),url=new URL(req.url);return json(await searchErpCards(owner,url.searchParams.get('kind') as CardKind,url.searchParams.get('q')||''));}catch(e){return errorResponse(e);}}
