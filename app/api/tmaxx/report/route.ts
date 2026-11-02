import {requireUser} from '@/lib/server/auth';
import {AppError,errorResponse,json} from '@/lib/server/runtime';
import {tmaxxReport} from '@/lib/server/tmaxx-finance';
export async function GET(req:Request){try{const owner=await requireUser(req),cursor=new URL(req.url).searchParams.get('cursor')||'';if(cursor.length>100||cursor&&!/^[a-zA-Z0-9-]+$/.test(cursor))throw new AppError('Sayfa bilgisi geçersiz.',422);return json(await tmaxxReport(owner,cursor));}catch(e){return errorResponse(e);}}
