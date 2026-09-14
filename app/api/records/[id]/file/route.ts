import {requireUser} from '@/lib/server/auth';
import {errorResponse} from '@/lib/server/runtime';
import {fileFor,owned} from '@/lib/server/records';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{const owner=await requireUser(req);const r=await owned((await params).id,owner),file=await fileFor(r);return new Response(file.body,{headers:{'Content-Type':r.mime,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(r.filename)}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}catch(e){return errorResponse(e)}}
