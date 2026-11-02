import type {Extraction,Field} from './domain';
// A missing operation summary can be composed from fully quoted cargo rows;
// never overwrite a printed summary or promote uncertain/incomplete evidence.
export function completeCargoSummary(input:Extraction):Extraction {
 const ex=structuredClone(input),trusted=(f?:Field)=>!!f?.value?.trim()&&!!f.source.trim()&&f.confidence>=.95;
 if(!ex.cargoLines.length)return ex;
 for(const key of ['description','packageType']){
  if(ex.fields[key]?.value?.trim())continue;
  const values=ex.cargoLines.map(row=>row[key]);if(!values.every(trusted))continue;
  const distinct=[...new Set(values.map(f=>f.value!.trim()))];if(key==='packageType'&&distinct.length!==1)continue;
  ex.fields[key]={value:distinct.join('\n'),source:'Doğrulanmış mal kalemleri · '+[...new Set(values.map(f=>f.source))].join(' | '),confidence:Math.min(...values.map(f=>f.confidence))};
 }
 return ex;
}
