import {z} from 'zod';
import {controlLabels,type ControlSource,compareControl,stableControl} from './bill-control';
import {containerValid} from '../domain';
const keys=Object.keys(controlLabels) as [keyof typeof controlLabels,...(keyof typeof controlLabels)[]];
const cell=z.object({key:z.enum(keys),value:z.string().trim().min(1).max(4000),proof:z.string().trim().min(1).max(2000),page:z.number().int().positive(),confidence:z.number().min(0).max(1)}).strict();
export const controlReadingSchema=z.object({documentType:z.enum(['instruction','booking_confirmation','booking_revision','carrier_si','vgm','hbl_draft','mbl_draft','hbl_final','mbl_final','sea_waybill','other']),fields:z.array(cell).max(keys.length),containers:z.array(z.object({number:z.string().refine(containerValid),seal:z.string().max(100),type:z.string().max(100),grossKg:z.string().regex(/^(?:|\d+(?:\.\d{1,3})?)$/),tareKg:z.string().regex(/^(?:|\d+(?:\.\d{1,3})?)$/),vgmKg:z.string().regex(/^(?:|\d+(?:\.\d{1,3})?)$/),proof:z.string().min(1).max(2000),page:z.number().int().positive()}).strict()).max(100),issues:z.array(z.string().max(1000)).max(50)}).strict().superRefine((v,c)=>{if(new Set(v.fields.map(f=>f.key)).size!==v.fields.length)c.addIssue({code:'custom',message:'Okumada alan tekrarı var.'});if(new Set(v.containers.map(r=>r.number.replace(/[\s-]/g,'').toUpperCase())).size!==v.containers.length)c.addIssue({code:'custom',message:'Okumada konteyner tekrarı var.'});});
export type ControlReading=z.infer<typeof controlReadingSchema>;
const reason=z.string().trim().min(10,'Gerekçe en az 10 karakter olmalı.').max(2000),uuid=z.string().uuid(),fingerprint=z.string().regex(/^[a-f0-9]{64}$/);
export const controlActionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('read'),documentId:uuid}).strict(),
 z.object({action:z.literal('link'),recordId:uuid,reason}).strict(),
 z.object({action:z.literal('decision'),fingerprint,subject:z.string().min(1).max(200),choice:z.string().max(200),mode:z.enum(['accept','exception','exclude','restore']),reason}).strict(),
 z.object({action:z.literal('approve'),requestId:uuid,fingerprint,reason,verified:z.literal(true)}).strict(),
 z.object({action:z.literal('revoke'),approvalId:uuid,reason}).strict(),
 z.object({action:z.literal('document'),fingerprint,documentId:uuid,kind:z.enum(['draft_approved','final_verified','dispatch']),relatedId:z.string().max(200),reason}).strict(),
]);
export type ControlDecision={id:string;fingerprint:string;subject:string;action:string;choice:string;reason:string;created_at:string};
export function latestDecisions(decisions:ControlDecision[],fingerprint:string){const map=new Map<string,ControlDecision>();for(const d of decisions)if(d.fingerprint===fingerprint&&!map.has(d.subject))map.set(d.subject,d);return map;}
export function controlFindings(sources:ControlSource[],decisions:ControlDecision[],fingerprint:string){
 const latest=latestDecisions(decisions,fingerprint);
 const excluded=new Set([...latest.values()].filter(d=>d.action==='exclude').map(d=>d.subject));
 const active=sources.filter(s=>!excluded.has('document:'+s.id));
 const rows=compareControl(active).map(row=>{
  const decision=latest.get('field:'+row.key);
  const selected=decision&&active.find(s=>s.id===decision.choice)?.values[row.key];
  // Critical identity/routing conflicts require source correction or documented exclusion.
  const resolved=row.level==='review'&&!!selected&&['accept','exception'].includes(decision!.action);
  return {...row,decision:decision||null,resolved};
 });
 return {rows,excluded:[...excluded],active};
}
export function flattenControlPayload(value:unknown,prefix=''): {path:string;label:string;value:string}[]{
 if(value===null||typeof value!=='object')return [{path:prefix,label:controlPayloadLabel(prefix),value:value===null?'—':String(value)}];
 return Object.entries(value).flatMap(([k,v])=>flattenControlPayload(v,prefix?prefix+'.'+k:k));
}
export function payloadIdentity(value:unknown){return stableControl(value);}

