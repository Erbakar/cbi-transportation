import {recoverBookingDocument} from '@/lib/server/tmaxx-document-recovery';
import {z} from 'zod';
import {requireUser} from '@/lib/server/auth';
import {AppError,db,errorResponse,json,sameOrigin} from '@/lib/server/runtime';
import {boundedJSON} from '@/lib/server/bounded-json';
import {bookingTmaxxLink,linkBookingTmaxx,linkInput,syncBookingDocument,tmaxxArchiveTypes} from '@/lib/server/booking-tmaxx';
import {readTmaxxPosition} from '@/lib/server/tmaxx-workspace';
type Context={params:Promise<{id:string}>};
export async function GET(req:Request,{params}:Context){try{const owner=await requireUser(req),{id}=await params,link=await bookingTmaxxLink(id,owner);const jobs=await db().prepare(`SELECT document_id,remote_id,verified_at,type_id,EXISTS(SELECT 1 FROM booking_tmaxx_steps s WHERE s.document_id=booking_tmaxx_documents.document_id AND s.status IN ('sending','unknown')) uncertain FROM booking_tmaxx_documents WHERE booking_id=? AND owner=?`).bind(id,owner).all();return json({link,jobs:jobs.results,...(link?{snapshot:await readTmaxxPosition(owner,link.position_reference),types:await tmaxxArchiveTypes(owner)}:{snapshot:null,types:[]})});}catch(e){return errorResponse(e);}}
export async function POST(req:Request,{params}:Context){try{sameOrigin(req);const owner=await requireUser(req),{id}=await params,input=linkInput.safeParse(await boundedJSON(req));if(!input.success)throw new AppError('Pozisyon, yük ve kayıt sürümünü kontrol edin.',422);return json({link:await linkBookingTmaxx(id,owner,input.data)});}catch(e){return errorResponse(e);}}
export async function PUT(req:Request,{params}:Context){try{sameOrigin(req);const owner=await requireUser(req),{id}=await params,input=z.object({documentId:z.string().uuid(),typeId:z.number().int().positive()}).strict().safeParse(await boundedJSON(req));if(!input.success)throw new AppError('Belge ve T-MAXX türünü kontrol edin.',422);return json(await syncBookingDocument(id,owner,input.data.documentId,input.data.typeId));}catch(e){return errorResponse(e);}}

export async function PATCH(req:Request,{params}:Context){try{sameOrigin(req);const owner=await requireUser(req),{id}=await params,input=z.object({documentId:z.string().uuid()}).strict().safeParse(await boundedJSON(req));if(!input.success)throw new AppError('Belge kimliğini kontrol edin.',422);return json(await recoverBookingDocument(id,owner,input.data.documentId));}catch(e){return errorResponse(e);}}
