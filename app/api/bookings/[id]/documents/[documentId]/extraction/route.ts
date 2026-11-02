import { DOCUMENT_POLICY_VERSION } from '@/lib/operations/document-policy';
import { z } from 'zod';
import { requireUser } from '@/lib/server/auth';
import { AppError, db, errorResponse, json, sameOrigin } from '@/lib/server/runtime';
import { extractionDocument, getExtraction, readBookingDocument, applyBookingExtraction, assessExtraction } from '@/lib/server/booking-extraction';
import { extractableFields } from '@/lib/operations/booking-extraction';
type Context = {
    params: Promise<{
        id: string;
        documentId: string;
    }>;
};
async function context(req: Request, ctx: Context) { const owner = await requireUser(req), { id, documentId } = await ctx.params; return { owner, doc: await extractionDocument(id, documentId, owner) }; }
export async function GET(req: Request, ctx: Context) {
    try {
        const { doc } = await context(req, ctx);
        const historyId = new URL(req.url).searchParams.get('historyId');
        if (historyId) {
            const history = await db().prepare('SELECT id,result,model,created_at FROM booking_extraction_history WHERE id=? AND document_id=?').bind(historyId, doc.id).first();
            if (!history) throw new AppError('Önceki okuma bulunamadı.', 404);
            return json({ historical: true, documentId: doc.id, ...history });
        }
        const extraction = await getExtraction(doc);
        return json({ extraction, assessment: extraction ? await assessExtraction(doc, extraction) : null });
    }
    catch (e) {
        return errorResponse(e);
    }
}
export async function POST(req: Request, ctx: Context) {
    try {
        sameOrigin(req);
        const { doc } = await context(req, ctx);
        const extraction = await readBookingDocument(doc, new URL(req.url).searchParams.get('refresh') === '1');
        return json({ extraction, assessment: await assessExtraction(doc, extraction) });
    }
    catch (e) {
        return errorResponse(e);
    }
}
export async function PUT(req: Request, ctx: Context) {
    try {
        sameOrigin(req);
        const { doc, owner } = await context(req, ctx);
        const reader = req.body?.getReader();
        if (!reader)
            throw new AppError('Seçilen alanlar gerekli.');
        let text = '';
        let size = 0;
        const decoder = new TextDecoder();
        while (true) {
            const p = await reader.read();
            if (p.done)
                break;
            size += p.value.byteLength;
            if (size > 4096) {
                await reader.cancel();
                throw new AppError('İstek çok uzun.', 413);
            }
            text += decoder.decode(p.value, { stream: true });
        }
        text += decoder.decode();
        let raw;
        try {
            raw = JSON.parse(text);
        }
        catch {
            throw new AppError('İstek geçersiz.');
        }
        const parsed = z.object({ mode: z.enum(['review', 'draft']).default('review'), extractionId: z.string().uuid(), revision: z.number().int().positive(), fields: z.array(z.enum(extractableFields)).min(1).max(extractableFields.length), sourceVerifiedFields: z.array(z.enum(extractableFields)).max(extractableFields.length), reason: z.string().trim().max(1000), evidenceRevision: z.number().int().nonnegative(), policyVersion: z.literal(DOCUMENT_POLICY_VERSION) }).strict().safeParse(raw);
        if (!parsed.success)
            throw new AppError('Seçilen alanlar geçersiz.');
        return json({ booking: await applyBookingExtraction(doc, owner, parsed.data.extractionId, parsed.data.revision, parsed.data.fields, parsed.data.sourceVerifiedFields, parsed.data.reason, parsed.data.evidenceRevision, parsed.data.mode) });
    }
    catch (e) {
        return errorResponse(e);
    }
}
