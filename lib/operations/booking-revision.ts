import type { BookingExtraction } from './booking-extraction';

const labels = {
    routing: 'Rota / aktarma limanları', carrier: 'Taşıyıcı',
    loadPort: 'Yükleme limanı', dischargePort: 'Boşaltma limanı', vessel: 'Gemi', voyage: 'Sefer',
    bookingNumber: 'Booking numarası', equipmentType: 'Ekipman tipi', equipmentCount: 'Ekipman adedi',
    incoterm: 'Incoterm', freightPayment: 'Navlun ödeme',
    etd: 'Tahmini kalkış (ETD)', eta: 'Tahmini varış (ETA)', siCutoff: 'Talimat cut-off',
    vgmCutoff: 'VGM cut-off', customsCutoff: 'Gümrük cut-off', portCutoff: 'Terminal cut-off',
    equipmentAvailable:'Ekipman uygunluğu', emptyPickup:'Boş konteyner alımı', loading:'Yükleme', terminalDelivery:'Terminal teslimi', atd:'Gerçek kalkış', ata:'Gerçek varış', transshipmentArrival:'Aktarma varışı', transshipmentDeparture:'Aktarma kalkışı', freeTimeStart:'Free time başlangıcı', freeTimeEnd:'Free time bitişi',
} as const;
type Evidence = { value: string; source: string; page: number | null };
export type BookingRevisionReport = {
    previousDocumentId: string | null;
    status: 'compared' | 'previous_unread' | 'no_previous' | 'unsupported';
    changes: { key: string; label: string; state: 'changed' | 'added' | 'not_found'; before: Evidence | null; after: Evidence | null }[];
};
const normalize = (s: string) => s.normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase();
function evidence(result: BookingExtraction, key: keyof typeof labels): Evidence | null {
    if (key === 'routing') return result.routing || null;
    if (key === 'carrier') return result.references?.carrier || null;
    if (key in (result.schedule || {})) return result.schedule?.[key as keyof NonNullable<BookingExtraction['schedule']>] || null;
    const field = result.fields.find(f => f.key === key);
    return field?.value != null ? { value: field.value, source: field.source, page: field.page } : null;
}
/** Compare the explicit predecessor, never an arbitrary peer or the edited booking draft. */
export function compareBookingRevision(current: BookingExtraction, previous: BookingExtraction | null, previousDocumentId: string | null): BookingRevisionReport {
    if (!['booking_confirmation', 'booking_revision'].includes(current.documentType))
        return { previousDocumentId, status: 'unsupported', changes: [] };
    if (!previousDocumentId) return { previousDocumentId, status: 'no_previous', changes: [] };
    if (!previous) return { previousDocumentId, status: 'previous_unread', changes: [] };
    if (!['booking_confirmation', 'booking_revision'].includes(previous.documentType))
        return { previousDocumentId, status: 'unsupported', changes: [] };
    const changes: BookingRevisionReport['changes'] = [];
    for (const key of Object.keys(labels) as (keyof typeof labels)[]) {
        const before = evidence(previous, key), after = evidence(current, key);
        if (!before && !after || before && after && normalize(before.value) === normalize(after.value)) continue;
        changes.push({ key, label: labels[key], state: !after ? 'not_found' : !before ? 'added' : 'changed', before, after });
    }
    return { previousDocumentId, status: 'compared', changes };
}
