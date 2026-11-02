import {z} from 'zod';
import {requireUser} from '@/lib/server/auth';
import {boundedJSON} from '@/lib/server/bounded-json';
import {AppError,errorResponse,json,sameOrigin} from '@/lib/server/runtime';
import {cmaJobs,prepareCmaJob,submitCmaJob,deleteCmaJob,retryCmaJob} from '@/lib/server/cma-vgm-jobs';
export async function GET(req:Request){try{return json(await cmaJobs(null,await requireUser(req)));}catch(e){return errorResponse(e);}}
export async function POST(req:Request){try{sameOrigin(req);return json(await prepareCmaJob(null,await requireUser(req),await boundedJSON(req,4096)));}catch(e){return errorResponse(e);}}
export async function PUT(req:Request){try{sameOrigin(req);const owner=await requireUser(req),p=z.object({id:z.string().uuid(),confirmed:z.literal(true)}).strict().safeParse(await boundedJSON(req,4096));if(!p.success)throw new AppError('Gönderim onayı gerekli.');return json(await submitCmaJob(null,owner,p.data.id));}catch(e){return errorResponse(e);}}

export async function DELETE(req:Request){try{sameOrigin(req);const owner=await requireUser(req),p=z.object({id:z.string().uuid()}).strict().safeParse(await boundedJSON(req,4096));if(!p.success)throw new AppError('Silinecek kaydı seçin.');return json(await deleteCmaJob(null,owner,p.data.id));}catch(e){return errorResponse(e);}}

export async function PATCH(req:Request){try{sameOrigin(req);const owner=await requireUser(req),p=z.object({id:z.string().uuid()}).strict().safeParse(await boundedJSON(req,4096));if(!p.success)throw new AppError('Kontrol edilecek kaydı seçin.');return json(await retryCmaJob(owner,p.data.id));}catch(e){return errorResponse(e);}}
