import { z } from 'zod';
import type { BookingDraft } from './booking';
import type { BookingExtraction } from './booking-extraction';
export type MatchCandidate = {
    id: string;
    reference: string;
    reasons: string[];
    conflicts: string[];
};
const normalized = (v: string) => v.normalize('NFKC').trim().toUpperCase().replace(/\s+/g, ' ');
export function matchBooking(result: BookingExtraction, bookings: {
    id: string;
    draft: BookingDraft;
    evidence: BookingExtraction[];
}[]) {
    const candidates: MatchCandidate[] = [];
    const refs = result.references;
    const incoming = { booking: refs?.booking?.value || result.fields.find(f => f.key === 'bookingNumber')?.value, sales: refs?.sales?.value, quote: refs?.quote?.value, carrier: refs?.carrier?.value };
    for (const b of bookings) {
        const values = {
            sales: [b.draft.salesReference], booking: [b.draft.bookingNumber, ...b.evidence.map(e => e.references?.booking?.value || e.fields.find(f => f.key === 'bookingNumber')?.value || '')],
            quote: b.evidence.map(e => e.references?.quote?.value || ''), carrier: b.evidence.map(e => e.references?.carrier?.value || ''),
        };
        const reasons: string[] = [], conflicts: string[] = [];
        for (const key of ['sales', 'booking', 'quote', 'carrier'] as const) {
            const value = incoming[key];
            if (!value)
                continue;
            const known = [...new Set(values[key].filter(Boolean).map(normalized))];
            if (known.includes(normalized(value)))
                reasons.push(key);
            else if (known.length)
                conflicts.push(key);
        }
        // A carrier or party match alone never identifies a shipment.
        if (reasons.some(k => k !== 'carrier'))
            candidates.push({ id: b.id, reference: b.draft.salesReference, reasons, conflicts });
    }
    const clean = candidates.filter(c => !c.conflicts.length);
    const evidence = [refs?.booking, refs?.sales, refs?.quote].filter(Boolean);
    const uncertain = result.issues.some(issue => /referans|booking|taşıyıcı|belge tür/i.test(issue) && /belirsiz|çelişk|birden fazla|uyuşmaz/i.test(issue)) || evidence.some(e => e!.confidence < .9 || !normalized(e!.source).includes(normalized(e!.value))) || (!refs?.booking && !!incoming.booking && (result.fields.find(f => f.key === 'bookingNumber')?.confidence || 0) < .9);
    return { candidates, automaticId: candidates.length === 1 && clean.length === 1 && !uncertain && ['booking_confirmation', 'booking_revision'].includes(result.documentType) ? clean[0].id : null };
}
export function bookingLifecycle(documents: {
    type: string;
    current: boolean;
    result: BookingExtraction | null;
}[]) {
    const read = documents.filter(d => d.current && d.result && d.type === d.result.documentType);
    if (read.some(d => d.type === 'booking_revision'))
        return 'revision_received';
    if (read.some(d => d.type === 'booking_confirmation'))
        return 'confirmation_received';
    if (read.some(d => d.type === 'booking_request'))
        return 'request';
    return 'draft';
}
export const lifecycleLabels: Record<string, string> = { draft: 'Taslak', request: 'Talep', confirmation_received: 'Teyit alındı · inceleme bekliyor', revision_received: 'Revizyon alındı · inceleme bekliyor' };
const decimal = z.string().regex(/^\d{1,10}(\.\d{1,4})?$/);
export const costDecisionSchema = z.object({
    revision: z.number().int().nonnegative(), documentId: z.string().uuid(), extractionId: z.string().uuid(), evidenceRevision: z.number().int().nonnegative(),
    verified: z.literal(true), reason: z.string().trim().min(15).max(1000),
    lines: z.array(z.object({ index: z.number().int().min(0).max(99), quantity: decimal.nullable(), tariffCode: z.string().trim().max(100), tariffName: z.string().trim().max(200), tariffVerified: z.boolean() }).strict()).min(1).max(100),
}).strict().superRefine((v, ctx) => { if (new Set(v.lines.map(l => l.index)).size !== v.lines.length)
    ctx.addIssue({ code: 'custom', message: 'Maliyet satırı tekrarlanamaz.' }); for (const l of v.lines)
    if ((l.tariffCode || l.tariffName || l.tariffVerified) && (!l.tariffCode || !l.tariffName || !l.tariffVerified))
        ctx.addIssue({ code: 'custom', message: 'Tarife kodu ve adı birlikte, T-MAXX kaynağından doğrulanmalı.' }); });
// Decimal arithmetic: no binary floating point, implicit quantity, currency conversion or mixed-currency totals.
export function costTotal(amount: string | null, quantity: string | null) {
    if (amount === null || quantity === null)
        return null;
    const parse = (s: string) => { const [a, b = ''] = s.split('.'); return { n: BigInt(a + b), scale: b.length }; };
    const a = parse(amount), q = parse(quantity), scale = a.scale + q.scale;
    let text = (a.n * q.n).toString().padStart(scale + 1, '0');
    if (scale)
        text = text.slice(0, -scale) + '.' + text.slice(-scale);
    return text.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}
