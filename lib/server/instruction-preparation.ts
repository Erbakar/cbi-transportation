import {resolveInstruction,rememberSourceValues} from '../instruction-rules';
import type {Manual} from '../manual';
import {tmaxxSource} from './tmaxx-source';
import {inttraRequest} from './inttra-workflow';
import {decodeOptions} from '../inttra-reference';
import {matchInttraLocation} from '../inttra-location-match';
export async function prepareSource(owner:string,m:Manual,result:Awaited<ReturnType<typeof tmaxxSource>>){
 const locations:Record<string,string>={};
 for(const key of ['loadPort','dischargePort','origin','destination','transportDestination'] as const){
  if(m.inttra?.[key])continue;
  const raw=result.ports[key]||result.ex.fields[key]?.value||'';
  const query=raw.replace(/^TCEEGE-/,'').replace(/^SOCAR\s+/,'').replace(/\s+-\s+[A-Z]{2,3}\s+-.*$/,'').trim();
  if(query.length<3||query.length>100)continue;
  try{const response=await inttraRequest(owner,'/siact/geographySi',query) as {cities?:string[][]};const match=matchInttraLocation(raw,query,response.cities||[]);if(match)locations[key]=match;}catch{/* Unavailable/ambiguous lookup remains an explicit missing field. */}
 }
 let carrier='';
 if(!m.inttra?.carrier&&result.carrierName){
  try{const options=await inttraRequest(owner,'/siact/createPageParams',null) as Record<string,unknown>;
   const normalize=(s:string)=>s.toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
   const name=normalize(result.carrierName),known=/^MSC(?:\s|$)/.test(name)?'MSC':name;
   const matches=decodeOptions(options.carriersList).filter(o=>normalize(o.label)===known);
   if(matches.length===1)carrier=matches[0].value;
  }catch{/* Keep unresolved carrier visible; never choose a similar company. */}
 }
 const prepared=resolveInstruction(m,result.ex,{...result,locations,carrier});
 if(!prepared.manual.inttra?.issuePlace){try{const r=await inttraRequest(owner,'/siact/geographySi','ISTANBUL') as {cities?:string[][]};const matches=(r.cities||[]).filter(([label])=>/^ISTANBUL,\s*TURKEY\s*\(TRIST\)$/i.test(label));if(matches.length===1)prepared.manual.inttra!.issuePlace=matches[0][1];}catch{/* Preserve a visible unresolved location if the lookup is unavailable. */}}
 for(const c of result.ex.containers){const number=c.containerNumber?.value;if(!number)continue;let edit=prepared.manual.containerOverrides.find(x=>(x.correctedNumber??x.containerNumber)===number);if(!edit){edit={containerNumber:number,containerType:'',sealNumber:''};prepared.manual.containerOverrides.push(edit);}for(const key of ['containerType','sealNumber'] as const)if(!edit[key]&&!(key==='sealNumber'&&edit.omitSeal)&&c[key]?.value&&c[key].confidence>=.95)edit[key]=c[key].value!;}
 for(const key of ['mblShipperName','mblShipperAddress','mblConsigneeName','mblConsigneeAddress','mblNotifyName','mblNotifyAddress','loadPort','dischargePort'] as const)if(!m.fieldOverrides[key])prepared.manual.fieldOverrides[key]=result.ex.fields[key]?.value||'';
 prepared.manual.tmaxxPackOptions=result.packOptions;
 prepared.manual=rememberSourceValues(m,prepared.manual);
 return {...prepared,locations};
}
