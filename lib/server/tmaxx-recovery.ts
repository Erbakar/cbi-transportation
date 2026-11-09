import {tmaxxClient,tmaxxSaveKeys} from './tmaxx-workflow';
import {AppError,digest} from './runtime';
import {tmaxxCargoIssues,numericTmaxxFields,parseTmaxxEdit,tmaxxFieldLabels,tmaxxValueEqual,tmaxxNetWeightInDescription} from '../tmaxx-values';
import type {prepareTmaxxBatch} from './tmaxx-batch';
export type RecoveryBatch=Awaited<ReturnType<typeof prepareTmaxxBatch>>;
export async function inspectTmaxxRecovery(owner:string,batch:RecoveryBatch){
 const get=await tmaxxClient(owner),rows=[],issues:{id:string;message:string}[]=[],entities:Record<string,unknown>[]=[],blockers:string[]=[];
 for(const [li,load] of batch.loads.entries()){
  if(load.needsWaybill)blockers.push('HBL oluşturma adımının sonucu ayrıca doğrulanmalı; bu ekran yalnız mevcut kayıtları günceller.');
  for(const [ui,u] of load.updates.entries()){
   if(u.path.endsWith('seaGoodPack'))for(const issue of tmaxxCargoIssues(u.body))issues.push({id:`${li}:${ui}:${issue.key}`,message:issue.message});
   if(u.method!=='PUT'){blockers.push('Yeni mal satırının sonucu ayrıca doğrulanmalı.');continue;}
   const actual=await get(u.path+'/'+u.entityId) as Record<string,unknown>;
   if(actual?.id!==u.entityId||!Number.isInteger(actual.version))throw new AppError('T-MAXX mevcut kayıt okunamadı.',502);
   entities.push(actual);
   const scope=u.path.endsWith('seaContainer')?'Konteyner '+String(actual.no||u.body.no):u.path.endsWith('seaGoodPack')?'Mal satırı '+(load.updates.filter(x=>x.path.endsWith('seaGoodPack')).indexOf(u)+1):u.path.endsWith('seaGood')?'Yük toplamı':'HBL';
   for(const key of tmaxxSaveKeys(u.path,u).filter(k=>Object.hasOwn(u.body,k))){
    if(key==='seaContainer'){if(!tmaxxValueEqual(key,actual[key],u.body[key]))blockers.push('Mal satırının konteyner bağlantısı değişmiş; yük eşleşmesi kontrol edilmeli.');continue;}
    const printedNet=key==='netWeight'&&u.path.endsWith('seaGoodPack')?tmaxxNetWeightInDescription(u.body):null;
    rows.push({id:`${li}:${ui}:${key}`,scope,load:load.reference,label:tmaxxFieldLabels[key]||key,key,current:String(key==='containerType'?(actual[key] as {name?:string})?.name||'':actual[key]??''),expected:String(key==='containerType'?(u.body[key] as {name?:string})?.name||'':u.body[key]??''),...(printedNet!==null?{displayValue:printedNet,note:'Net ağırlık mal açıklamasında yer alıyor. Burada tekrar girmenize gerek yok.'}:{}),matches:tmaxxValueEqual(key,actual[key],u.body[key]),numeric:numericTmaxxFields.has(key),derived:['hblType','hblOrginalCount'].includes(key)||numericTmaxxFields.has(key)&&!u.path.endsWith('seaGoodPack')&&load.updates.some(p=>p.path.endsWith('seaGoodPack')&&(u.path.endsWith('seaGood')||(p.body.seaContainer as {id?:number})?.id===u.entityId))});
   }
  }
 }
 return {rows,issues,blockers:[...new Set(blockers)],fingerprint:await digest(JSON.stringify({batch,entities})),entities};
}
export function applyRecoveryEdits(batch:RecoveryBatch,rows:{id:string;key:string;expected:string}[],edits:Record<string,string>){
 const next=structuredClone(batch),allowed=new Map(rows.map(r=>[r.id,r]));
 for(const [id,value]of Object.entries(edits)){
  const row=allowed.get(id);if(!row||typeof value!=='string')throw new AppError('Geçersiz düzeltme alanı.',422);
  if(row.key==='containerType'&&value.replace(/\s/g,'').toUpperCase()===row.expected.replace(/\s/g,'').toUpperCase())continue;
  if(['no','hblNo','bookingNo','hblType','hblOrginalCount'].includes(row.key)&&value!==row.expected)throw new AppError('Kayıt kimliği bu düzeltme ekranında değiştirilemez.',422);
  const [li,ui]=id.split(':').map(Number);
  // Existing clients include the intentionally empty numeric field in all edits.
  // Retain null; preview still validates the possibly edited description below.
  if(row.key==='netWeight'&&value===''&&tmaxxNetWeightInDescription(batch.loads[li].updates[ui].body)!==null)continue;
  try{if(!value.trim()&&['packing','goodDescription','consignor','consignee','notify','portOfLoading','portOfDischarge','quantityAndDescription'].includes(row.key))throw Error('Bu alan boş bırakılamaz.');next.loads[li].updates[ui].body[row.key]=parseTmaxxEdit(row.key,value);}catch(e){throw new AppError(row.key+': '+(e as Error).message,422);}
 }
 // Aggregate facts can be calculated with certainty from the reviewed cargo rows.
 for(const [loadIndex,load] of next.loads.entries()){
  const originalPacks=batch.loads[loadIndex].updates.filter(u=>u.path.endsWith('seaGoodPack'));
  const packs=load.updates.filter(u=>u.path.endsWith('seaGoodPack'));
  if(packs.length){
   for(const [index,pack] of packs.entries()){
    const old=originalPacks[index].body;
    if(pack.body.goodDescription===old.goodDescription&&!tmaxxValueEqual('netWeight',old.netWeight,pack.body.netWeight)){
     const previous='NET WEIGHT: '+old.netWeight+' KG';
     pack.body.goodDescription=String(pack.body.goodDescription??'').split('\n').map(line=>line.trim()===previous?'NET WEIGHT: '+pack.body.netWeight+' KG':line).join('\n');
    }
   }
   const originalDescription=originalPacks.map(p=>p.body.goodDescription??'').join('\n\n');
   for(const u of load.updates)if(u.path.endsWith('seaGoodWaybill')&&u.body.quantityAndDescription===originalDescription)u.body.quantityAndDescription=packs.map(p=>p.body.goodDescription??'').join('\n\n');
   for(const u of load.updates){
    const selected=u.path.endsWith('seaGood')?packs:u.path.endsWith('seaContainer')?packs.filter(p=>(p.body.seaContainer as {id?:number})?.id===u.entityId):[];
    if(!selected.length)continue;
    for(const key of u.path.endsWith('seaGood')?['quantity','grossWeight','netWeight','volume']:['grossWeight'])if(selected.every(p=>p.body[key]!==undefined&&Number.isFinite(Number(p.body[key]))))u.body[key]=Number(selected.reduce((sum,p)=>sum+Number(p.body[key]),0).toFixed(6));
   }
  }
 }
 return next;
}

