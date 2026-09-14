import {requireUser} from '@/lib/server/auth';
import {connectionStates} from '@/lib/server/platforms';
import {errorResponse,json,sameOrigin} from '@/lib/server/runtime';
export async function POST(req:Request){try{sameOrigin(req);const user=await requireUser(req);return json({connections:await connectionStates(user)})}catch(e){return errorResponse(e)}}
