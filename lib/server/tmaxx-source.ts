import type {Extraction} from '../domain';
import {AppError} from './runtime';
import {tmaxxClient} from './tmaxx-workflow';
// Reference matching is explicit operator input; it is never inferred from the old MBL.
export async function tmaxxSource(owner:string,reference:string,source:Extraction){
 const get=await tmaxxClient(owner);const positions=await get('/api//sea/seaPosition/searchTreeNode?query='+encodeURIComponent(JSON.stringify({'referenceNo/LIKE':reference}))) as {id:number;label?:string}[];
 if(!Array.isArray(positions)||positions.length!==1)throw new AppError('T-MAXX pozisyon referansı tek bir kayıtla eşleşmeli.',422);
 const position=await get('/api//sea/seaPosition/'+positions[0].id) as Record<string,unknown>;
 if(position.referenceNo!==reference)throw new AppError('T-MAXX referansı tam eşleşmiyor.',422);
 const rows=await get('/api//sea/seaGood/searchTreeNode?query='+encodeURIComponent(JSON.stringify({'seaPosition.id':positions[0].id}))) as {id:number;context:string}[];
 const goods=rows.filter(g=>g.context==='seaGood');if(goods.length!==1)throw new AppError('Pozisyonda birden fazla yük var; yük referansı seçilmeli.',422);
 const good=await get('/api//sea/seaGood/'+goods[0].id) as Record<string,unknown>;
 const containers=await get('/api//sea/seaContainer/findBySeaGoodId?seaGoodId='+goods[0].id) as Record<string,unknown>[];
 if(!Array.isArray(containers)||containers.length!==source.containers.length)throw new AppError('Talimat ile T-MAXX konteyner adetleri eşleşmiyor.',422);
 const norm=(v:unknown)=>String(v||'').replace(/[\s-]/g,'').toUpperCase();
 const blank=containers.every(c=>!c.no&&!c.sealNo&&!Number(c.grossWeight));
 if(!blank&&(!source.containers.every(c=>containers.some(x=>norm(x.no)===norm(c.containerNumber?.value)))||containers.some(c=>!c.no)))throw new AppError('Referanstaki konteynerler talimatla tam eşleşmiyor.',422);
 const ex=structuredClone(source),provenance='T-MAXX '+reference;
 const fill=(fields:Extraction['fields'],key:string,value:unknown)=>{if(typeof value==='string'&&value.trim()&&!fields[key]?.value)fields[key]={value,source:provenance+' · '+key,confidence:1};};
 fill(ex.fields,'vessel',(position.vessel as {name?:string})?.name);fill(ex.fields,'voyage',position.voyageNo);fill(ex.fields,'loadPort',(position.fromPort as {name?:string})?.name);fill(ex.fields,'dischargePort',(position.toPort as {name?:string})?.name);
 const types=[...new Set(containers.map(c=>(c.containerType as {name?:string})?.name))];
 for(const c of ex.containers){const existing=containers.find(x=>norm(x.no)===norm(c.containerNumber?.value));fill(c,'containerType',existing?(existing.containerType as {name?:string})?.name:types.length===1?types[0]:undefined);if(existing)fill(c,'sealNumber',existing.sealNo);}
 if(ex.containers.length===1){fill(ex.fields,'containerType',ex.containers[0].containerType?.value);fill(ex.fields,'sealNumber',ex.containers[0].sealNumber?.value);}
 return {ex,goodId:goods[0].id,positionId:positions[0].id,reference,blankContainers:blank};
}
