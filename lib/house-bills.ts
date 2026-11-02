import type {Extraction,Fields} from './domain';
import type {Manual} from './manual';
import {applyManual} from './manual-extraction';

export type HouseBill=NonNullable<Manual['houseBills']>[number];
export const containerKey=(s:unknown)=>String(s||'').replace(/[\s-]/g,'').toUpperCase();
export function houseBillIssues(m:Manual,ex?:Extraction){
 if(m.inttra?.houseBill!=='multiple')return [];
 const bills=m.houseBills||[],issues:string[]=[];
 if(bills.length<2)issues.push('HBL kapsamı: Multiple için en az iki yük ve HBL gerekli.');
 const numbers=new Set<string>(),containers=new Set<string>(),goods=new Set<number>();
 for(const [i,b]of bills.entries()){
  if(!b.number)issues.push(`HBL ${i+1}: House Bill Number alanını doldurun.`);
  else if(numbers.has(b.number.trim().toUpperCase()))issues.push(`HBL ${i+1}: HBL numarası başka yükte de kullanılmış.`);
  numbers.add(b.number.trim().toUpperCase());
  if(goods.has(b.goodId))issues.push(`HBL ${i+1}: aynı T-MAXX yükü birden fazla seçilmiş.`);goods.add(b.goodId);
  for(const n of b.containerNumbers){const key=containerKey(n);if(containers.has(key))issues.push(`HBL ${i+1}: konteyner birden fazla HBL'ye atanmış.`);containers.add(key);}
 }
 if(ex){const expected=new Set(ex.containers.map(c=>containerKey(c.containerNumber?.value)));if(expected.size!==containers.size||[...expected].some(n=>!containers.has(n)))issues.push('HBL kapsamı: konteynerler HBL yükleriyle tam eşleşmiyor.');}
 return issues;
}
export function extractionForBill(ex:Extraction,bill:HouseBill,m:Manual){
 const selected=new Set(bill.containerNumbers.map(containerKey));
 const part=structuredClone(ex);
 part.containers=part.containers.filter(c=>selected.has(containerKey(c.containerNumber?.value)));
 part.cargoLines=part.cargoLines.filter(c=>selected.has(containerKey(c.containerNumber?.value))||(ex.containers.length===1&&!c.containerNumber?.value));
 part.containerCount=part.containers.length;part.cargoLineCount=part.cargoLines.length;
 const field=(value:string)=>({value,source:'Doğrulanmış HBL mal kalemleri',confidence:1});
 for(const key of ['packageCount','grossWeightKg','netWeightKg','volumeM3']){const values=part.cargoLines.map(c=>c[key]?.value);if(values.length&&values.every(v=>v&&/^\d+(\.\d+)?$/.test(v)))part.fields[key]=field(String(Number(values.reduce((s,v)=>s+Number(v),0).toFixed(6))));else delete part.fields[key];}
 part.fields.description=field(part.cargoLines.map(c=>c.description?.value||'').join('\n\n'));
 if(part.containers.length===1)for(const key of ['containerNumber','containerType','sealNumber'])if(part.containers[0][key])part.fields[key]=part.containers[0][key];
 // Apply only bill-specific overrides to the already corrected shipment; don't reapply row-index edits after filtering.
 const result=applyManual(part,{...m,fieldOverrides:bill.fieldOverrides,partyOverrides:bill.partyOverrides,containerOverrides:[],cargoOverrides:[]});
 result.omittedSeals=ex.omittedSeals;
 return result;
}
