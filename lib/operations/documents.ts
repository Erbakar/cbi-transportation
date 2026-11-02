import { z } from 'zod';
export const documentTypes = {
    quote: 'Teklif', booking_request: 'Booking talebi', booking_confirmation: 'Booking teyidi',
    booking_revision: 'Booking revizyonu', instruction: 'Müşteri talimatı', vgm: 'VGM',
    hbl_draft: 'HBL taslak', mbl_draft: 'MBL taslak', hbl_final: 'Final HBL', mbl_final: 'Final MBL',
    carrier_si: 'Taşıyıcı shipping instruction', sea_waybill: 'Sea Waybill', invoice: 'Fatura', delivery_order: 'Yük teslim belgesi', other: 'Diğer',
} as const;
export type DocumentType = keyof typeof documentTypes;
export const documentMetadata = z.object({
    type: z.enum(Object.keys(documentTypes) as [
        DocumentType,
        ...DocumentType[]
    ]),
    sourceReference: z.string().trim().min(1, 'Kaynak açıklaması gerekli.').max(500),
    replacesId: z.string().uuid().optional(),
}).strict();
export type OperationDocument = {
    id: string;
    bookingId: string;
    seriesId: string;
    version: number;
    replacesId: string | null;
    type: DocumentType;
    filename: string;
    size: number;
    sourceReference: string;
    createdAt: string;
    uploadedBy: string;
    isCurrent: boolean;
};
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export function documentMime(bytes: Uint8Array, name: string) {
    const extension = name.toLowerCase().split('.').pop();
    if (extension === 'pdf' && new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-')
        return 'application/pdf';
    if (['jpg', 'jpeg'].includes(extension || '') && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
        return 'image/jpeg';
    if (extension === 'png' && [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b))
        return 'image/png';
    throw new Error('Bu aşamada PDF, PNG veya JPEG yükleyin. Dosya içeriği uzantısıyla eşleşmelidir.');
}
export function safeFilename(name: string) { return name.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200) || 'belge'; }
