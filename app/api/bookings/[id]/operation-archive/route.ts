import {z} from 'zod';
import {requireUser} from '@/lib/server/auth';
import {AppError,errorResponse,json,sameOrigin} from '@/lib/server/runtime';
import {documentForm} from '@/lib/server/operation-documents';
import {boundedJSON} from '@/lib/server/bounded-json';
import {operationArchiveWorkspace,uploadOperationArchive,retryOperationArchive} from '@/lib/server/operation-archive';
type Context={params:Promise<{id:string}>};
export async function GET(req:Request,{params}:Context){try{return json(await operationArchiveWorkspace((await params).id,await requireUser(req)));}catch(e){return errorResponse(e);}}
export async function POST(req:Request,{params}:Context){try{sameOrigin(req);const owner=await requireUser(req),id=(await params).id,form=await documentForm(req),purpose=z.enum(['hbl_approval','prealert']).safeParse(form.get('purpose'));if(!purpose.success)throw new AppError('Arşiv türü geçersiz.',422);const result=await uploadOperationArchive(id,owner,purpose.data,form);return json(result,result.archive.status==='pending'?202:201);}catch(e){return errorResponse(e);}}
export async function PUT(req:Request,{params}:Context){try{sameOrigin(req);const owner=await requireUser(req),id=(await params).id,input=z.object({documentId:z.string().uuid(),recover:z.boolean()}).strict().safeParse(await boundedJSON(req));if(!input.success)throw new AppError('Arşiv işlemi geçersiz.',422);return json(await retryOperationArchive(id,owner,input.data.documentId,input.data.recover));}catch(e){return errorResponse(e);}}
