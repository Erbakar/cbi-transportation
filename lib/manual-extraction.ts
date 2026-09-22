import type {Extraction,Field} from './domain';
import type {Manual} from './manual';
export function sameAsConsignee(value:string|null|undefined){
 const normalized=(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
 return /^(?:SAME AS (?:CONSIGNEE|CNEE)|(?:CONSIGNEE|ALICI) ILE AYNI)$/.test(normalized);
}
// Keep the original extraction immutable so clearing a correction restores its source.
export function applyManual(extraction:Extraction,manual:Manual):Extraction {
 const ex=structuredClone(extraction);
 ex.omittedSeals=[];
 const field=(value:string):Field=>({value,source:'Kullanıcı tarafından doğrulandı',confidence:1});
 for(const [key,value] of Object.entries(manual.fieldOverrides||{}))if(value)ex.fields[key]=field(value);
 for(const key of ['bookingNumber','vessel','voyage'] as const)if(manual[key])ex.fields[key]=field(manual[key]);
 for(const override of manual.containerOverrides||[]){
  const matches=ex.containers.filter(c=>c.containerNumber?.value===override.containerNumber);
  if(matches.length!==1){ex.issues.push('Konteyner düzeltmesi kaynak belgeyle eşleşmiyor. Belge setini kontrol edin.');continue;}
  if(override.omitSeal){ex.omittedSeals.push(override.containerNumber);matches[0].sealNumber=field('');if(ex.containers.length===1)ex.fields.sealNumber=field('');}
  for(const key of ['containerType','sealNumber'] as const)if(override[key]){
   if(key==='sealNumber'&&override.omitSeal)continue;
   matches[0][key]=field(override[key]);
   if(ex.containers.length===1)ex.fields[key]=field(override[key]);
  }
 }
 for(const [role,overrides] of Object.entries(manual.partyOverrides||{})){
  ex.actualParties||={};const key=role as keyof NonNullable<Extraction['actualParties']>;ex.actualParties[key]||={};
  for(const [name,value]of Object.entries(overrides))ex.actualParties[key]![name]=field(value);
 }
 for(const row of manual.cargoOverrides||[]){
  if(!ex.cargoLines[row.index]){ex.issues.push('Mal kalemi düzeltmesi belgeyle eşleşmiyor.');continue;}
  for(const [key,value] of Object.entries(row.fields))if(value||['marksAndNumbers','ncmCode','cusCode'].includes(key))ex.cargoLines[row.index][key]=field(value);
 }
 // A referral is not a company name. Keep any separate party/address intact.
 const notifyFields=[ex.fields.notifyName,ex.fields.notifyAddress];
 const hasReferral=notifyFields.some(f=>sameAsConsignee(f?.value));
 const onlyReferralOrEmpty=notifyFields.every(f=>!f?.value?.trim()||sameAsConsignee(f.value));
 const uncertainReferral=notifyFields.some(f=>sameAsConsignee(f?.value)&&(!f?.source||f.confidence<.95));
 if(hasReferral&&(!onlyReferralOrEmpty||uncertainReferral))ex.issues.push('Notify: alıcıya yönlendirme ifadesi ve ayrı taraf bilgisi doğrulanmalı.');
 if(onlyReferralOrEmpty&&!uncertainReferral){
  for(const suffix of ['Name','Address'])if(ex.fields['consignee'+suffix])ex.fields['notify'+suffix]=structuredClone(ex.fields['consignee'+suffix]);
  if(ex.actualParties?.consignee){ex.actualParties.notify=structuredClone(ex.actualParties.consignee);for(const [key,value]of Object.entries(manual.partyOverrides?.notify||{}))ex.actualParties.notify[key]=field(value);}
 }
 return ex;
}
