import {z} from 'zod';
import {requireUser} from '@/lib/server/auth';
import {AppError,errorResponse,json,sameOrigin} from '@/lib/server/runtime';
import {boundedJSON} from '@/lib/server/bounded-json';
import {erpPrepareSchema} from '@/lib/operations/tmaxx-booking';
import {cancelErpPlan,erpEditor,prepareErpBooking,executeErpBooking} from '@/lib/server/tmaxx-booking-write';
type Context={params:Promise<{id:string}>};
export async function GET(req:Request,{params}:Context){try{return json(await erpEditor((await params).id,await requireUser(req)));}catch(e){return errorResponse(e);}}
export async function POST(req:Request,{params}:Context){try{sameOrigin(req);const owner=await requireUser(req),input=erpPrepareSchema.safeParse(await boundedJSON(req));if(!input.success)throw new AppError('T-MAXX alanlarını ve sürüm bilgisini kontrol edin.',422);return json(await prepareErpBooking((await params).id,owner,input.data));}catch(e){return errorResponse(e);}}
export async function PUT(req:Request,{params}:Context){try{sameOrigin(req);const owner=await requireUser(req),input=z.object({runId:z.string().uuid()}).strict().safeParse(await boundedJSON(req));if(!input.success)throw new AppError('Önizleme kimliği geçersiz.',422);return json(await executeErpBooking((await params).id,owner,input.data.runId));}catch(e){return errorResponse(e);}}
export async function DELETE(req:Request,{params}:Context){try{sameOrigin(req);const owner=await requireUser(req),input=z.object({runId:z.string().uuid()}).strict().safeParse(await boundedJSON(req));if(!input.success)throw new AppError('Önizleme kimliği geçersiz.',422);await cancelErpPlan((await params).id,owner,input.data.runId);return json({cancelled:true});}catch(e){return errorResponse(e);}}
