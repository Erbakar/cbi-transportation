import { z } from 'zod';
import { containerValid } from '../domain';
import { validDate, validZone, zonedInstant, eventLabels, type ScheduleTask } from './schedule';
import type { BookingDraft } from './booking';

const text = z.string().trim().max(500).refine(v => !/[\u0000-\u0008\u000b-\u001f]/.test(v), 'Geçersiz karakter.');
const note = z.string().trim().max(3000);
const moment = z.string().refine(v => !v || /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(v) && validDate(v.slice(0,10)), 'Tarih ve saat geçersiz.');
export const commonLabels = {
 bookingNumber:'Booking numarası', shipper:'Yükleyici', vessel:'Gemi', voyage:'Sefer',
 loadPort:'Yükleme limanı', dischargePort:'Boşaltma limanı', equipment:'Ekipman',
 carrier:'Armatör', loadingAddress:'Yükleme adresi', loadingContact:'Yükleme irtibatı',
 emptyDepot:'Boş konteyner alım yeri', terminal:'Dolu teslim terminali',
 customs:'Gümrük / gümrükçü', documents:'Evrak teslim bilgileri',
} as const;
export type CommonKey = keyof typeof commonLabels;
const commonKeys = Object.keys(commonLabels) as [CommonKey,...CommonKey[]];
export const containerSchema = z.object({
 id:z.string().uuid(), number:text.refine(v=>!v || containerValid(v),'Konteyner numarası / kontrol hanesi geçersiz.'),
 type:text, seal:text, transporter:text, vehicle:text, plate:text, driver:text, phone:text,
 emptyPickup:moment, loadingStart:moment, loadingEnd:moment, gateIn:moment,
 note, cancelled:z.boolean(),
}).strict();
export const incidentSchema = z.object({
 id:z.string().uuid(), containerId:z.string().uuid().or(z.literal('')), kind:z.enum(['waiting','problem']),
 start:moment.refine(Boolean,'Başlangıç zamanı gerekli.'), end:moment, description:note.refine(Boolean,'Açıklama gerekli.'),
 resolution:note, status:z.enum(['open','resolved']),
}).strict();
export const fieldSchema = z.object({
 overrides:z.record(z.enum(commonKeys),text), zone:z.string().refine(validZone,'Geçerli saat dilimi gerekli.'),
 instructions:note, containers:z.array(containerSchema).max(100), incidents:z.array(incidentSchema).max(100),
}).strict().superRefine((v,c)=>{
 const seen = new Set<string>(), ids = new Set<string>();
 for(const row of v.containers){
  if(ids.has(row.id)) c.addIssue({code:'custom',message:'Konteyner satır kimliği tekrar ediyor.'}); ids.add(row.id);
  const number=row.number.replace(/[\s-]/g,'').toUpperCase();
  if(!row.cancelled && number && seen.has(number)) c.addIssue({code:'custom',message:'Konteyner numarası tekrar ediyor.'});
  if(!row.cancelled && number) seen.add(number);
  let last=-Infinity;
  for(const key of ['emptyPickup','loadingStart','loadingEnd','gateIn'] as const) if(row[key]){
   try { const value=zonedInstant(row[key].slice(0,10),row[key].slice(11),v.zone);
    if(value<last)c.addIssue({code:'custom',message:'Saha saatleri boş alım → yükleme başlangıç/bitiş → dolu giriş sırasına uymalı.'});last=value;
   }catch(e){c.addIssue({code:'custom',message:(e as Error).message});}
  }
 }
 const incidents=new Set<string>();
 for(const issue of v.incidents){
  if(incidents.has(issue.id))c.addIssue({code:'custom',message:'Olay kimliği tekrar ediyor.'});incidents.add(issue.id);
  if(issue.containerId&&!ids.has(issue.containerId))c.addIssue({code:'custom',message:'Olayın konteyneri bulunamadı.'});
  if(issue.status==='resolved'&&(!issue.end||!issue.resolution))c.addIssue({code:'custom',message:'Kapanan olayda bitiş ve çözüm gerekli.'});
  try {const begin=zonedInstant(issue.start.slice(0,10),issue.start.slice(11),v.zone);
   if(issue.end&&zonedInstant(issue.end.slice(0,10),issue.end.slice(11),v.zone)<begin)c.addIssue({code:'custom',message:'Olay bitişi başlangıçtan önce olamaz.'});
  }catch(e){c.addIssue({code:'custom',message:(e as Error).message});}
 }
});
export type FieldData=z.infer<typeof fieldSchema>;
export type FieldContainer=z.infer<typeof containerSchema>;
export type FieldIncident=z.infer<typeof incidentSchema>;
export function emptyField():FieldData{return {overrides:{},zone:'Europe/Istanbul',instructions:'',containers:[],incidents:[]};}
export function emptyContainer():FieldContainer{return {id:crypto.randomUUID(),number:'',type:'',seal:'',transporter:'',vehicle:'',plate:'',driver:'',phone:'',emptyPickup:'',loadingStart:'',loadingEnd:'',gateIn:'',note:'',cancelled:false};}
export type FieldSource={reference:string;positionId:number;goodId:number;goodReference:string;checkedAt:string;values:Partial<Record<CommonKey,string>>;containers:{id:number;number:string;type:string;seal:string;cargoGrossKg?:string;tareKg?:string}[]};
export const outputLabels = {reservation:'Yükleyici–gümrükçü rezervasyon notası',transport:'Nakliyeci yükleme talimatı',pickup:'Boş konteyner alım bilgisi',terminal:'Dolu konteyner ve evrak teslim bilgisi',confirmation:'Yükleme teyit e-postası',request:'Konteyner ve mühür bilgi talebi'} as const;
export type OutputKind=keyof typeof outputLabels;
export const outputKinds=Object.keys(outputLabels) as [OutputKind,...OutputKind[]];
export function commonValues(booking:BookingDraft,source:FieldSource|null,field:FieldData):Record<CommonKey,string>{
 const base:Record<CommonKey,string>={bookingNumber:booking.bookingNumber,shipper:booking.shipper,vessel:booking.vessel,voyage:booking.voyage,loadPort:booking.loadPort,dischargePort:booking.dischargePort,equipment:booking.equipmentCount ? booking.equipmentCount+' × '+booking.equipmentType : booking.equipmentType,carrier:'',loadingAddress:booking.shipperAddress,loadingContact:'',emptyDepot:'',terminal:'',customs:'',documents:''};
 return {...base,...source?.values,...field.overrides};
}
export function buildFieldOutput(kind:OutputKind,booking:BookingDraft,source:FieldSource|null,field:FieldData,tasks:ScheduleTask[]){
 const values=commonValues(booking,source,field), active=field.containers.filter(c=>!c.cancelled);
 const required:CommonKey[]=kind==='reservation'?['bookingNumber','shipper','loadPort','dischargePort','equipment']:kind==='transport'?['bookingNumber','loadingAddress','loadingContact','terminal']:kind==='pickup'?['bookingNumber','emptyDepot']:kind==='terminal'?['bookingNumber','terminal','customs','documents']:['bookingNumber'];
 const missing:string[]=required.filter(k=>!values[k]).map(k=>commonLabels[k]);
 if(['transport','confirmation'].includes(kind)&&!active.length)missing.push('Konteyner / araç satırı');
 if(kind==='confirmation'&&active.some(c=>!c.number||!c.seal||!c.loadingEnd))missing.push('Her konteyner için numara, mühür ve yükleme bitişi');
 const title=outputLabels[kind], lines=[title.toLocaleUpperCase('tr-TR'),'Referans: '+booking.salesReference,'Durum: TASLAK — operasyon kontrolü gerekli',''];
 const keys:CommonKey[]=kind==='reservation'?commonKeys:kind==='transport'?['bookingNumber','shipper','equipment','loadingAddress','loadingContact','emptyDepot','terminal','customs','documents']:kind==='pickup'?['bookingNumber','equipment','carrier','emptyDepot','loadingAddress','loadingContact']:kind==='terminal'?['bookingNumber','vessel','voyage','terminal','customs','documents']:['bookingNumber','shipper','loadingAddress','loadingContact','terminal'];
 for(const k of keys)lines.push(commonLabels[k]+': '+(values[k]||'Belirtilmedi'));
 // Explicit source and local field overrides remain distinguishable in every generated copy.
 lines.push('',source?'T-MAXX kaynağı: '+source.reference+' / '+source.goodReference+' · okuma '+source.checkedAt:'Kaynak: kayıtlı booking bilgileri','Saha saat dilimi: '+field.zone);
 if(Object.keys(field.overrides).length)lines.push('Yerel düzeltmeler: '+Object.keys(field.overrides).map(k=>commonLabels[k as CommonKey]).join(', '));
 const schedule=tasks.filter(t=>t.status!=='cancelled'&&t.date);
 if(schedule.length){lines.push('','PLANLANAN / TAKVİM TARİHLERİ');for(const t of schedule)lines.push(eventLabels[t.kind]+': '+t.date+' '+(t.time||'(saat belirtilmedi)')+' · '+t.zone);}
 if(active.length){lines.push('','KONTEYNER VE SAHA BİLGİLERİ');for(const [i,row] of active.entries()){
  lines.push((i+1)+'. '+(row.number||'Konteyner bekleniyor')+' · '+(row.type||'Tip bekleniyor')+' · Mühür: '+(row.seal||'Bekleniyor'));
  if(['transport','pickup','terminal','confirmation'].includes(kind))lines.push('Nakliyeci: '+(row.transporter||'Belirtilmedi')+' · Araç: '+(row.vehicle||'Belirtilmedi')+' · Plaka: '+(row.plate||'Belirtilmedi'),'Şoför: '+(row.driver||'Belirtilmedi')+' · Telefon: '+(row.phone||'Belirtilmedi'));
  for(const [k,label] of [['emptyPickup','Boş alım'],['loadingStart','Yükleme başlangıç'],['loadingEnd','Yükleme bitiş'],['gateIn','Dolu giriş']] as const)if(row[k])lines.push(label+': '+row[k].replace('T',' ')+' · '+field.zone);
  if(row.note)lines.push('Not: '+row.note);
 }}
 if(kind==='confirmation')lines.push('',missing.length?'Yükleme teyidi tamamlanamaz; aşağıdaki eksikleri kontrol edin.':'Kayıtlı yükleme bitişleri yukarıdadır. Sevkiyatın yükleme bilgilerini kontrolünüze sunarız.');
 if(kind==='request')lines.push('','Lütfen konteyner ve mühür numaralarını, boş alım / yükleme / terminal giriş saatlerini ve varsa bekleme veya sorun bilgisini iletiniz.');
 if(field.instructions)lines.push('','OPERASYON TALİMATI',field.instructions);
 if(missing.length)lines.push('','EKSİK BİLGİLER: '+missing.join(', '));
 return {kind,title,subject:title+' · '+booking.salesReference,body:lines.join('\n'),missing};
}
const revision=z.number().int().nonnegative();
export const fieldActionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('save'),revision,bookingRevision:revision,scheduleRevision:revision,evidenceRevision:revision,data:fieldSchema,reason:note.refine(v=>v.length>=5)}).strict(),
 z.object({action:z.literal('import'),revision,bookingRevision:revision,scheduleRevision:revision,evidenceRevision:revision,reference:text.refine(Boolean),goodId:z.number().int().positive(),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),verified:z.literal(true),reason:note.refine(v=>v.length>=5)}).strict(),
 z.object({action:z.literal('archive'),revision,bookingRevision:revision,scheduleRevision:revision,evidenceRevision:revision,kind:z.enum(outputKinds)}).strict(),
 z.object({action:z.literal('dispatch'),artifactId:z.string().uuid(),recipient:text.refine(Boolean),sentAt:z.string().datetime({offset:true}),channel:z.enum(['email','whatsapp','other']),evidence:note.refine(v=>v.length>=5),confirmed:z.literal(true)}).strict(),
]);
