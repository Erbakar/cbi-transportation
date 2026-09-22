import {resolveInstruction} from '../instruction-rules';
import type {Manual} from '../manual';
import {tmaxxSource} from './tmaxx-source';
import {inttraRequest} from './inttra-workflow';
export async function prepareSource(owner:string,m:Manual,result:Awaited<ReturnType<typeof tmaxxSource>>){
 const locations:Record<string,string>={};
 for(const key of ['loadPort','dischargePort','origin','destination'] as const){
  if(m.inttra?.[key])continue;
  const raw=result.ports[key]||result.ex.fields[key]?.value||'';
  const query=raw.replace(/^TCEEGE-/,'').replace(/^SOCAR\s+/,'').replace(/\s+-\s+[A-Z]{2,3}\s+-.*$/,'').trim();
  if(query.length<3||query.length>100)continue;
  try{const response=await inttraRequest(owner,'/siact/geographySi',query) as {cities?:string[][]};const matches=(response.cities||[]).filter(([label])=>label.split(',')[0].trim().toUpperCase()===query.toUpperCase());if(matches.length===1)locations[key]=matches[0][1];}catch{/* Unavailable/ambiguous lookup remains an explicit missing field. */}
 }
 return {...resolveInstruction(m,result.ex,{...result,locations}),locations};
}
