import type { BookingExtraction } from './booking-extraction';
type Commercial = NonNullable<BookingExtraction['commercial']>;
// These printed quotation section headers are totals, including amounts converted to the quote currency.
// They remain visible as evidence, but cannot become additional cost rows alongside their details.
export function isQuoteSummary(description: string) {
    const value = description.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
    return /^(subtotal(?: per container)?|total(?: price)?|all in rate(?: total price)?|charges payable as per freight|charges payable at import)$/.test(value);
}
export function separateQuoteSummaries(commercial: Commercial): Commercial {
    const summary = commercial.lines.filter(l => isQuoteSummary(l.description));
    return { ...commercial, lines: commercial.lines.filter(l => !isQuoteSummary(l.description)), conditions: [...commercial.conditions, ...summary.map(l => ({ value: `${l.description}: ${l.amount ?? 'Belirsiz'} ${l.currency ?? ''} / ${l.basisText || l.basis} — ara toplam; ek maliyet değildir.`, source: l.source, page: l.page, confidence: l.confidence }))] };
}