// Validate the target identity even when a user approves the displayed plan.
export function controlPlanIssues(kind:string,payload:unknown,field:{goodId:number;containers:{id:number;number:string}[]}|null):string[]{
 if(!field)return ['Pozisyon kaynağı yok.'];
 const p=payload as {loads?:{goodId:number;updates?:{path:string;entityId:number;body:Record<string,unknown>}[]}[];ShipmentInstruction?:{Containers?:{ContainerNumber?:string}[]}};
 const key=(v:unknown)=>String(v||'').replace(/[\s-]/g,'').toUpperCase();
 if(kind.startsWith('tmaxx')){
  if(!p.loads?.length)return ['T-MAXX yük planı eksik.'];
  const errors:string[]=[];
  for(const load of p.loads){if(load.goodId!==field.goodId)errors.push('Aktarım planı farklı bir T-MAXX yüküne ait.');for(const u of load.updates||[])if(u.path.endsWith('seaContainer')){const source=field.containers.find(c=>c.id===u.entityId);if(!source||key(u.body.no)!==key(source.number))errors.push('Aktarım planındaki konteyner pozisyon kaynağıyla eşleşmiyor.');}}
  return errors;
 }
 if(kind.startsWith('inttra')){
  const containers=p.ShipmentInstruction?.Containers;
  if(!containers?.length)return ['INTTRA planında konteyner yok.'];
  const numbers=containers.map(c=>key(c.ContainerNumber));
  if(new Set(numbers).size!==numbers.length||numbers.length!==field.containers.length||numbers.some(n=>!field.containers.some(c=>key(c.number)===n)))return ['INTTRA planının konteynerleri pozisyon kaynağıyla eşleşmiyor.'];
  return [];
 }
 return ['Bilinmeyen aktarım planı.'];
}

function controlPayloadLabel(path:string){
 const labels:Record<string,string>={...controlLabels,ShipmentInstruction:'Talimat',Containers:'Konteynerler',ContainerNumber:'Konteyner numarası',ContainerType:'Konteyner tipi',ContainerDescription:'Tip açıklaması',ContainerSeals:'Mühürler',SealNumber:'Mühür numarası',ContainerLineItems:'Yük kalemleri',SICompanies:'Taraflar',CompanyName:'Firma adı',CompanyAddress:'Adres',CompanyDocuments:'Belgeler',NumberOfDocuments:'Belge adedi',ShipmentSummary:'Yük toplamları',TotalWeight:'Brüt ağırlık',TotalWeightUomId:'Ağırlık birimi',TotalPackageCount:'Paket sayısı',TotalContainerCount:'Konteyner adedi',Transportations:'Taşıma',SILocations:'Konumlar',PortOfLoad:'Yükleme limanı',PortOfDischarge:'Boşaltma limanı',LocationCity:'Şehir',LocationCountry:'Ülke',PrintOnBLAs:'Belgede yazımı',SIReferences:'Referanslar',PaymentInstructions:'Navlun ödemesi',notes:'Not',loads:'Yükler',updates:'Kaydedilecek alanlar',body:'Bilgiler',entityId:'Kayıt kimliği',goodId:'Yük kimliği',no:'Konteyner numarası',sealNo:'Mühür numarası',grossWeight:'Brüt ağırlık',netWeight:'Net ağırlık',goodDescription:'Mal tanımı',quantity:'Adet',bookingNo:'Booking numarası',hblNo:'HBL numarası',reference:'Referans',referenceNo:'Referans',ex:'Kontrol edilmiş talimat',fields:'Alanlar',value:'Değer',source:'Kaynak',confidence:'Okuma güveni'};
 return path.split('.').map(p=>/^\d+$/.test(p)?String(Number(p)+1):labels[p]||p.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ')).join(' › ');
}
