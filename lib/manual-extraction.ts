import type {Extraction,Field,Fields} from './domain';
import type {Manual} from './manual';

// Conservative, source-backed completion shared by the form and submission pipeline.
// Missing values are filled; explicit edits (including empty values) and existing data win.
const turkishProvinces=('ADANA|ADIYAMAN|AFYONKARAHISAR|AGRI|AMASYA|ANKARA|ANTALYA|ARTVIN|AYDIN|BALIKESIR|BILECIK|BINGOL|BITLIS|BOLU|BURDUR|BURSA|CANAKKALE|CANKIRI|CORUM|DENIZLI|DIYARBAKIR|EDIRNE|ELAZIG|ERZINCAN|ERZURUM|ESKISEHIR|GAZIANTEP|GIRESUN|GUMUSHANE|HAKKARI|HATAY|ISPARTA|MERSIN|ISTANBUL|IZMIR|KARS|KASTAMONU|KAYSERI|KIRKLARELI|KIRSEHIR|KOCAELI|KONYA|KUTAHYA|MALATYA|MANISA|KAHRAMANMARAS|MARDIN|MUGLA|MUS|NEVSEHIR|NIGDE|ORDU|RIZE|SAKARYA|SAMSUN|SIIRT|SINOP|SIVAS|TEKIRDAG|TOKAT|TRABZON|TUNCELI|SANLIURFA|USAK|VAN|YOZGAT|ZONGULDAK|AKSARAY|BAYBURT|KARAMAN|KIRIKKALE|BATMAN|SIRNAK|BARTIN|ARDAHAN|IGDIR|YALOVA|KARABUK|KILIS|OSMANIYE|DUZCE').split('|');
const addressNorm=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/İ/g,'I').trim();
const addressCountries:Record<string,string>={TURKEY:'TURKEY',TURKIYE:'TURKEY','UNITED KINGDOM':'UNITED KINGDOM','UNITED STATES':'UNITED STATES','UNITED STATES OF AMERICA':'UNITED STATES',GERMANY:'GERMANY',DEUTSCHLAND:'GERMANY',FRANCE:'FRANCE',CHILE:'CHILE',SPAIN:'SPAIN',ITALY:'ITALY',NETHERLANDS:'NETHERLANDS',BELGIUM:'BELGIUM',POLAND:'POLAND',CHINA:'CHINA',CANADA:'CANADA',AUSTRALIA:'AUSTRALIA','UNITED ARAB EMIRATES':'UNITED ARAB EMIRATES'};
export function completePartyRegion(party:Fields={},address?:Field,overrides:Record<string,string>={}){
 const result={...party};
 for(const [key,value] of Object.entries(overrides))result[key]={value,source:'Kullanıcı tarafından doğrulandı',confidence:1};
 const trusted=(f?:Field)=>!!f?.value?.trim()&&!!f.source&&f.confidence>=.95;
 const conflicts=new Set<string>();
 const put=(key:string,value:string,source:string)=>{if(!conflicts.has(key)&&value&&!Object.hasOwn(overrides,key)&&!result[key]?.value?.trim())result[key]={value,source:source+' · Açık adres ayrıştırması',confidence:1};};
 const raw=trusted(address)?address!.value!.trim():'';
 // Labels must start a line; conflicting repeated labels are deliberately left unresolved.
 const aliases:Record<string,string>={city:'CITY|SEHIR',state:'STATE|PROVINCE|REGION|IL|BOLGE',country:'COUNTRY|ULKE',postalCode:'POSTAL CODE|POST CODE|POSTCODE|ZIP CODE|ZIP|POSTA KODU',street:'STREET|STREET ADDRESS|SOKAK|CADDE',streetNumber:'BUILDING NUMBER|BUILDING NO|STREET NUMBER|BINA NO|BINA NUMARASI',poBox:'P\\.?O\\.? BOX|POSTA KUTUSU'};
 const labelled:Record<string,string>={};
 for(const [key,label] of Object.entries(aliases)){
  const matches=raw.split(/\r?\n/).map(line=>{const colon=line.indexOf(':');return colon>=0&&new RegExp('^(?:'+label+')$').test(addressNorm(line.slice(0,colon)))?line.slice(colon+1).trim():'';}).filter(Boolean);
  if(matches.length&&new Set(matches.map(addressNorm)).size===1)labelled[key]=matches[0];else if(matches.length)conflicts.add(key);
 }
 for(const [key,value] of Object.entries(labelled))if(key!=='country')put(key,value,address!.source);
 const normalized=addressNorm(raw);
 const explicitCountry=labelled.country?(addressCountries[addressNorm(labelled.country)]||({TR:'TURKEY',TUR:'TURKEY',GB:'UNITED KINGDOM',UK:'UNITED KINGDOM',US:'UNITED STATES',USA:'UNITED STATES'} as Record<string,string>)[addressNorm(labelled.country)]||labelled.country):undefined;
 const suffixes=Object.keys(addressCountries).filter(name=>normalized===name||normalized.endsWith(' '+name)||normalized.endsWith('\n'+name)||normalized.endsWith(', '+name)).sort((a,b)=>b.length-a.length);
 const detectedCountry=explicitCountry||(!labelled.country&&suffixes.length?addressCountries[suffixes[0]]:undefined);
 if(detectedCountry)put('country',detectedCountry,address!.source);
 const country=trusted(result.country)?addressNorm(result.country!.value!):'';
 const tr=['TR','TUR','TURKEY','TURKIYE'].includes(country);
 if(tr){
  // A recognised, explicitly extracted Turkish province is also a valid region.
  const city=trusted(result.city)?addressNorm(result.city!.value!):'';
  const tail=normalized.replace(/(?:[,\s]+)(?:TURKEY|TURKIYE)$/, '').trim();
  const provinces=turkishProvinces.filter(name=>new RegExp('(?:^|[\\s,/])'+name+'$').test(tail));
  if(turkishProvinces.includes(city)&&provinces.length===1&&provinces[0]!==city)return result;
  if(turkishProvinces.includes(city))put('state',city,result.city!.source);
  if(provinces.length===1){
   const province=provinces[0];
   // Require a postcode immediately before the province, or its own address line.
   const postal=tail.match(new RegExp('(?:^|\\s)([0-9]{5})[ ,]+('+province+')$'));
   const separate=new RegExp('(?:^|[\\n,/])\\s*'+province+'$').test(tail);
   if(postal||separate){put('state',province,address!.source);if(postal){put('city',province,address!.source);put('postalCode',postal[1],address!.source);}}
  }
 }
 if(['CHILE','CL','CHL'].includes(country)&&trusted(result.city)&&addressNorm(result.city!.value!)==='SANTIAGO')put('state','SANTIAGO',result.city!.source+' · Onaylı Santiago bölge kuralı');
 if(['UNITED KINGDOM','GB','GBR','UK'].includes(country)&&raw){
  const codes=[...normalized.matchAll(/\b(?:GIR 0AA|[A-Z]{1,2}[0-9][A-Z0-9]?\s+[0-9][A-Z]{2})\b/g)].map(m=>m[0]);
  if(new Set(codes).size===1)put('postalCode',codes[0],address!.source);
 }
 // "No" alone can mean a shipment/reference number: require a street designation.
 if(raw&&/(?:CADDESI|CADDE|CAD\.|SOKAK|SOK\.|STREET|ROAD|AVENUE)\s*[,; ]*\bNO\s*[.:]/i.test(normalized)){
  const numbers=[...normalized.matchAll(/\bNO\s*[.:]\s*([0-9]+(?:[/-][0-9A-Z]+)?[A-Z]?)(?=\s|[,;]|$)/g)].map(m=>m[1]);
  if(new Set(numbers).size===1)put('streetNumber',numbers[0],address!.source);
 }
 return result;
}

