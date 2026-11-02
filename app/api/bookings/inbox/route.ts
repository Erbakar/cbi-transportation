import {inboxTmaxxStates,transferInboxDocument} from '@/lib/server/inbox-tmaxx';
import { z } from 'zod';
import { requireUser } from '@/lib/server/auth';
import { errorResponse, json, sameOrigin } from '@/lib/server/runtime';
import { documentForm } from '@/lib/server/operation-documents';
import { boundedJSON } from '@/lib/server/bounded-json';
import { downloadInbox, inboxList, uploadInbox, readInbox, attachInbox } from '@/lib/server/booking-phase2';
async function list(owner:string){const items=await inboxList(owner),states=await inboxTmaxxStates(owner);return items.map(item=>({...item,tmaxx:states[item.id]||null}));}
export async function GET(req: Request) { try {
    const owner = await requireUser(req), id = new URL(req.url).searchParams.get('id');
    if (id)
        return await downloadInbox(id, owner);
    return json({ items: await list(owner) });
}
catch (e) {
    return errorResponse(e);
} }
export async function POST(req: Request) { try {
    sameOrigin(req);
    const owner = await requireUser(req);
    const id = await uploadInbox(owner, await documentForm(req));
    return json({ id }, 201);
}
catch (e) {
    return errorResponse(e);
} }
export async function PUT(req: Request) {
    try {
        sameOrigin(req);
        const owner = await requireUser(req);
        const input = z.discriminatedUnion('action', [
            z.object({action:z.literal('sync'),id:z.string().uuid(),typeId:z.number().int().positive().max(Number.MAX_SAFE_INTEGER)}).strict(),
            z.object({action:z.literal('recover'),id:z.string().uuid()}).strict(),
            z.object({ action: z.literal('read'), id: z.string().uuid() }).strict(),
            z.object({ action: z.literal('attach'), id: z.string().uuid(), bookingId: z.string().uuid(), reason: z.string().trim().min(15).max(1000), replacesId: z.string().uuid().nullable() }).strict(),
        ]).parse(await boundedJSON(req));
        if(input.action==='sync'||input.action==='recover'){const transfer=await transferInboxDocument(input.id,owner,input.action,input.action==='sync'?input.typeId:undefined);return json({items:await list(owner),transfer});}
        if (input.action === 'read')
            await readInbox(input.id, owner);
        else
            await attachInbox(input.id, owner, input.bookingId, 'manual', input.reason, input.replacesId);
        return json({ items: await list(owner) });
    }
    catch (e) {
        return errorResponse(e);
    }
}
