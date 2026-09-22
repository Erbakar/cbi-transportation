import { applyManual } from '@/lib/manual-extraction';
import { manualSchema } from '@/lib/manual';
import { requireUser } from '@/lib/server/auth';
import { owned } from '@/lib/server/records';
import { AppError, errorResponse, json, sameOrigin } from '@/lib/server/runtime';
import { inttraRequest } from '@/lib/server/inttra-workflow';
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
        const locations: Record<string, string> = {};
        for (const key of ['loadPort', 'dischargePort','origin','destination'] as const) {
            const raw = result.ports[key] || result.ex.fields[key]?.value || '';
            const query = raw.replace(/^TCEEGE-/, '').replace(/^SOCAR\s+/, '').replace(/\s+-\s+[A-Z]{2,3}\s+-.*$/, '').trim();
            if (query.length < 3 || query.length > 100)
                continue;
            try {
                const response = await inttraRequest(owner, '/siact/geographySi', query) as {
                    cities?: string[][];
                };
                const exact = (response.cities || []).filter(([label]) => label.split(',')[0].trim().toUpperCase() === query.toUpperCase());
                if (exact.length === 1)
                    locations[key] = exact[0][1];
            }
            catch { /* Reference import remains available when INTTRA lookup is unavailable. */ }
        }
        if(!locations.destination&&['1','2'].includes(m.moveType)&&!result.ports.destination&&locations.dischargePort)locations.destination=locations.dischargePort;
        return json({ fields: result.ex.fields, containers: result.ex.containers, reference: result.reference, locations, hblRequired:result.ex.hblRequired, agentName:result.agentName, houseBillNumber:result.houseBillNumber, blReference:result.blReference, payments:result.payments,moveType:result.moveType });
    }
    catch (e) {
        return errorResponse(e);
    }
}
