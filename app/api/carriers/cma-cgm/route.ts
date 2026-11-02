import {requireUser} from '@/lib/server/auth';
import {boundedJSON} from '@/lib/server/bounded-json';
import {cmaConnection,probeCmaConnection,saveCmaCredentials} from '@/lib/server/cma-connection';
import {errorResponse,json,sameOrigin,AppError} from '@/lib/server/runtime';
export async function GET(req:Request){try{return json(await cmaConnection(await requireUser(req)));}catch(e){return errorResponse(e);}}
export async function POST(req:Request){try{sameOrigin(req);return json(await probeCmaConnection(await requireUser(req)));}catch(e){return errorResponse(e);}}
export async function PUT(req:Request){try{
 sameOrigin(req);const owner=await requireUser(req),body=await boundedJSON(req,8192);
 if(!body||typeof body!=='object'||!('username' in body)||!('password' in body)||typeof body.username!=='string'||typeof body.password!=='string')throw new AppError('Kullanıcı adı ve şifre gerekli.');
 return json(await saveCmaCredentials(owner,body.username,body.password));
}catch(e){return errorResponse(e);}}
