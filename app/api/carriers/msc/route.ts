import {requireUser} from '@/lib/server/auth';
import {boundedJSON} from '@/lib/server/bounded-json';
import {mscConnection,mscSession,saveMscCredentials} from '@/lib/server/msc-connection';
import {errorResponse,json,sameOrigin,AppError} from '@/lib/server/runtime';
export async function GET(req:Request){try{return json(await mscConnection(await requireUser(req)));}catch(e){return errorResponse(e);}}
/** Opens a fresh myMSC session in the server browser. Nothing is submitted to MSC. */
export async function POST(req:Request){try{sameOrigin(req);const state=await mscSession(await requireUser(req),true);delete state.cookies;return json(state);}catch(e){return errorResponse(e);}}
export async function PUT(req:Request){try{
 sameOrigin(req);const owner=await requireUser(req),body=await boundedJSON(req,8192);
 if(!body||typeof body!=='object'||!('username' in body)||!('password' in body)||typeof body.username!=='string'||typeof body.password!=='string')throw new AppError('Kullanıcı adı ve şifre gerekli.');
 return json(await saveMscCredentials(owner,body.username,body.password));
}catch(e){return errorResponse(e);}}
