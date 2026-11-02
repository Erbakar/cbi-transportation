import {requireUser} from '@/lib/server/auth';
import {errorResponse} from '@/lib/server/runtime';
import {downloadPrealert} from '@/lib/server/prealert';
export async function GET(req:Request,{params}:{params:Promise<{id:string;packageId:string}>}){try{const {id,packageId}=await params;return new Response(await downloadPrealert(id,await requireUser(req),packageId),{headers:{'Content-Type':'message/rfc822','Content-Disposition':'attachment; filename="pre-alert-'+packageId+'.eml"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}catch(e){return errorResponse(e);}}
