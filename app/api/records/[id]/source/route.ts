import { applyManual } from '@/lib/manual-extraction';
import { manualSchema } from '@/lib/manual';
import { requireUser } from '@/lib/server/auth';
import { owned } from '@/lib/server/records';
import { AppError, errorResponse, json, sameOrigin } from '@/lib/server/runtime';
import { prepareSource } from '@/lib/server/instruction-preparation';
import { tmaxxSource } from '@/lib/server/tmaxx-source';
// Read-only: never allocates a waybill or calls platform write endpoints.
export async function POST(req: Request, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    try {
        sameOrigin(req);
        const owner = await requireUser(req), row = await owned((await params).id, owner);
        const raw = await req.text();
        if (raw.length > 200000)
            throw new AppError('Alanlar çok uzun.', 413);
        const m = manualSchema.parse(JSON.parse(raw));
        if (!m.tmaxxReference)
            throw new AppError('T-MAXX pozisyon referansını girin.', 422);
        if (!row.extraction)
            throw new AppError('Önce belgeleri kontrol edin.', 422);
        const result = await tmaxxSource(owner, m.tmaxxReference, applyManual(JSON.parse(row.extraction), m));
        const prepared=await prepareSource(owner,m,result);
        const locations=prepared.locations;
        return json({ manual:prepared.manual, decisions:prepared.decisions, fields: result.ex.fields, containers: result.ex.containers, reference: result.reference, locations, hblRequired:result.ex.hblRequired, agentName:result.agentName, houseBillNumber:result.houseBillNumber, blReference:result.blReference, payments:result.payments,moveType:result.moveType });
    }
    catch (e) {
        return errorResponse(e);
    }
}
