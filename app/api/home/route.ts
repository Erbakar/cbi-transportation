import {requireUser} from '@/lib/server/auth';
import {json,errorResponse,AppError} from '@/lib/server/runtime';
import {homeIndex} from '@/lib/server/home';
export async function GET(req:Request){try{const cursor=new URL(req.url).searchParams.get('cursor')||'';if(cursor&&!/^[a-f0-9-]{36}$/.test(cursor))throw new AppError('Geçersiz sayfa.');return json(await homeIndex(await requireUser(req),cursor));}catch(e){return errorResponse(e);}}
