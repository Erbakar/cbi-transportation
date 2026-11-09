import {tmaxxValueEqual} from '../tmaxx-values';
import type {Extraction} from '../domain';
import type {Manual} from '../manual';
import {extractionForBill,houseBillIssues,containerKey} from '../house-bills';
import {prepareTmaxx,executeTmaxx,tmaxxClient,tmaxxSaveKeys,buildHblUpdate} from './tmaxx-workflow';
import {AppError} from './runtime';
import {runStep,type Run} from './platform-journal';

export async function prepareTmaxxBatch(owner:string,ex:Extraction,m:Manual){
 if(m.inttra?.houseBill!=='multiple')return {loads:[await prepareTmaxx(owner,ex,m)]};
 const issues=houseBillIssues(m,ex);if(issues.length)throw new AppError(issues.join('\n'),422);
 const loads=[];
 for(const bill of m.houseBills||[]){
  const part=extractionForBill(ex,bill,m);
  const indexes=ex.cargoLines.map((c,i)=>({c,i})).filter(({c})=>bill.containerNumbers.map(containerKey).includes(containerKey(c.containerNumber?.value)));
  const cargoOverrides=(m.cargoOverrides||[]).flatMap(row=>{const index=indexes.findIndex(v=>v.i===row.index);return index<0?[]:[{...row,index}];});
  const prepared=await prepareTmaxx(owner,part,{...m,cargoOverrides,houseBillNumber:bill.number});
  if(prepared.goodId!==bill.goodId)throw new AppError('HBL '+bill.number+': mevcut T-MAXX yükü değişmiş; bilgileri yeniden getirin.',422);
  loads.push(prepared);
 }
 return {loads};
}
export async function executeTmaxxBatch(run:Run,batch:Awaited<ReturnType<typeof prepareTmaxxBatch>>){
 const references=[];
 for(const load of batch.loads){
  const reference=await executeTmaxx(run,load,batch.loads.length>1?'load:'+load.goodId+':':'');
  await runStep(run,'tmaxx','hbl-result:'+load.goodId,{goodId:load.goodId},async()=>({goodId:load.goodId,reference}));
  references.push(reference);
 }
 return references.join(' · ');
}

// Verify every saved field of every load before treating an uncertain batch as completed.
export async function reconcileTmaxxBatch(owner:string,batch:Awaited<ReturnType<typeof prepareTmaxxBatch>>){
 if(!batch?.loads?.length)throw new AppError('T-MAXX aktarım planı bulunamadı.',409);
 const get=await tmaxxClient(owner),results=[];
 const matchedPacks=new Set<number>();
 for(const load of batch.loads){
  for(const update of load.updates)if(update.method==='PUT'&&update.path.endsWith('seaGoodPack'))matchedPacks.add(update.entityId);
  for(const update of load.updates){
   let actual:Record<string,unknown>;
   if(update.method==='POST'){
    const rows=await get('/api//sea/seaGoodPack/searchByOrder?query='+encodeURIComponent(JSON.stringify({'seaGood.id':load.goodId}))+'&orderBy='+encodeURIComponent(JSON.stringify('order by id desc'))) as Record<string,unknown>[];
    const matches=rows.filter(p=>!matchedPacks.has(Number(p.id))&&(p.seaContainer as {id?:number})?.id===(update.body.seaContainer as {id?:number})?.id&&tmaxxSaveKeys(update.path,update).filter(k=>k!=='seaContainer'&&Object.hasOwn(update.body,k)).every(k=>tmaxxValueEqual(k,p[k],update.body[k]))).sort((a,b)=>Number(a.id)-Number(b.id));
    if(!matches.length)throw new AppError('T-MAXX mal satırı sonucu tekil olarak doğrulanamadı.',409);actual=matches[0];matchedPacks.add(Number(actual.id));
   }else actual=await get(update.path+'/'+update.entityId) as Record<string,unknown>;
   for(const key of tmaxxSaveKeys(update.path,update).filter(k=>Object.hasOwn(update.body,k)))if(!tmaxxValueEqual(key,actual[key],update.body[key]))throw new AppError('T-MAXX yük '+load.goodId+': '+key+' henüz beklenen değerle eşleşmiyor. Tekrar gönderilmedi.',409);
  }
  const waybill=await get('/api//sea/def/seaGoodWaybill/getBySeaGoodId?goodId='+load.goodId) as {id:number;version:number;referenceNo?:string;seaGood?:{id:number};[key:string]:unknown};
  if(!waybill?.id||waybill.seaGood?.id!==load.goodId)throw new AppError('HBL kaydı doğrulanamadı.',409);
  const approved=load.updates.find(u=>u.path.endsWith('seaGoodWaybill')&&u.entityId===waybill.id);
  const expected:Record<string,unknown>=approved?.body??buildHblUpdate(waybill,load.ex,{legacy:load.hblFormatVersion!==2});
  for(const key of tmaxxSaveKeys('/seaGoodWaybill').filter(k=>Object.hasOwn(expected,k)))if(!tmaxxValueEqual(key,waybill[key],expected[key]))throw new AppError('HBL '+load.goodId+': '+key+' doğrulanamadı.',409);
  results.push({goodId:load.goodId,reference:String(waybill.referenceNo||load.reference)});
 }
 return results;
}
