import type {Extraction,Field,Fields} from './domain';

export type Observation={key:string;value:string;page:number;documentIndex:number;scope:'shipment'|'master'|'unknown';source:string;containerNumbers?:string[]};
const numericKeys=['volumeM3','packageCount','grossWeightKg','netWeightKg'];
const labels:Record<string,string>={voyage:'Sefer',volumeM3:'Hacim (m³)',packageCount:'Kap adedi',grossWeightKg:'Brüt ağırlık (kg)',netWeightKg:'Net ağırlık (kg)',incoterm:'Teslim şekli'};
const numberKey=(s:string)=>s.replace(/[\s-]/g,'').toUpperCase();
const scopeKey=(o:Observation)=>numericKeys.includes(o.key)?[...new Set((o.containerNumbers||[]).map(numberKey))].sort().join(','):'';
const normalized=(v:string,key:string)=>numericKeys.includes(key)&&/^\d+(\.\d+)?$/.test(v.trim())?String(Number(v)):v.normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
export function evidenceConflicts(observations:Observation[],expectedContainers:string[]=[]) {
 const groups=new Map<string,Observation[]>();
 for(const o of observations){if(o.scope!=='shipment')continue;const key=o.key+'|'+scopeKey(o);groups.set(key,[...(groups.get(key)||[]),o]);}
 const issues:string[]=[];
 for(const items of groups.values()){
  const key=items[0].key,scope=scopeKey(items[0]);
  if(new Set(items.map(o=>normalized(o.value,key))).size>1)issues.push(`Belge çelişkisi · ${labels[key]||key}${scope?' · '+scope:''}: ${items.map(o=>`${o.value} (belge ${o.documentIndex}, sayfa ${o.page})`).join(' / ')}`);
 }
 // A whole-shipment total is comparable only to a complete, disjoint partition.
 for(const key of numericKeys){
  const totals=scopedTotal(observations,key,expectedContainers);
  const whole=groups.get(key+'|')||[];
  const scoped=observations.some(o=>o.scope==='shipment'&&o.key===key&&scopeKey(o));
  if(expectedContainers.length&&scoped&&!totals&&!issues.some(issue=>issue.startsWith(`Belge çelişkisi · ${labels[key]}`)))issues.push(`Belge çelişkisi · ${labels[key]}: konteyner kapsamları eksik veya çakışıyor; toplam doğrulanmalı.`);
  if(totals&&whole.some(o=>Math.abs(Number(o.value)-Number(totals.value))>.001))issues.push(`Belge çelişkisi · ${labels[key]}: sevkiyat toplamı konteyner toplamlarıyla eşleşmiyor.`);
 }
 return issues;
}
export function scopedTotal(observations:Observation[],key:string,expectedContainers:string[]){
 const expected=new Set(expectedContainers.map(numberKey));if(!expected.size||expected.has(''))return null;
 const groups=new Map<string,Observation[]>();
 for(const o of observations){const scope=scopeKey(o);if(o.scope==='shipment'&&o.key===key&&scope)groups.set(scope,[...(groups.get(scope)||[]),o]);}
 const covered=new Set<string>(),sources:string[]=[];let total=0;
 for(const [scope,items] of groups){
  const values=new Set(items.map(o=>normalized(o.value,key)));
  if(values.size!==1||!/^\d+(\.\d+)?$/.test(items[0].value.trim()))return null;
  for(const number of scope.split(',')){if(!expected.has(number)||covered.has(number))return null;covered.add(number);}
  total+=Number(items[0].value);sources.push(items[0].source);
 }
 if(covered.size!==expected.size)return null;
 return {value:String(Number(total.toFixed(6))),source:'Konteyner kapsamları toplamı · '+sources.join(' | '),confidence:1};
}

type EvidenceDocument={filename:string;role?:'instruction'|'mbl-parties'};
const coverageIssue=(key:string)=>`Belge çelişkisi · ${labels[key]}: konteyner kapsamları eksik veya çakışıyor; toplam doğrulanmalı.`;

/** A page audit can omit a total already quoted in a container/cargo field.
 * Complete its coverage from explicit, source-linked rows; never invent an
 * allocation, reuse an MBL reference, or replace an actual disagreement. */
