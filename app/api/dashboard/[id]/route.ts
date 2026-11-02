import {requireUser} from '@/lib/server/auth';
import {json,errorResponse,sameOrigin} from '@/lib/server/runtime';
import {boundedJSON} from '@/lib/server/bounded-json';
import {dashboardFile,saveReportingProfile} from '@/lib/server/dashboard';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{return json(await dashboardFile((await params).id,await requireUser(req)));}catch(e){return errorResponse(e);}}
export async function PUT(req:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(req);return json(await saveReportingProfile((await params).id,await requireUser(req),await boundedJSON(req)));}catch(e){return errorResponse(e);}}
