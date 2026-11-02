import { z } from 'zod';
import { bookingSchema, type BookingDraft } from './booking';
export const extractableFields = ['customer', 'shipper', 'loadPort', 'dischargePort', 'equipmentType', 'equipmentCount', 'incoterm', 'freightPayment', 'bookingNumber', 'vessel', 'voyage', 'shipperAddress', 'consigneeName', 'consigneeAddress', 'notifyName', 'notifyAddress'] as const;
export type ExtractableField = typeof extractableFields[number];
export const scheduleFields = ['etd', 'eta', 'siCutoff', 'vgmCutoff', 'customsCutoff', 'portCutoff', 'equipmentAvailable', 'emptyPickup', 'loading', 'terminalDelivery', 'atd', 'ata', 'transshipmentArrival', 'transshipmentDeparture', 'freeTimeStart', 'freeTimeEnd'] as const;
const scheduleEvidence = z.object({ value: z.string().trim().min(1).max(200), source: z.string().trim().min(1).max(3000), page: z.number().int().positive(), confidence: z.number().min(0).max(1) }).strict();
const commercialEvidence = z.object({ value: z.string().trim().min(1).max(2000), source: z.string().trim().min(1).max(3000), page: z.number().int().positive(), confidence: z.number().min(0).max(1) }).strict();
export const commercialLineSchema = z.object({
    description: z.string().trim().min(1).max(300), category: z.enum(['freight', 'origin', 'destination', 'surcharge', 'other']),
    amount: z.string().regex(/^\d{1,10}(\.\d{1,4})?$/).nullable(), currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
    basis: z.enum(['shipment', 'container', 'bl', 'kg', 'ton', 'other']), basisText: z.string().max(300),
    quantity: z.string().regex(/^\d{1,8}(\.\d{1,4})?$/).nullable(),
    source: z.string().trim().min(1).max(3000), page: z.number().int().positive(), confidence: z.number().min(0).max(1),
}).strict();
export const bookingExtractionSchema = z.object({
    documentType: z.enum(['quote', 'booking_request', 'booking_confirmation', 'booking_revision', 'other']),
    fields: z.array(z.object({ key: z.enum(extractableFields), value: z.string().max(2000).nullable(), source: z.string().max(3000), page: z.number().int().positive().nullable(), confidence: z.number().min(0).max(1) }).strict()).min(8).max(extractableFields.length),
    issues: z.array(z.string().max(1000)).max(30),
    routing: commercialEvidence.nullable().optional(),
    references: z.object({ carrier: commercialEvidence.nullable().optional(), booking: commercialEvidence.nullable().optional(), quote: commercialEvidence.nullable().optional(), sales: commercialEvidence.nullable().optional() }).strict().optional(),
    commercial: z.object({ lines: z.array(commercialLineSchema).max(100), validity: z.array(commercialEvidence).max(20), freeTime: z.array(commercialEvidence).max(20), exclusions: z.array(commercialEvidence).max(30), conditions: z.array(commercialEvidence).max(30) }).strict().optional(),
    // Optional for compatibility with archived eight- and sixteen-field results.
    schedule: z.object({ etd: scheduleEvidence.nullable().optional(), eta: scheduleEvidence.nullable().optional(), siCutoff: scheduleEvidence.nullable().optional(), vgmCutoff: scheduleEvidence.nullable().optional(), customsCutoff: scheduleEvidence.nullable().optional(), portCutoff: scheduleEvidence.nullable().optional(), equipmentAvailable: scheduleEvidence.nullable().optional(), emptyPickup: scheduleEvidence.nullable().optional(), loading: scheduleEvidence.nullable().optional(), terminalDelivery: scheduleEvidence.nullable().optional(), atd: scheduleEvidence.nullable().optional(), ata: scheduleEvidence.nullable().optional(), transshipmentArrival: scheduleEvidence.nullable().optional(), transshipmentDeparture: scheduleEvidence.nullable().optional(), freeTimeStart: scheduleEvidence.nullable().optional(), freeTimeEnd: scheduleEvidence.nullable().optional() }).strict().optional(),
}).strict().superRefine((data, ctx) => {
    for (const [key, label] of [['atd', /\bATD\b|actual departure|actual.*depart|gerçekleşen kalkış/i], ['ata', /\bATA\b|actual arrival|actual.*arriv|gerçekleşen varış/i]] as const) {
        const proof=data.schedule?.[key];
        if(proof && !label.test(proof.source)) ctx.addIssue({code:'custom',message:'Gerçekleşen tarih için açık gerçekleşme kaynağı gerekli.'});
    }
    if (new Set(data.fields.map(f => f.key)).size !== data.fields.length || ![8, extractableFields.length].includes(data.fields.length) || (data.fields.length === 8 && extractableFields.slice(0, 8).some(key => !data.fields.some(f => f.key === key))))
        ctx.addIssue({ code: 'custom', message: 'Alanlar eksik veya tekrarlı.' });
    for (const f of data.fields)
        if (f.value !== null && (!f.value.trim() || !f.source.trim() || f.page === null))
            ctx.addIssue({ code: 'custom', message: 'Dolu alan için kaynak alıntısı ve sayfa gerekli.' });
}).transform(data => ({ ...data, fields: extractableFields.map(key => data.fields.find(f => f.key === key) || { key, value: null, source: '', page: null, confidence: 0 }) }));
export type BookingExtraction = z.infer<typeof bookingExtractionSchema>;
export type ExtractionResult = {
    id: string;
    documentId: string;
    documentHash: string;
    model: string;
    createdAt: string;
    result: BookingExtraction;
};
export function selectedBookingFields(draft: BookingDraft, result: BookingExtraction, keys: ExtractableField[]) {
    if (result.documentType === 'other')
        throw new Error('Bu belge booking bilgileri için uygun değil.');
    if (!keys.length || new Set(keys).size !== keys.length)
        throw new Error('En az bir benzersiz alan seçin.');
    const next = { ...draft };
    for (const key of keys) {
        if (!extractableFields.includes(key))
            throw new Error('Alan aktarılamaz.');
        const field = result.fields.find(f => f.key === key);
        if (!field?.value || !field.source.trim() || field.page === null)
            throw new Error('Kaynağı olmayan alan aktarılamaz.');
        if (key === 'equipmentCount') {
            if (!/^[1-9][0-9]{0,2}$/.test(field.value))
                throw new Error('Ekipman adedi pozitif tam sayı olmalı.');
            next.equipmentCount = Number(field.value);
        }
        else
            Object.assign(next, { [key]: field.value });
    }
    return bookingSchema.parse(next);
}
