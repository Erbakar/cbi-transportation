import type {Extraction,Field} from './domain';
import type {Manual} from './manual';
// Keep the original extraction immutable so clearing a correction restores its source.
export function applyManual(extraction:Extraction,manual:Manual):Extraction {
 const ex=structuredClone(extraction);
 const field=(value:string):Field=>({value,source:'Kullanıcı tarafından doğrulandı',confidence:1});
 for(const [key,value] of Object.entries(manual.fieldOverrides||{}))if(value)ex.fields[key]=field(value);
 for(const key of ['bookingNumber','vessel','voyage'] as const)if(manual[key])ex.fields[key]=field(manual[key]);
 for(const override of manual.containerOverrides||[]){
  const matches=ex.containers.filter(c=>c.containerNumber?.value===override.containerNumber);
  if(matches.length!==1){ex.issues.push('Konteyner düzeltmesi kaynak belgeyle eşleşmiyor. Belge setini kontrol edin.');continue;}
  for(const key of ['containerType','sealNumber'] as const)if(override[key]){
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
 return ex;
}