export async function resolveRecoveryTypes(owner:string,batch:RecoveryBatch){
 const get=await tmaxxClient(owner);let types:Record<string,unknown>[]|undefined;
 for(const load of batch.loads)for(const u of load.updates)if(typeof u.body.containerType==='string'){
  types??=await get('/api//sea/def/seaContainerType/searchByOrder?query=%7B%7D&orderBy=%22order%20by%20id%22') as Record<string,unknown>[];
  const matches=types.filter(t=>String(t.name).replace(/\s/g,'').toUpperCase()===String(u.body.containerType).replace(/\s/g,'').toUpperCase());if(matches.length!==1)throw new AppError('Konteyner tipi T-MAXX listesinde tekil değil; mevcut tipi koruyun veya başka bir tip seçin.',422);
  u.body.containerType=matches[0];
 }
 return batch;
}
export async function currentRecoveryBatch(owner:string,batch:RecoveryBatch){
 const get=await tmaxxClient(owner),next=structuredClone(batch);
 for(const load of next.loads){
  if(load.needsWaybill){const waybill=await get('/api//sea/def/seaGoodWaybill/getBySeaGoodId?goodId='+load.goodId) as {id:number;version:number;seaGood?:{id:number};[key:string]:unknown};if(!waybill.id||waybill.seaGood?.id!==load.goodId)throw new AppError('Mevcut HBL doğrulanamadı.',409);load.updates.push({path:'/api//sea/def/seaGoodWaybill',method:'PUT',entityId:waybill.id,body:waybill});load.needsWaybill=false;}
  for(const u of load.updates){if(u.method!=='PUT')throw new AppError('Bu yükün yeni mal satırları önce doğrulanmalı.',409);u.body=await get(u.path+'/'+u.entityId) as typeof u.body;}
 }
 return next;
}
