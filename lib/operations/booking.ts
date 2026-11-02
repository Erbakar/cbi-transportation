import { z } from 'zod';
const text = z.string().trim().max(200).refine(v => !/[\u0000-\u001f]/.test(v), 'Kontrol karakteri kullanılamaz.');
export const bookingSchema = z.object({
    salesReference: text.refine(v => v.length > 0, 'Satış referansı gerekli.'),
    customer: text, shipper: text, loadPort: text, dischargePort: text,
    equipmentType: z.enum(['', '20GP', '40GP', '40HC', '20RF', '40RF']),
    equipmentCount: z.number().int().min(0).max(999),
    incoterm: z.enum(['', 'EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP']),
    freightPayment: z.enum(['', 'prepaid', 'collect']),
    assignee: text,
    sourceReference: text,
    bookingNumber: text.default(''), vessel: text.default(''), voyage: text.default(''),
    shipperAddress: z.string().trim().max(2000).default(''),
    consigneeName: text.default(''), consigneeAddress: z.string().trim().max(2000).default(''),
    notifyName: text.default(''), notifyAddress: z.string().trim().max(2000).default(''),
    notes: z.string().trim().max(2000),
}).strict();
export type BookingDraft = z.infer<typeof bookingSchema>;
export const emptyBooking: BookingDraft = {
    bookingNumber: '', vessel: '', voyage: '', shipperAddress: '', consigneeName: '', consigneeAddress: '', notifyName: '', notifyAddress: '',
    salesReference: '', customer: '', shipper: '', loadPort: '', dischargePort: '',
    equipmentType: '', equipmentCount: 0, incoterm: '', freightPayment: '', assignee: '', sourceReference: '', notes: '',
};
export const bookingFields = [
    ['salesReference', 'Satış referansı'], ['customer', 'Müşteri'], ['shipper', 'Yükleyici'],
    ['loadPort', 'Yükleme limanı'], ['dischargePort', 'Boşaltma limanı'],
    ['equipmentType', 'Ekipman tipi'], ['equipmentCount', 'Ekipman adedi'],
    ['incoterm', 'Incoterm'], ['freightPayment', 'Navlun ödeme'], ['assignee', 'Operasyon sorumlusu'],
    ['sourceReference', 'Kaynak e-posta / belge referansı'],
] as const;
export const supplementaryBookingFields = [
    ['bookingNumber', 'Taşıyıcı booking numarası'], ['vessel', 'Gemi'], ['voyage', 'Sefer'],
    ['shipperAddress', 'Yükleyici adresi'], ['consigneeName', 'Alıcı'], ['consigneeAddress', 'Alıcı adresi'],
    ['notifyName', 'Notify'], ['notifyAddress', 'Notify adresi'],
] as const;
export function referenceKey(reference: string) {
    return reference.normalize('NFKC').trim().toLocaleUpperCase('tr-TR').replace(/\s+/g, ' ');
}
export function assessBooking(draft: BookingDraft) {
    const missing = bookingFields.filter(([key]) => !draft[key]).map(([key, label]) => ({ key, label }));
    // Completeness is independent from confirmation, approval and external transfer.
    return { status: missing.length ? 'incomplete' as const : 'review' as const, missing };
}
export type BookingItem = {
    id: string;
    revision: number;
    createdAt: string;
    updatedAt: string;
    draft: BookingDraft;
    assessment: ReturnType<typeof assessBooking>;
};
