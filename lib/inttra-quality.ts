import type {Extraction,Fields} from './domain';

export const partyRoles=['shipper','consignee','notify'] as const;
export type PartyRole=typeof partyRoles[number];
export const partyLabels={shipper:'Gerçek gönderen',consignee:'Gerçek alıcı',notify:'Gerçek notify'};
export const addressKeys=['street','streetNumber','poBox','city','state','postalCode','country','taxId','eori'] as const;
export const addressLabels:Record<typeof addressKeys[number],string>={street:'Sokak / açık adres',streetNumber:'Bina / sokak numarası',poBox:'Posta kutusu',city:'Şehir',state:'İl / bölge',postalCode:'Posta kodu',country:'Ülke',taxId:'Vergi numarası',eori:'EORI'};
export const addressLimits={street:70,streetNumber:35,poBox:35,city:35,state:35,postalCode:17,country:200,taxId:50,eori:50};
export const cargoKeys=['description','marksAndNumbers','packageCount','packageType','grossWeightKg','netWeightKg','containerNumber','hsCode','ncmCode','cusCode'] as const;
export function fieldText(fields:Fields|undefined,key:string){return fields?.[key]?.value||'';}
export function inttraQualityIssues(ex:Extraction,houseBill:string){
 const issues:string[]=[];
 if(houseBill==='2')for(const role of partyRoles){
  const party=ex.actualParties?.[role];
  for(const key of addressKeys){const f=party?.[key],required=['street','city','country'].includes(key);
   if(required&&!f?.value?.trim())issues.push(`${partyLabels[role]}: ${addressLabels[key]} bilgisini tamamlayın.`);
   if(f?.value&&(f.confidence<.95||!f.source))issues.push(`${partyLabels[role]}: ${addressLabels[key]} kaynağını doğrulayın.`);
   if(f?.value&&f.value.length>addressLimits[key])issues.push(`${partyLabels[role]}: ${addressLabels[key]} en fazla ${addressLimits[key]} karakter olabilir; bilgi kesilmeden düzenlenmeli.`);
  }
 }
 for(const [index,line] of ex.cargoLines.entries())for(const key of ['description','marksAndNumbers','hsCode','ncmCode','cusCode']){
  const f=line[key];if(f?.value&&(!f.source||f.confidence<.95))issues.push(`Mal kalemi ${index+1}: ${key} kaynağını doğrulayın.`);
 }
 return issues;
}
