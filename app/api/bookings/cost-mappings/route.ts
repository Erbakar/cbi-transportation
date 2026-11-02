import {requireUser} from '@/lib/server/auth';
import {errorResponse,json} from '@/lib/server/runtime';
import {tmaxxCostMappings} from '@/lib/server/booking-cost-mapping';
export async function GET(req:Request){try{return json(await tmaxxCostMappings(await requireUser(req)));}catch(e){return errorResponse(e);}}
