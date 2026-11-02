import {requireUser} from '@/lib/server/auth';
import {siteConnections} from '@/lib/server/site-connections';
import {errorResponse,json} from '@/lib/server/runtime';
export async function GET(req:Request){try{return json(await siteConnections(await requireUser(req)));}catch(e){return errorResponse(e);}}
