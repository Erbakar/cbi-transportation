import { requireUser } from '@/lib/server/auth';
import { errorResponse, json, sameOrigin } from '@/lib/server/runtime';
import { boundedJSON } from '@/lib/server/bounded-json';
import { fieldWorkspace, saveField } from '@/lib/server/field-operation';
type Context={params:Promise<{id:string}>};
export async function GET(req:Request,ctx:Context){try{return json(await fieldWorkspace((await ctx.params).id,await requireUser(req)));}catch(e){return errorResponse(e);}}
export async function PUT(req:Request,ctx:Context){try{sameOrigin(req);return json(await saveField((await ctx.params).id,await requireUser(req),await boundedJSON(req,512000)));}catch(e){return errorResponse(e);}}
