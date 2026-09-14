import {requireUser} from '@/lib/server/auth';
import {connectionStates,saveCredentials} from '@/lib/server/platforms';
import {errorResponse,json,sameOrigin} from '@/lib/server/runtime';
export async function POST(req:Request){try{sameOrigin(req);const user=await requireUser(req);return json({connections:await connectionStates(user)})}catch(e){return errorResponse(e)}}

export async function PUT(req:Request){try{sameOrigin(req);const user=await requireUser(req);const body=await req.json() as {platform?:unknown;username?:unknown;password?:unknown};if(typeof body.platform!=='string'||typeof body.username!=='string'||typeof body.password!=='string')return json({error:'Kullanıcı adı ve şifre gerekli.'},400);await saveCredentials(user,body.platform,body.username,body.password);return json({connections:await connectionStates(user)})}catch(e){return errorResponse(e)}}
