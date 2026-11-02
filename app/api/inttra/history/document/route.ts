import {requireUser} from '@/lib/server/auth';
import {inttraHistory} from '@/lib/server/inttra-history';
import {inttraDocument} from '@/lib/server/inttra-document';
import {AppError,errorResponse} from '@/lib/server/runtime';
export async function GET(req:Request){try{const owner=await requireUser(req),id=new URL(req.url).searchParams.get('id')||'';if(!/^\d{1,15}$/.test(id))throw new AppError('Geçersiz SI numarası.',400);const history=await inttraHistory(owner);if(!history.rows.some(r=>r.siId===id))throw new AppError('Belge bu hesabın son 30 günlük geçmişinde bulunamadı.',404);const bytes=await inttraDocument(owner,id);return new Response(bytes,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="INTTRA-${id}.pdf"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}catch(e){return errorResponse(e);}}
