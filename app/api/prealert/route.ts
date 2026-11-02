import {z} from 'zod';
import {requireUser} from '@/lib/server/auth';
import {AppError,errorResponse,json,sameOrigin} from '@/lib/server/runtime';
import {documentForm} from '@/lib/server/operation-documents';
import {boundedJSON} from '@/lib/server/bounded-json';
import {createPrealert,prealertList} from '@/lib/server/prealert-upload';
import {enqueuePrealert} from '@/lib/server/prealert-queue';
export async function GET(req:Request){try{return json({documents:await prealertList(await requireUser(req))});}catch(e){return errorResponse(e);}}
export async function POST(req:Request){try{sameOrigin(req);const owner=await requireUser(req),saved=await createPrealert(owner,await documentForm(req)),archive=await enqueuePrealert(saved.id,owner);return json({...saved,archive},archive.status==='synced'?201:202);}catch(e){return errorResponse(e);}}
export async function PUT(req:Request){try{sameOrigin(req);const owner=await requireUser(req),p=z.object({id:z.string().uuid()}).strict().safeParse(await boundedJSON(req,1024));if(!p.success)throw new AppError('Belge seçin.',422);return json({archive:await enqueuePrealert(p.data.id,owner)});}catch(e){return errorResponse(e);}}
