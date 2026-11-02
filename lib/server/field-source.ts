import { AppError, digest } from './runtime';
import { tmaxxClient } from './tmaxx-workflow';
import type { FieldSource, CommonKey } from '../operations/field-operation';
type Entity=Record<string,unknown>;
const string=(v:unknown)=>typeof v==='string'?v.trim():'';
const name=(v:unknown)=>v&&typeof v==='object'?string((v as Entity).name):'';
export function fieldSourceValues(position:Entity,good:Entity):Partial<Record<CommonKey,string>> {
 const pairs:Partial<Record<CommonKey,string>>={
 bookingNumber:string(good.bookingNo)||string(good.rezervationNo)||string(position.rezervationNo),
 shipper:name(good.sender)||name(position.shipper),vessel:name(good.vessel)||name(position.vessel),
 voyage:string(good.voyageNo)||string(position.voyageNo),
 loadPort:name(good.fromPort)||name(position.fromPort),dischargePort:name(good.toPort)||name(position.toPort),
 carrier:name(good.shipOwner)||name(position.shipOwner),loadingAddress:string(good.loadAddress),
 loadingContact:string(good.phoneNoToMeet),emptyDepot:string(good.containerReceivingPlace),
 terminal:name(good.terminal)||name(position.terminal),customs:name(good.customsFirm)||name(good.declarationAgent),
 };
 return Object.fromEntries(Object.entries(pairs).filter(([,v])=>v));
}
export async function readFieldSource(owner:string,reference:string,goodId?:number){
 if(!reference.trim()||reference.length>200||/[\u0000-\u001f]/.test(reference))throw new AppError('Geçerli T-MAXX pozisyon referansı gerekli.');
 const get=await tmaxxClient(owner);
 const matches=await get('/api//sea/seaPosition/searchTreeNode?query='+encodeURIComponent(JSON.stringify({'referenceNo/LIKE':reference})));
 if(!Array.isArray(matches)||matches.length!==1||!Number.isSafeInteger(matches[0].id))throw new AppError('Referans tek bir T-MAXX pozisyonuyla eşleşmeli.',422);
 const position=await get('/api//sea/seaPosition/'+matches[0].id) as Entity;
 if(position.referenceNo!==reference||position.id!==matches[0].id)throw new AppError('T-MAXX pozisyon referansı tam eşleşmiyor.',422);
 const rows=await get('/api//sea/seaGood/searchTreeNode?query='+encodeURIComponent(JSON.stringify({'seaPosition.id':position.id})));
 if(!Array.isArray(rows)||rows.length>100)throw new AppError('Yük listesi doğrulanamadı.',502);
 const loads=rows.filter(r=>r.context==='seaGood'&&Number.isSafeInteger(r.id)).map(r=>({id:Number(r.id),label:string(r.label)||String(r.id)}));
 if(!goodId)return {loads,source:null,fingerprint:null};
 if(!loads.some(l=>l.id===goodId))throw new AppError('Seçilen yük bu pozisyona ait değil.',422);
 const good=await get('/api//sea/seaGood/'+goodId) as Entity;
 if(good.id!==goodId||(good.seaPosition as Entity)?.id!==position.id)throw new AppError('Yük ve pozisyon bağı doğrulanamadı.',422);
 const list=await get('/api//sea/seaContainer/findBySeaGoodId?seaGoodId='+goodId);
 if(!Array.isArray(list)||list.length>100||list.some(c=>!Number.isSafeInteger(c.id)||(c.seaGood?.id!==undefined&&c.seaGood.id!==goodId)))throw new AppError('Konteyner listesi doğrulanamadı.',502);
 const source:FieldSource={reference,positionId:Number(position.id),goodId,goodReference:string(good.referenceNo),checkedAt:new Date().toISOString(),values:fieldSourceValues(position,good),containers:list.map(c=>({id:c.id,number:string(c.no),type:name(c.containerType),seal:string(c.sealNo),...(typeof c.grossWeight==='number'&&c.grossWeight>0?{cargoGrossKg:String(c.grossWeight)}:{}),...(typeof c.tare==='number'&&c.tare>0?{tareKg:String(c.tare)}:{})})).sort((a,b)=>a.id-b.id)};
 if(source.containers.length && source.containers.every(c=>c.type)){
 const counts=new Map<string,number>();for(const c of source.containers)counts.set(c.type,(counts.get(c.type)||0)+1);
 source.values.equipment=[...counts].map(([type,n])=>n+' × '+type).join(', ');
 }
 if(!source.goodReference)throw new AppError('Yük referansı bulunamadı.',422);
 // Timestamp is not part of the content identity.
 return {loads,source,fingerprint:await digest(JSON.stringify({...source,checkedAt:undefined}))};
}
