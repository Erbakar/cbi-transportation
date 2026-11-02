import { z } from 'zod';
import { containerValid } from '../domain';
import { validDate,validZone,zonedInstant } from './schedule';
export const vgmLabels={documentNumber:'VGM belge numarası',weighedAt:'Tartım tarihi ve saati',containerNumber:'Konteyner numarası',tare:'Konteyner darası',cargo:'Yük brüt ağırlığı',vgm:'Doğrulanmış brüt ağırlık (VGM)',company:'Tartım firması',person:'Yetkili kişi',vehicle:'Araç',plate:'Plaka',terminal:'Liman / terminal'} as const;
export const vgmKeys=Object.keys(vgmLabels) as [keyof typeof vgmLabels,...(keyof typeof vgmLabels)[]];
const evidence=z.object({value:z.string().trim().max(1000).nullable(),unit:z.enum(['kg','t','lb']).nullable(),source:z.string().max(2000),page:z.number().int().positive().nullable(),confidence:z.number().min(0).max(1)}).strict().superRefine((v,c)=>{if(v.value&&(!v.source||!v.page))c.addIssue({code:'custom',message:'Dolu OCR alanında kaynak ve sayfa gerekli.'});});
export const vgmReadingSchema=z.object({documentType:z.enum(['vgm','other']),rows:z.array(z.object(Object.fromEntries(vgmKeys.map(k=>[k,evidence])) as Record<typeof vgmKeys[number],typeof evidence>).strict()).max(100),issues:z.array(z.string().max(1000)).max(30)}).strict();
export type VgmReading=z.infer<typeof vgmReadingSchema>;
export const kgSchema=z.string().regex(/^(?:0|[1-9]\d{0,5})(?:\.\d{1,3})?$/,'Ağırlığı kg olarak, ondalık ayırıcı nokta ile girin.').refine(v=>Number(v)<=100000,'Ağırlık sınırı 100.000 kg.');
export function grams(value:string){if(!kgSchema.safeParse(value).success)throw new Error('Geçersiz kg değeri.');const [a,b='']=value.split('.');return Number(a)*1000+Number(b.padEnd(3,'0'));}
export function kg(value:number){return (value/1000).toFixed(3).replace(/\.?0+$/,'');}
export function normalizeMass(value:string|null,unit:string|null):string{
 if(!value||!unit||!/^\d+(?:\.\d+)?$/.test(value))return '';
 const n=Number(value)*(unit==='kg'?1:unit==='t'?1000:unit==='lb'?0.45359237:NaN);
 if(!Number.isFinite(n)||n<0||n>100000)return '';
 return (Math.round(n*1000)/1000).toFixed(3).replace(/\.?0+$/,'');
}
const text=z.string().trim().min(1).max(500);
export const vgmValuesSchema=z.object({
 documentNumber:text,containerNumber:text.refine(containerValid,'Konteyner kontrol hanesi geçersiz.'),
 weighedAt:z.string().refine(v=>/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(v)&&validDate(v.slice(0,10)),'Tartım tarihi ve saati gerekli.'),
 zone:z.string().refine(validZone,'Saat dilimi gerekli.'),tareKg:kgSchema.refine(v=>Number(v)>0,'Dara sıfır olamaz.'),
 cargoKg:kgSchema,vgmKg:kgSchema.refine(v=>Number(v)>0,'VGM sıfır olamaz.'),
 company:text,person:text,vehicle:z.string().trim().max(500),plate:z.string().trim().max(500),terminal:z.string().trim().max(500),
 toleranceKg:kgSchema,referenceCargoKg:kgSchema,referenceReason:text,
}).strict().superRefine((v,c)=>{try{zonedInstant(v.weighedAt.slice(0,10),v.weighedAt.slice(11),v.zone);}catch(e){c.addIssue({code:'custom',message:(e as Error).message});}});
export type VgmValues=z.infer<typeof vgmValuesSchema>;
export function vgmCheck(v:VgmValues){
 const tare=grams(v.tareKg),cargo=grams(v.cargoKg),actual=grams(v.vgmKg),tolerance=grams(v.toleranceKg),reference=grams(v.referenceCargoKg);
 const expected=tare+cargo,difference=Math.abs(actual-expected),cargoDifference=Math.abs(cargo-reference);
 return {expectedKg:kg(expected),differenceKg:kg(difference),cargoDifferenceKg:kg(cargoDifference),passes:actual>=tare&&difference<=tolerance&&cargoDifference<=tolerance,errors:[...(actual<tare?['VGM konteyner darasından küçük olamaz.']:[]),...(difference>tolerance?['VGM ile yük + dara farkı toleransı aşıyor.']:[]),...(cargoDifference>tolerance?['Belgedeki yük ağırlığı ile sevkiyat yük ağırlığı farkı toleransı aşıyor.']:[])]};
}
export function readingWarnings(row:VgmReading['rows'][number]){
 return vgmKeys.filter(k=>!row[k].value||row[k].confidence<.95).map(k=>vgmLabels[k]+': '+(row[k].value?'düşük okuma güveni':'belgede bulunamadı'));
}
export const vgmActionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('read'),documentId:z.string().uuid()}).strict(),
 z.object({action:z.literal('approve'),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),readingId:z.string().uuid(),rowIndex:z.number().int().nonnegative(),values:vgmValuesSchema,reviewed:z.literal(true),reason:z.string().trim().min(5).max(2000)}).strict(),
 z.object({action:z.literal('revoke'),approvalId:z.string().uuid(),reason:z.string().trim().min(5).max(2000)}).strict()
]);
