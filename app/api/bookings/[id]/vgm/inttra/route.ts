import {requireUser} from '@/lib/server/auth';
import {ownBooking} from '@/lib/server/operation-documents';
import {errorResponse,json} from '@/lib/server/runtime';
import {inttraVgmAccess} from '@/lib/server/inttra-vgm-access';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{const owner=await requireUser(req);await ownBooking((await params).id,owner);return json(await inttraVgmAccess(owner));}catch(e){return errorResponse(e);}}
