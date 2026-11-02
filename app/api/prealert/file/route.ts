import {requireUser} from '@/lib/server/auth';
import {errorResponse} from '@/lib/server/runtime';
import {prealertFile} from '@/lib/server/prealert-upload';
export async function GET(req:Request){try{const file=await prealertFile(new URL(req.url).searchParams.get('id')||'',await requireUser(req));return new Response(file.bytes,{headers:{'Content-Type':'application/pdf','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(file.filename),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}catch(e){return errorResponse(e);}}
