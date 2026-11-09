import type {Extraction} from './domain';
export type CargoLanguageSelection={index:number;status:'found'|'missing'|'ambiguous';segments:string[]};
const normalized=(s:string)=>s.replace(/\s+/g,' ').trim();
// English must be present in the source. This pass selects text; it cannot
// translate, invent cargo, or move text between containers.
export function applyCargoLanguage(input:Extraction,selections:CargoLanguageSelection[]):Extraction{
 if(selections.length!==input.cargoLines.length||new Set(selections.map(s=>s.index)).size!==selections.length)throw Error('İngilizce mal tanımı satırları doğrulanamadı.');
 const ex=structuredClone(input);
 for(const item of selections){
  const row=ex.cargoLines[item.index],source=row?.description;
  if(!row||!['found','missing','ambiguous'].includes(item.status)||!Array.isArray(item.segments)||item.segments.some(s=>typeof s!=='string'||!s.trim()))throw Error('İngilizce mal tanımı sonucu doğrulanamadı.');
  if(item.status!=='found'&&item.segments.length)throw Error('İngilizce mal tanımı sonucu belirsiz.');
  const text=item.segments.join('\n').trim();
  if(item.status==='found'&&(!text||!source?.value||item.segments.some(s=>!normalized(source.value!).includes(normalized(s)))))throw Error('İngilizce mal tanımı kaynak metinle eşleşmiyor.');
  row.carrierDescription={value:item.status==='found'?text:null,source:item.status==='found'?source.source+' · Belgedeki İngilizce mal tanımı':'',confidence:item.status==='found'?source.confidence:0};
 }
 ex.cargoLanguageVersion=1;return ex;
}
