import {storeArchivePage} from '@/lib/server/platform-history-cache';
import {requireUser} from '@/lib/server/auth';
import {AppError,errorResponse,json} from '@/lib/server/runtime';
import {recentPlatformDocuments} from '@/lib/server/recent-platform-documents';
export async function GET(req:Request){try{const owner=await requireUser(req),offset=Number(new URL(req.url).searchParams.get('offset')||0),documentOffset=new URL(req.url).searchParams.has('documentOffset')?Number(new URL(req.url).searchParams.get('documentOffset')):null;if(documentOffset!==null&&(!Number.isInteger(documentOffset)||documentOffset<0||documentOffset>12800))throw new AppError('Geçersiz belge sayfası.',400);if(!Number.isInteger(offset)||offset<0||offset>30)throw new AppError('Geçersiz sayfa.',400);const result=await recentPlatformDocuments(owner,offset,Date.now(),documentOffset);await storeArchivePage(owner,offset,documentOffset??0,result);return json(result);}catch(e){return errorResponse(e);}}