export function sameAsConsignee(value:string|null|undefined){
 const normalized=(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
 return /^(?:SAME AS (?:CONSIGNEE|CNEE)|(?:CONSIGNEE|ALICI) ILE AYNI)$/.test(normalized);
}
// Keep the original extraction immutable so clearing a correction restores its source.
export function applyManual(extraction:Extraction,manual:Manual):Extraction {
 const ex=structuredClone(extraction);
 ex.omittedSeals=[];
 const field=(value:string):Field=>({value,source:'Kullanıcı tarafından doğrulandı',confidence:1});
 for(const [key,value] of Object.entries(manual.fieldOverrides||{}))if(value||manual.explicitEdits)ex.fields[key]=field(value);
 for(const key of ['bookingNumber','vessel','voyage'] as const)if(manual[key])ex.fields[key]=field(manual[key]);
 const renames=new Map<string,string>();
 for(const override of manual.containerOverrides||[]){
  if(override.sourceIndex!==undefined&&!ex.containers[override.sourceIndex]){ex.issues.push('Konteyner düzeltmesi kaynak belgeyle eşleşmiyor. Belge setini kontrol edin.');continue;}
  const indexed=override.sourceIndex===undefined?undefined:ex.containers[override.sourceIndex];
  const matches=indexed?[indexed]:ex.containers.filter(c=>c.containerNumber?.value===override.containerNumber);
  if(indexed&&![override.containerNumber,override.correctedNumber].includes(indexed.containerNumber?.value??'')){ex.issues.push('Konteyner düzeltmesi kaynak belgeyle eşleşmiyor. Belge setini kontrol edin.');continue;}
  if(matches.length!==1){ex.issues.push('Konteyner düzeltmesi kaynak belgeyle eşleşmiyor. Belge setini kontrol edin.');continue;}
  if(override.correctedNumber!==undefined){
   const next=override.correctedNumber.replace(/[\s-]/g,'').toUpperCase();
   if(next&&(ex.containers.some(c=>c!==matches[0]&&c.containerNumber?.value===next)||(manual.containerOverrides||[]).some(o=>o!==override&&o.containerNumber===next))){ex.issues.push('Konteyner düzeltmesi başka bir konteyner numarasıyla çakışıyor.');continue;}
   if(override.containerNumber&&override.containerNumber!==next&&extraction.containers.filter(c=>c.containerNumber?.value===override.containerNumber).length<=1)renames.set(override.containerNumber,next);
   matches[0].containerNumber=field(next);if(ex.containers.length===1)ex.fields.containerNumber=field(next);
  }
  if(override.omitSeal){ex.omittedSeals.push(matches[0].containerNumber?.value||'');matches[0].sealNumber=field('');if(ex.containers.length===1)ex.fields.sealNumber=field('');}
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
 for(const row of ex.cargoTotalsApplied?[]:manual.cargoOverrides||[]){
  if(!ex.cargoLines[row.index]){ex.issues.push('Mal kalemi düzeltmesi belgeyle eşleşmiyor.');continue;}
  for(const [key,value] of Object.entries(row.fields))if(value||manual.explicitEdits||['marksAndNumbers','ncmCode','cusCode'].includes(key))ex.cargoLines[row.index][key]=key==='description'&&row.preparedDescription?{...field(value),source:'Kullanıcı · Hazırlanmış mal açıklaması'}:field(value);
  if(row.inttraPackageCode)ex.cargoLines[row.index].inttraPackageCode=field(row.inttraPackageCode);
 }
 // Preserve explicit source associations when correcting an OCR typo. Never
 // guess links for multiple unnamed containers or by cargo row order.
 for(const row of ex.cargoLines){const next=renames.get(row.containerNumber?.value||'');if(next!==undefined)row.containerNumber=field(next);}
 if(ex.observations)ex.observations=ex.observations.map(o=>({...o,containerNumbers:o.containerNumbers?.map(n=>renames.get(n)||n)}));
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
 for(const role of ['shipper','consignee','notify'] as const)if(ex.actualParties?.[role]||ex.fields[role+'Address']?.value){ex.actualParties||={};ex.actualParties[role]=completePartyRegion(ex.actualParties[role],ex.fields[role+'Address'],manual.partyOverrides?.[role]);}
 for(const [index,row] of ex.cargoLines.entries())if(!row.packageType?.value&&!(manual.cargoOverrides||[]).some(o=>o.index===index&&o.fields.packageType===''))row.packageType={value:'Package',source:'İş kuralı · Varsayılan ambalaj',confidence:1};
 if(manual.shipmentPackageCode)ex.fields.inttraPackageCode=field(manual.shipmentPackageCode);
 if(manual.cargoQuantityMode==='shipment-total'){
  if(manual.cargoOverrides?.some(r=>r.index>0&&r.tmaxxPackId!==undefined))ex.issues.push('Toplam yük kullanımı: ayrı ürünlerin T-MAXX satır seçimlerini temizleyin; toplam için ilk satırı seçin.');
  else applyCargoTotals(ex);
 }
 return ex;
}

// Explicit shipment-level choice: never allocate a total between commodity rows.
export function applyCargoTotals(ex:Extraction){
 if(ex.cargoTotalsApplied)return;
 const fail=(message:string)=>ex.issues.push('Toplam yük kullanımı: '+message);
 if(ex.containers.length!==1||ex.containerCount!==1||!ex.cargoLines.length)return fail('yalnız tek konteynerli yüklerde kullanılabilir.');
 const container=ex.containers[0].containerNumber;
 const trusted=(f:Field|undefined)=>!!f?.value?.trim()&&!!f.source?.trim()&&f.confidence>=.95;
 if(!trusted(container)||ex.cargoLines.some(r=>!trusted(r.containerNumber)||r.containerNumber.value!==container.value))return fail('ürünlerin aynı konteynere bağlantısı doğrulanmalı.');
 for(const key of ['description','packageCount','packageType','grossWeightKg'])if(!trusted(ex.fields[key]))return fail('talimattaki toplam '+key+' doğrulanmalı.');
 for(const key of ['description','hsCode','marksAndNumbers','cusCode','ncmCode'])if(ex.cargoLines.some(r=>r[key]?.value&&!trusted(r[key])))return fail('ürün açıklaması ve kodlarının kaynakları doğrulanmalı.');
 const row:Fields={};
 for(const key of ['packageCount','packageType','inttraPackageCode','grossWeightKg','netWeightKg','volumeM3'])if(ex.fields[key])row[key]=structuredClone(ex.fields[key]);
 const combine=(key:string,separator:string)=>{const entries=ex.cargoLines.map(r=>r[key]).filter(trusted) as Field[];if(entries.length)row[key]={value:[...new Set(entries.map(f=>f.value))].join(separator),source:entries.map(f=>f.source).join(' | '),confidence:1};};
 combine('description','\n');combine('hsCode',', ');combine('marksAndNumbers','\n');
 if(!row.description)return fail('ürün açıklamaları boş bırakılamaz.');
 for(const key of ['ncmCode','cusCode']){const values=[...new Set(ex.cargoLines.map(r=>r[key]?.value).filter(Boolean))];if(values.length>1)return fail('farklı '+key+' değerleri tek alanda birleştirilemez.');combine(key,'');}
 row.containerNumber=structuredClone(container);
 ex.cargoLines=[row];ex.cargoLineCount=1;ex.cargoTotalsApplied=true;
 // Only the known allocation warning is resolved; unrelated source conflicts remain.
 ex.issues=ex.issues.filter(s=>!/^Belgedeki toplamın mal kalemlerine dağılımı belirtilmemiş: (packageCount|grossWeightKg|netWeightKg)\. Kalem değerlerini teyit edin\.$/.test(s));
}
