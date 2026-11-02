import {z} from 'zod';
import {containerValid} from '../domain';
import {kgSchema} from './vgm';
import type {exportVgm} from '../server/vgm';
const short=z.string().trim().min(1).refine(v=>new TextEncoder().encode(v).length<=50,'En fazla 50 byte girilebilir.');
export const cmaVgmInput=z.object({approvalId:z.string().uuid(),carrierBooking:z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,30}$/,'Armatör booking numarasını girin.'),method:z.enum(['SM1','SM2']),signature:short,certificate:z.string().trim().refine(v=>new TextEncoder().encode(v).length<=50,'Sertifika en fazla 50 byte olabilir.'),confirmed:z.literal(true)}).strict();
export function cmaVgmPayload(review:Awaited<ReturnType<typeof exportVgm>>,raw:unknown){
 const input=cmaVgmInput.parse(raw),row=review.containers.find(c=>c.approvalId===input.approvalId);
 if(!row)throw Error('Güncel VGM onayı bulunamadı.');
 return {carrier:'cma-cgm' as const,booking:input.carrierBooking,container:row.containerNumber,vgmKg:row.verifiedGrossMassKg,tareKg:row.containerTareKg,unit:'KGM' as const,method:input.method,signature:input.signature,certificate:input.certificate,approvalId:row.approvalId,sourceDocumentHash:row.sourceDocumentHash};
}
export const manualVgmInput=z.object({
 carrierBooking:cmaVgmInput.shape.carrierBooking,
 container:z.string().trim().toUpperCase().refine(containerValid,'Geçerli konteyner numarasını girin.'),
 vgmKg:kgSchema.refine(v=>Number(v)>0,'VGM sıfır olamaz.'),signature:short,
 method:z.enum(['','SM1','SM2']).default(''),certificate:cmaVgmInput.shape.certificate.default(''),confirmed:z.literal(true)
}).strict();
export function manualVgmPayload(raw:unknown){const p=manualVgmInput.parse(raw);return {source:'manual' as const,carrier:'cma-cgm' as const,booking:p.carrierBooking,container:p.container,vgmKg:p.vgmKg,unit:'KGM' as const,method:p.method,signature:p.signature,certificate:p.certificate};}
export type CmaVgmPayload=ReturnType<typeof cmaVgmPayload>|ReturnType<typeof manualVgmPayload>;
export const cmaJobStates=['queued','preparing','prepared','submit_queued','submitting','submitted','blocked','unknown'] as const;
export type CmaJobState=typeof cmaJobStates[number];
