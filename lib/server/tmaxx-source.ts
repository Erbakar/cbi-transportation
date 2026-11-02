import type {Extraction} from '../domain';
import {AppError} from './runtime';
import {tmaxxClient} from './tmaxx-workflow';
import {applyTmaxxParties,type SourcePosition,type AgentAddress} from '../tmaxx-parties';
import {containerKey} from '../house-bills';
import {normalizeTmaxxReference} from '../tmaxx-reference';
type SourceLoad={id:number;reference:string;good:Record<string,unknown>;containers:Record<string,unknown>[];blank:boolean};
export function selectSourceLoads(loads:SourceLoad[],source:Extraction){
 const expected=new Set(source.containers.map(c=>containerKey(c.containerNumber?.value)));
 if(expected.has('')||!expected.size)throw new AppError('Yük eşleştirmek için konteyner numaralarını tamamlayın.',422);
 if(loads.length===1&&loads[0].blank&&loads[0].containers.length===expected.size)return loads;
 const selected=loads.filter(l=>l.containers.some(c=>expected.has(containerKey(c.no))));
 const seen=new Set<string>();
 for(const l of selected)for(const c of l.containers){const n=containerKey(c.no);if(!expected.has(n)||seen.has(n))throw new AppError('Yük/konteyner eşleşmesi tekil değil veya yükte ek konteyner var.',422);seen.add(n);}
 if(seen.size!==expected.size)throw new AppError('Talimat konteynerleri T-MAXX yükleriyle tam eşleşmiyor. Birden fazla yükte boş konteynerler otomatik atanamaz.',422);
 return selected;
}
// Reference matching is explicit operator input; it is never inferred from the old MBL.
export async function tmaxxSource(owner:string,reference:string,source:Extraction){
 reference=normalizeTmaxxReference(reference);
 const get=await tmaxxClient(owner);const positions=await get('/api//sea/seaPosition/searchTreeNode?query='+encodeURIComponent(JSON.stringify({'referenceNo/LIKE':reference}))) as {id:number;label?:string}[];
 if(!Array.isArray(positions)||positions.length!==1)throw new AppError('T-MAXX pozisyon referansı tek bir kayıtla eşleşmeli.',422);
 const position=await get('/api//sea/seaPosition/'+positions[0].id) as Record<string,unknown>;
 if(position.referenceNo!==reference)throw new AppError('T-MAXX referansı tam eşleşmiyor.',422);
 const rows=await get('/api//sea/seaGood/searchTreeNode?query='+encodeURIComponent(JSON.stringify({'seaPosition.id':positions[0].id}))) as {id:number;context:string}[];
 const goods=rows.filter(g=>g.context==='seaGood');if(!goods.length||goods.length>50)throw new AppError('Pozisyon yükleri doğrulanamadı.',422);
 const candidates:SourceLoad[]=[];
 for(const row of goods){const g=await get('/api//sea/seaGood/'+row.id) as Record<string,unknown>;const c=await get('/api//sea/seaContainer/findBySeaGoodId?seaGoodId='+row.id) as Record<string,unknown>[];if(g.id!==row.id||!Array.isArray(c))throw new AppError('T-MAXX yük yanıtı doğrulanamadı.',502);candidates.push({id:row.id,reference:String(g.referenceNo||''),good:g,containers:c,blank:c.every(x=>!x.no&&!x.sealNo&&!Number(x.grossWeight))});}
 const loads=selectSourceLoads(candidates,source),good=loads[0].good;
 const containers=loads.flatMap(l=>l.containers);
 if(!Array.isArray(containers)||containers.length!==source.containers.length)throw new AppError('Talimat ile T-MAXX konteyner adetleri eşleşmiyor.',422);
 const norm=(v:unknown)=>String(v||'').replace(/[\s-]/g,'').toUpperCase();
 const blank=loads.length===1&&loads[0].blank;
 if(!blank&&(!source.containers.every(c=>containers.some(x=>norm(x.no)===norm(c.containerNumber?.value)))||containers.some(c=>!c.no)))throw new AppError('Referanstaki konteynerler talimatla tam eşleşmiyor.',422);
 const ex=structuredClone(source),provenance='T-MAXX '+reference;
 const selected=position as SourcePosition;
 const address=selected.abroadAgent&&selected.abroadAgentAddress?.id?await get('/api//marketing/def/addressCard/'+selected.abroadAgentAddress.id) as AgentAddress:undefined;
 try{applyTmaxxParties(ex,selected,address,reference);}catch(error){throw new AppError((error as Error).message,422);}
 const fill=(fields:Extraction['fields'],key:string,value:unknown)=>{if(typeof value==='string'&&value.trim()&&!fields[key]?.value)fields[key]={value,source:provenance+' · '+key,confidence:1};};
 fill(ex.fields,'vessel',(position.vessel as {name?:string})?.name);fill(ex.fields,'voyage',position.voyageNo);fill(ex.fields,'loadPort',(position.fromPort as {name?:string})?.name);fill(ex.fields,'dischargePort',(position.toPort as {name?:string})?.name);
 // The operator explicitly selects this position as the source of port information.
 for(const [key,link]of [['loadPort',position.fromPort],['dischargePort',position.toPort]] as const){const name=(link as {name?:string})?.name;if(name?.trim())ex.fields[key]={value:name,source:provenance+' · '+key,confidence:1};}
 fill(ex.fields,'bookingNumber',good.bookingNo||good.rezervationNo||position.rezervationNo);
 const types=[...new Set(containers.map(c=>(c.containerType as {name?:string})?.name))];
 for(const c of ex.containers){const existing=containers.find(x=>norm(x.no)===norm(c.containerNumber?.value));fill(c,'containerType',existing?(existing.containerType as {name?:string})?.name:types.length===1?types[0]:undefined);if(existing&&!ex.omittedSeals?.includes(c.containerNumber?.value||''))fill(c,'sealNumber',existing.sealNo);}
 if(ex.containers.length===1){fill(ex.fields,'containerType',ex.containers[0].containerType?.value);fill(ex.fields,'sealNumber',ex.containers[0].sealNumber?.value);}
 if(loads.some(l=>!Object.hasOwn(l.good,'placeOfDeliveryCity')))throw new AppError('T-MAXX teslim şehri bilgisi doğrulanamadı.',422);
 if(new Set(loads.map(l=>(l.good.placeOfDeliveryCity as {name?:string})?.name||'')).size>1)throw new AppError('Seçili yüklerin teslim şehirleri farklı; ayrı MBL kapsamı doğrulanmalı.',422);
 const destination=(good.placeOfDeliveryCity as {name?:string})?.name;
 const packOptions=[];
 for(const load of loads){const packs=await get('/api//sea/seaGoodPack/searchByOrder?query='+encodeURIComponent(JSON.stringify({'seaGood.id':load.id}))+'&orderBy='+encodeURIComponent(JSON.stringify('order by id desc'))) as Record<string,unknown>[];if(!Array.isArray(packs))throw new AppError('Mal satırları okunamadı.',502);for(const p of packs){const container=load.containers.find(c=>c.id===(p.seaContainer as {id?:number})?.id);packOptions.push({id:Number(p.id),containerNumber:String(container?.no||''),description:String(p.goodDescription||''),quantity:Number(p.quantity||0),grossWeight:Number(p.grossWeight||0)});}}
 const houseBills=loads.map(l=>({goodId:l.id,reference:l.reference,number:String(l.good.hblNo||''),containerNumbers:blank?ex.containers.map(c=>c.containerNumber.value!):l.containers.map(c=>String(c.no)),fieldOverrides:{},partyOverrides:{}}));
 return {ex,loads,houseBills,packOptions,carrierName:(position.shipOwner as {name?:string})?.name||'',goodId:loads[0].id,positionId:positions[0].id,reference,blankContainers:blank,moveType:destination?'3':'1',houseBillNumber:typeof good.hblNo==='string'?good.hblNo:'',blReference:typeof position.masterBlNo==='string'?position.masterBlNo:'',agentName:selected.abroadAgent?.name||'',payments:{freight:position.freightPayment,local:position.localPayment,discharge:position.dischargePayment},ports:{loadPort:(position.fromPort as {name?:string})?.name,dischargePort:(position.toPort as {name?:string})?.name,origin:(position.fromPort as {name?:string})?.name,destination:(position.toPort as {name?:string})?.name,transportDestination:destination||''}};
}
