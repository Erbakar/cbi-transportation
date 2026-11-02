import {requireUser} from '@/lib/server/auth';
import {AppError,errorResponse,json} from '@/lib/server/runtime';
import {positionReference,readTmaxxPosition} from '@/lib/server/tmaxx-workspace';
export async function GET(req:Request){try{const owner=await requireUser(req);const reference=positionReference.safeParse(new URL(req.url).searchParams.get('reference'));if(!reference.success)throw new AppError('Tam T-MAXX pozisyon referansını girin.',400);return json(await readTmaxxPosition(owner,reference.data));}catch(e){return errorResponse(e);}}
