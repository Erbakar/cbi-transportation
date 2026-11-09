import type {Extraction,Field,Fields} from './domain';
export type SheetCell={cell:string;text:string;value:unknown;error?:string};
export type SheetRows={page:number;sheet:string;rows:{row:number;cells:SheetCell[]}[]};
const norm=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
// An explicitly labelled, unambiguous two-column instruction form supplies exact
// text evidence. No positional row numbers, customer names or cargo values are built in.
export function spreadsheetTextEvidence(page:SheetRows,filename:string):Fields{
 const all=page.rows.flatMap(r=>r.cells).map(c=>c.text);
 if(!all.some(t=>/KON[SŞ][Iİ]MENTO TAL[Iİ]MATI|SHIPPING INSTRUCTIONS?/i.test(t)))return {};
 const found=new Map<string,Field[]>();
 const add=(key:string,c:SheetCell,value=c.text)=>{if(!value.trim()||c.error)return;const f={value:value.trim(),source:`${filename}, page ${page.page}: ${page.sheet}!${c.cell} — ${c.text}`,confidence:1};found.set(key,[...(found.get(key)||[]),f]);};
 for(const row of page.rows){
  const cells=row.cells.filter(c=>c.text.trim()&&!c.error);if(cells.length!==2)continue;
  const label=norm(cells[0].text),cell=cells[1];
  const role=/^(?:GONDERICI FIRMA(?: UNVAN VE ADRESI)?|SHIPPER(?: NAME AND ADDRESS)?|EXPORTER(?: NAME AND ADDRESS)?)$/.test(label)?'shipper':/^(?:ALICI FIRMA(?: UNVAN VE ADRESI)?|CONSIGNEE(?: NAME AND ADDRESS)?|IMPORTER(?: NAME AND ADDRESS)?)$/.test(label)?'consignee':/^(?:NOTIFY(?: PARTY)?(?: NAME AND ADDRESS)?|IHBAR ADRESI)$/.test(label)?'notify':'';
  if(role){const lines=cell.text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);if(lines.length>1){add(role+'Name',cell,lines[0]);add(role+'Address',cell,lines.slice(1).join('\n'));}continue;}
  if(/^(?:MAL TANIMI(?: TURKCE ENGLISH)?|DESCRIPTION OF (?:THE )?GOODS|GOODS DESCRIPTION|COMMODITY DESCRIPTION)$/.test(label))add('description',cell);
  if(/^(?:GTIP(?: CODE| KODU)?|HS(?: CODE| CODES)?|HTS(?: CODE)?)$/.test(label))add('hsBlock',cell);
 }
 const fields:Fields={};for(const [key,values]of found)if(new Set(values.map(v=>v.value)).size===1)fields[key]=values[0];
 if(fields.hsBlock){const block=fields.hsBlock,codes=[...block.value!.matchAll(/\b\d{4}(?:\.\d{2}){1,4}\b|\b\d{6,12}\b/g)].map(m=>m[0]);if(codes.length)fields.hsCode={...block,value:codes.join(', ')};
  if(fields.description&&/[A-ZÇĞİÖŞÜa-zçğıöşü]/.test(block.value!))fields.description={value:fields.description.value+'\n'+block.value,source:fields.description.source+' | '+block.source,confidence:1};delete fields.hsBlock;
 }
 return fields;
}
export function applySpreadsheetText(ex:Extraction,fields:Fields):Extraction{
 const out=structuredClone(ex);for(const [key,f] of Object.entries(fields))out.fields[key]=f;
 if(out.containers.length===1&&out.cargoLines.length===1&&out.cargoLines[0].containerNumber?.value===out.containers[0].containerNumber?.value){for(const key of ['description','hsCode'])if(fields[key])out.cargoLines[0][key]=fields[key];}
 return out;
}