export function reconcileDocumentTotals(input:Extraction,documents:EvidenceDocument[]):Extraction {
 const ex=structuredClone(input);
 if(ex.documentType!=='instruction')return ex;
 const trusted=(field?:Field)=>!!field?.value?.trim()&&!!field.source.trim()&&field.confidence>=.95;
 const location=(source:string)=>{
  const matches=documents.flatMap((document,index)=>{
   if(document.role==='mbl-parties'||!source.startsWith(document.filename))return [];
   const match=source.slice(document.filename.length).match(/^\s*[,·:]?\s*(?:page|sayfa)\s+(\d+)\s*:\s*(\S[\s\S]*)$/i);
   return match&&Number(match[1])>0?[{documentIndex:index+1,page:Number(match[1])}]:[];
  });
  return matches.length===1?matches[0]:null;
 };
 const observations=[...(ex.observations||[])];
 const expected=ex.containers.map(c=>numberKey(c.containerNumber?.value||''));
 // Duplicate/unknown container links cannot establish an unambiguous partition.
 if(expected.some(n=>!n)||new Set(expected).size!==expected.length)return ex;
 const add=(row:Fields,key:string)=>{
  const container=row.containerNumber,field=row[key];
  if(!trusted(container)||!trusted(field)||!/^\d+(\.\d+)?$/.test(field.value!))return;
  const number=numberKey(container.value!);
  const target=ex.containers.find(c=>numberKey(c.containerNumber?.value||'')===number);
  if(!target||!trusted(target.containerNumber))return;
  const where=location(field.source),link=location(container.source);
  // Both the number and quantity must explicitly belong to the same source page.
  if(!where||!link||where.documentIndex!==link.documentIndex||where.page!==link.page)return;
  if(observations.some(o=>o.documentIndex===where.documentIndex&&o.page===where.page&&(o.scope==='master'||(o.key===key&&o.scope==='unknown'))))return;
  // An audited group total already owns these containers. Do not count it again
  // as individual rows. Single-container disagreements remain separate evidence.
  if(observations.some(o=>o.key===key&&o.scope==='shipment'&&scopeKey(o).split(',').includes(number)&&scopeKey(o)!==number))return;
  if(observations.some(o=>o.key===key&&o.scope==='shipment'&&scopeKey(o)===number&&normalized(o.value,key)===normalized(field.value!,key)))return;
  observations.push({key,value:field.value!,source:field.source,...where,scope:'shipment',containerNumbers:[number]});
 };
 for(const container of ex.containers)for(const key of ['packageCount','grossWeightKg'])add(container,key);
 // A sole, explicitly linked cargo row can supply the container's net/volume
 // and corroborate package/gross values. Multiple goods rows are not totals.
 for(const row of ex.cargoLines){
  const number=numberKey(row.containerNumber?.value||'');
  if(ex.cargoLines.filter(c=>numberKey(c.containerNumber?.value||'')===number).length!==1)continue;
  for(const key of numericKeys)add(row,key);
 }
 const conflicts=evidenceConflicts(observations,expected);
 for(const key of numericKeys){
  const total=scopedTotal(observations,key,expected);
  const prefix=`Belge çelişkisi · ${labels[key]}`;
  const conflicting=conflicts.some(issue=>issue.startsWith(prefix));
  if(total&&!conflicting){
   const current=ex.fields[key];
   if(trusted(current)&&/^\d+(\.\d+)?$/.test(current.value!)&&Math.abs(Number(current.value)-Number(total.value))>.001){
    conflicts.push(`${prefix}: sevkiyat toplamı konteyner toplamlarıyla eşleşmiyor.`);
    continue;
   }
   ex.fields[key]=total;
   ex.issues=ex.issues.filter(issue=>issue!==coverageIssue(key));
  }else if(conflicting){
   ex.fields[key]={value:null,source:'Çelişkili belge değerleri; kaynak sayfaları inceleyin.',confidence:0};
  }
 }
 ex.observations=observations;ex.issues=[...new Set([...ex.issues,...conflicts])];
 return ex;
}

// A quoted shipment total is not evidence for allocating that total to every goods row.
export function unallocatedCargoTotals(ex: {fields:Record<string,{value:string|null;source:string}>;cargoLines:Record<string,{value:string|null;source:string;confidence:number}>[];issues:string[]}) {
 for(const key of ['packageCount','grossWeightKg','netWeightKg']){
  const total=ex.fields[key];if(!total?.value||!total.source.trim()||ex.cargoLines.length<2)continue;
  const copies=ex.cargoLines.filter(row=>row[key]?.value&&Number(row[key].value)===Number(total.value)&&row[key].source.trim()===total.source.trim());
  if(copies.length<2)continue;
  for(const row of copies)row[key]={value:null,source:'',confidence:0};
  ex.issues.push('Belgedeki toplamın mal kalemlerine dağılımı belirtilmemiş: '+key+'. Kalem değerlerini teyit edin.');
 }
}
