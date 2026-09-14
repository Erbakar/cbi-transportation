import {authenticate,cookie,currentUser,configured,logout} from '@/lib/server/auth';
import {errorResponse,json,sameOrigin} from '@/lib/server/runtime';
export async function GET(req:Request){try{return json({user:configured()?await currentUser(req):null,configured:configured()})}catch(e){return errorResponse(e)}}
export async function POST(req:Request){try{sameOrigin(req);const data=await req.json() as {username?:string;password?:string};const r=await authenticate(req,String(data.username||''),String(data.password||''));const res=json({user:r.user});res.headers.set('Set-Cookie',cookie(req,r.token));return res}catch(e){return errorResponse(e)}}
export async function DELETE(req:Request){try{sameOrigin(req);await logout(req);const res=json({ok:true});res.headers.set('Set-Cookie',cookie(req,'',0));return res}catch(e){return errorResponse(e)}}
