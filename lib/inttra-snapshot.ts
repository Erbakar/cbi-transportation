// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SubmittedObject=Record<string,any>;
function typedValue(collection:SubmittedObject|undefined,typeKey:string,code:string,valueKey:string,fallback:string){const field=Object.values(collection||{}).find(v=>v&&String(v[typeKey])===code)||collection?.[fallback];return String(field?.[valueKey]||'');}
export type InttraSnapshot={reference:string;paymentMethod:string;parties:{role:string;name:string;street:string;city:string;country:string;postalCode:string}[];cargo:{container:string;description:string;marks:string;packages:string;weight:string;hs:string;ncm:string}[];issues:string[]};
// Keep the persisted submitted payload immutable; this is a display projection.
export function inttraSnapshot(reference:string,payload:string):InttraSnapshot|null{
 try{
  const saved=JSON.parse(payload),s=saved.payload?.ShipmentInstruction||saved.ShipmentInstruction;if(!s)return null;
  const parties=[['exportSeller','Gerçek gönderen'],['goodsOwner','Gerçek alıcı'],['ActualNotifyParty','Gerçek notify']].map(([key,role])=>{const p=s.SICompanies?.[key]||{};return {role,name:p.CompanyName||'',street:p.Street||'',city:p.City||'',country:p.Country||'',postalCode:p.Zip||''};});
  const cargo=(s.Containers||[]).flatMap((c:SubmittedObject)=>(c.ContainerLineItems||[]).map((l:SubmittedObject)=>({container:String(c.ContainerNumber),description:l.CargoDescription||'',marks:l.MarksAndNumbers||'',packages:String(l.PackageCount||''),weight:String(l.GrossCargoWeight||''),hs:typedValue(l.LineItemAttrs,'LineItemAttrTypeCode','2','LineItemAttrValue','LineItemAttr_2'),ncm:typedValue(l.LineItemReferences,'LineItemReferenceTypeCode','15','LineItemReferenceValue','LineItemReference_15')})));
  const issues:string[]=[];if(s.HouseBillIndicator==='2')for(const p of parties)if(!p.street||!p.city||!p.country)issues.push(p.role+': ayrı adres alanları gönderim sırasında eksikti.');
  if(!s.PaymentMethodTypeValue)issues.push('Ödeme yöntemi gönderim sırasında seçilmemişti.');
  for(const c of cargo){if(!c.marks)issues.push(c.container+': Marks & Numbers gönderim sırasında boştu.');if(c.hs&&c.ncm===c.hs)issues.push(c.container+': HS ile NCM aynı gönderilmiş; kaynak belgeden doğrulanmalı.');}
  return {reference,paymentMethod:s.PaymentMethodTypeDescription||'Seçilmemiş',parties,cargo,issues};
 }catch{return null;}
}
