import { requireUser } from '@/lib/server/auth';
import { errorResponse,json,sameOrigin } from '@/lib/server/runtime';
import { boundedJSON } from '@/lib/server/bounded-json';
import { vgmWorkspace,saveVgm } from '@/lib/server/vgm';
type C={params:Promise<{id:string}>};
export async function GET(req:Request,c:C){try{return json(await vgmWorkspace((await c.params).id,await requireUser(req)));}catch(e){return errorResponse(e);}}
export async function PUT(req:Request,c:C){try{sameOrigin(req);return json(await saveVgm((await c.params).id,await requireUser(req),await boundedJSON(req)));}catch(e){return errorResponse(e);}}
