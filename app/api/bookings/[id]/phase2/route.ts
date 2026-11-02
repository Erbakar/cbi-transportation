import { requireUser } from '@/lib/server/auth';
import { errorResponse, json, sameOrigin } from '@/lib/server/runtime';
import { boundedJSON } from '@/lib/server/bounded-json';
import { phase2Workspace, saveCosts } from '@/lib/server/booking-phase2';
type Context = {
    params: Promise<{
        id: string;
    }>;
};
export async function GET(req: Request, ctx: Context) { try {
    return json(await phase2Workspace((await ctx.params).id, await requireUser(req)));
}
catch (e) {
    return errorResponse(e);
} }
export async function PUT(req: Request, ctx: Context) { try {
    sameOrigin(req);
    return json(await saveCosts((await ctx.params).id, await requireUser(req), await boundedJSON(req)));
}
catch (e) {
    return errorResponse(e);
} }
