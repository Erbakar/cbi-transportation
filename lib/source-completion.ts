import type {Extraction,Field,Fields} from './domain';
const trusted=(f?:Field)=>!!f?.value?.trim()&&!!f.source?.trim()&&f.confidence>=.95;
const normalized=(v:string)=>v.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').toUpperCase().replace(/[^A-Z0-9]/g,'');
// The second reading looks only at the actual instruction pages. It completes
// source evidence before user edits exist; it never consumes saved overrides.
export function completeSourceReading(first:Extraction,primary:Extraction):Extraction{
 if(primary.documentType!=='instruction')return first;
 const result=structuredClone(first),issues=[...first.issues,...primary.issues];
 for(const [key,field] of Object.entries(primary.fields)){
  if(!trusted(field))continue;
  const before=result.fields[key];
  if(trusted(before)&&!['description','hsCode'].includes(key)){
   const addressValue=(v:string)=>v.replace(/\b(?:NR|NO)\.?\s*(?=\d)/gi,'');
   const a=normalized(key.endsWith('Address')?addressValue(before.value!):before.value!),b=normalized(key.endsWith('Address')?addressValue(field.value!):field.value!);
   const compatible=key.endsWith('Address')?(a.includes(b)||b.includes(a)):a===b;
   if(!compatible)issues.push('Belge çelişkisi · '+key+': '+before.value+' / '+field.value);
  }
  result.fields[key]=structuredClone(field);
 }
 result.actualParties||={};
 for(const [role,fields]of Object.entries(primary.actualParties||{})){
  const target=role as keyof NonNullable<Extraction['actualParties']>;
  // A completeness pass can omit a component it read correctly before. Keep
  // earlier components only when the current full address still proves them.
  const address=primary.fields[role+'Address'];
  if(trusted(address)){
   const block=normalized(address.value!);
   result.actualParties[target]=Object.fromEntries(Object.entries(result.actualParties[target]||{}).filter(([,f])=>trusted(f)&&block.includes(normalized(f.value!))));
  }
  result.actualParties[target]||={};
  for(const [key,f]of Object.entries(fields))if(trusted(f))result.actualParties[target]![key]=structuredClone(f);
 }
 const key=(r:Fields)=>normalized(r.containerNumber?.value||'');
 for(const c of primary.containers){const matches=result.containers.filter(r=>key(r)===key(c));if(matches.length!==1)continue;for(const [k,f]of Object.entries(c))if(trusted(f))matches[0][k]=structuredClone(f);}
 // Replacing the cargo grouping is safe only when every printed quantity is
 // present and the same explicit container set is covered, without allocation.
 const numbers=(ex:Extraction)=>[...new Set(ex.containers.map(key))].sort().join('|');
 const complete=primary.cargoLines.length>0&&primary.cargoLines.every(r=>['containerNumber','description','packageCount','packageType','grossWeightKg'].every(k=>trusted(r[k])));
 if(complete&&numbers(primary)===numbers(first)&&numbers(first)){
  result.cargoLines=primary.cargoLines.map(row=>{const merged=structuredClone(row),matches=first.cargoLines.filter(r=>key(r)===key(row));if(matches.length===1&&primary.cargoLines.filter(r=>key(r)===key(row)).length===1)for(const [k,f]of Object.entries(matches[0]))if(!trusted(merged[k])&&trusted(f))merged[k]=structuredClone(f);return merged;});result.cargoLineCount=primary.cargoLineCount;
 }else{
  for(const row of primary.cargoLines){const matches=result.cargoLines.filter(r=>key(r)===key(row));if(matches.length!==1||primary.cargoLines.filter(r=>key(r)===key(row)).length!==1)continue;for(const [k,f]of Object.entries(row))if(trusted(f))matches[0][k]=structuredClone(f);}
 }
 if(result.containers.length===1)for(const k of ['containerNumber','containerType','sealNumber'])if(!trusted(result.fields[k])&&trusted(result.containers[0][k]))result.fields[k]=structuredClone(result.containers[0][k]);
 result.issues=[...new Set(issues)];return result;
}
