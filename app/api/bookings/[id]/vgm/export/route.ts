import { requireUser } from '@/lib/server/auth';
import { errorResponse } from '@/lib/server/runtime';
import { exportVgm } from '@/lib/server/vgm';
export async function GET(req:Request,c:{params:Promise<{id:string}>}){try{return new Response(JSON.stringify(await exportVgm((await c.params).id,await requireUser(req)),null,2),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="CBI-VGM-reviewed.json"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}catch(e){return errorResponse(e);}}
