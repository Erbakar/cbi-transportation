import type {Fields,Extraction} from './domain';
import type {Manual} from './manual';

export const notificationEmails='operation@cbitransport.com, export@cbitransport.com';
export function emailList(value:string){const list=value.split(',').map(s=>s.trim());if(!list.length||list.length>6||list.some(s=>! /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(s)))throw Error('Bildirim e-postalarını virgülle ayırarak kontrol edin.');return [...new Set(list)].join(', ');}
// INTTRA destination groups, not a legal determination of filing obligations.
export function destinationRegion(location:string){
 const country=location.split(':')[1]?.trim().toUpperCase();if(!country)return '';
 if(['GB','GBR','UNITED KINGDOM','UK'].includes(country))return ''; // Northern Ireland needs a more precise selection.
 if(['AE','ARE','UNITED ARAB EMIRATES'].includes(country))return '4';
 if(['US','USA','UNITED STATES','UNITED STATES OF AMERICA','CA','CAN','CANADA','MX','MEX','MEXICO','PR','PRI','PUERTO RICO'].includes(country))return '3';
 const eu='AUSTRIA|BELGIUM|BULGARIA|CROATIA|CYPRUS|CZECH REPUBLIC|CZECHIA|DENMARK|ESTONIA|FINLAND|FRANCE|GERMANY|GREECE|HUNGARY|IRELAND|ITALY|LATVIA|LITHUANIA|LUXEMBOURG|MALTA|NETHERLANDS|POLAND|PORTUGAL|ROMANIA|SLOVAKIA|SLOVENIA|SPAIN|SWEDEN|NORWAY|SWITZERLAND|NORTHERN IRELAND|AT|BE|BG|HR|CY|CZ|DK|EE|FI|FR|DE|GR|HU|IE|IT|LV|LT|LU|MT|NL|PL|PT|RO|SK|SI|ES|SE|NO|CH|XI';
 return eu.split('|').includes(country)?'2':'1';
}
export function cargoPrint(row:Fields,explicit:Record<string,string>={}){
 const prepared=row.description?.source==='Kullanıcı · Hazırlanmış mal açıklaması';
 const english=row.carrierDescription!==undefined&&!prepared&&!/^Kullanıcı/.test(row.description?.source||'');
 const raw=(prepared?row.description?.value?.match(/HS\s*(?:CODE|KODU)?\s*:\s*([^\n]+)/i)?.[1]:undefined)??row.hsCode?.value??'';
 const codes=raw.split(/[,;\n\/]+/).map(s=>s.replace(/[.\s-]/g,'')).filter(s=>/^\d{6,12}$/.test(s));
 const code=codes[0]?.slice(0,6)||'';
 let description=(english?row.carrierDescription.value:row.description?.value)||'';
 const marks=row.marksAndNumbers?.value?.trim();
 if(!prepared&&marks&&!/^\d[\d\s.,;/-]*$/.test(marks)&&!description.includes(marks))description+='\n'+marks;
 const missingCodes=codes.filter(c=>!description.replace(/[.\s-]/g,'').includes(c));
 if(english){
  const formatted=raw.split(/[,;\n\/]+/).map(s=>s.trim()).filter(s=>/^\d{6,12}$/.test(s.replace(/[.\s-]/g,'')));
  // Printed product/code lists may repeat a code. Keep that order, repetition,
  // and punctuation while removing the Turkish product labels from the output.
  const inDescription=[...(row.description?.value||'').matchAll(/\b\d{4}(?:\.\d{2}){1,4}\b|\b\d{6,12}\b/g)].map(m=>m[0]).filter(s=>codes.includes(s.replace(/\D/g,'')));
  const full=inDescription.length>=formatted.length&&codes.every(c=>inDescription.some(s=>s.replace(/\D/g,'')===c))?inDescription:formatted;
  if(full.length)description+='\nHS CODE : '+full.join(', ');
 }else if(!prepared&&missingCodes.length)description+='\nHS CODE: '+missingCodes.join(', ');
 const net=row.netWeightKg?.value;
 if(!prepared&&net&&!/NET\s*(?:WEIGHT|KG|KILO|AĞIRLIK)/i.test(description))description+='\nNET WEIGHT: '+net+' KG';
 return {description:description.trim(),hsCode:code,ncmCode:explicit.ncmCode??code,marksAndNumbers:explicit.marksAndNumbers??code};
}

// One document decision shared by form defaults and the outbound payload.
export function mblDocumentType(ex:Pick<Extraction,'fields'|'hblRequired'>,m:Manual):'SWB'|'ORIGINAL'|''{
 const explicit=m.inttra?.mblDocumentType;if(explicit)return explicit;
 const agent=ex.hblRequired??['2','multiple'].includes(m.inttra?.houseBill||'');
 if(agent)return 'SWB';
 const override=m.fieldOverrides?.blType,field=ex.fields.blType;
 const raw=override!==undefined?override:field?.source&&field.confidence>=.95?field.value||'':'';
 const value=raw.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
 const swb=/SWB|SEA\s?WAY|RELEASE/.test(value),original=/ORIGINAL|ORIJINAL|3\s*\/\s*3|KARGO/.test(value);
 return swb===original?'':swb?'SWB':'ORIGINAL';
}
export function updateCargoNetDescription(description:string,previous:string,next:string){
 const oldLine='NET WEIGHT: '+previous+' KG';
 const lines=description.split('\n');
 const index=lines.findIndex(line=>line.trim()===oldLine);
 if(index>=0){if(next)lines[index]='NET WEIGHT: '+next+' KG';else lines.splice(index,1);return lines.join('\n');}
 if(next&&!/NET\s*(?:WEIGHT|KG|KILO|AĞIRLIK)/i.test(description))return description+'\nNET WEIGHT: '+next+' KG';
 return description;
}
