import {z} from 'zod';
import {requireUser} from '@/lib/server/auth';
import {boundedJSON} from '@/lib/server/bounded-json';
import {AppError,errorResponse,json,sameOrigin} from '@/lib/server/runtime';
import {cmaJobs,prepareCmaJob,submitCmaJob} from '@/lib/server/cma-vgm-jobs';
type C={params:Promise<{id:string}>};
export async function GET(req:Request,c:C){try{return json(await cmaJobs((await c.params).id,await requireUser(req)));}catch(e){return errorResponse(e);}}
export async function POST(req:Request,c:C){try{sameOrigin(req);return json(await prepareCmaJob((await c.params).id,await requireUser(req),await boundedJSON(req,4096)));}catch(e){return errorResponse(e);}}
export async function PUT(req:Request,c:C){try{sameOrigin(req);const owner=await requireUser(req),p=z.object({id:z.string().uuid(),confirmed:z.literal(true)}).strict().safeParse(await boundedJSON(req,4096));if(!p.success)throw new AppError('Gönderim onayı gerekli.');return json(await submitCmaJob((await c.params).id,owner,p.data.id));}catch(e){return errorResponse(e);}}
