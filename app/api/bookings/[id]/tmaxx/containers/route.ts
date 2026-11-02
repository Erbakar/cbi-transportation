import {z} from 'zod';
import {requireUser} from '@/lib/server/auth';
import {AppError,errorResponse,json,sameOrigin} from '@/lib/server/runtime';
import {boundedJSON} from '@/lib/server/bounded-json';
import {containerInput,containerWorkspace,prepareContainer,executeContainer,cancelContainer} from '@/lib/server/tmaxx-containers';
type Context={params:Promise<{id:string}>};
export async function GET(req:Request,{params}:Context){try{return json(await containerWorkspace((await params).id,await requireUser(req)));}catch(e){return errorResponse(e);}}
export async function POST(req:Request,{params}:Context){try{sameOrigin(req);const owner=await requireUser(req),input=containerInput.safeParse(await boundedJSON(req));if(!input.success)throw new AppError('T-MAXX alanlarını ve sürüm bilgisini kontrol edin.',422);return json(await prepareContainer((await params).id,owner,input.data));}catch(e){return errorResponse(e);}}
export async function PUT(req:Request,{params}:Context){try{sameOrigin(req);const owner=await requireUser(req),input=z.object({runId:z.string().uuid()}).strict().safeParse(await boundedJSON(req));if(!input.success)throw new AppError('Önizleme kimliği geçersiz.',422);return json(await executeContainer((await params).id,owner,input.data.runId));}catch(e){return errorResponse(e);}}
export async function DELETE(req:Request,{params}:Context){try{sameOrigin(req);const owner=await requireUser(req),input=z.object({runId:z.string().uuid()}).strict().safeParse(await boundedJSON(req));if(!input.success)throw new AppError('Önizleme kimliği geçersiz.',422);await cancelContainer((await params).id,owner,input.data.runId);return json({cancelled:true});}catch(e){return errorResponse(e);}}
