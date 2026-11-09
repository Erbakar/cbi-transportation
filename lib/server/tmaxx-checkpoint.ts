import {tmaxxValueEqual} from '../tmaxx-values';
import {AppError,db,digest} from './runtime';
import {orderTmaxxUpdates,tmaxxClient,tmaxxSaveKeys,type TMaxxUpdate} from './tmaxx-workflow';
import type {prepareTmaxxBatch} from './tmaxx-batch';
import type {Run} from './platform-journal';

export type TmaxxBatch=Awaited<ReturnType<typeof prepareTmaxxBatch>>;
export type TmaxxStep={step:string;status:string;request_hash:string;result:string|null};
export const tmaxxSteps=(run:Run)=>db().prepare("SELECT step,status,request_hash,result FROM platform_steps WHERE record_id=? AND revision=? AND platform='tmaxx'").bind(run.id,run.revision).all<TmaxxStep>();

// This deliberately resolves only started, identifiable updates. An uncertain create
// still needs full reconciliation; a missing response must never cause another create.
export async function inspectTmaxxCheckpoint(owner:string,batch:TmaxxBatch,steps:TmaxxStep[]){
 if(!batch?.loads?.length||!steps.length)throw new AppError('Devam edilecek T-MAXX aktarım adımı bulunamadı.',409);
 const planned:{step:string;request:unknown;update?:TMaxxUpdate;goodId:number;kind:'update'|'create'|'result'}[]=[];
 for(const load of batch.loads){
  const prefix=batch.loads.length>1?'load:'+load.goodId+':':'';
  for(const update of orderTmaxxUpdates(load.updates))planned.push({step:prefix+update.path+':'+update.entityId+(update.lineIndex===undefined?'':':line:'+update.lineIndex),request:update,update,goodId:load.goodId,kind:'update'});
  if(load.needsWaybill)for(const step of ['create-hbl','save-new-hbl'])planned.push({step:prefix+step,request:null,goodId:load.goodId,kind:'create'});
  planned.push({step:'hbl-result:'+load.goodId,request:{goodId:load.goodId},goodId:load.goodId,kind:'result'});
 }
 if(new Set(steps.map(s=>s.step)).size!==steps.length||steps.some(s=>!planned.some(p=>p.step===s.step)))throw new AppError('T-MAXX işlem geçmişi kayıtlı planla eşleşmiyor.',409);
 const get=await tmaxxClient(owner),verified:{step:string;requestHash:string;result:unknown}[]=[];
 let pending=false;
 for(const plan of planned){
  const saved=steps.find(s=>s.step===plan.step);
  if(!saved){pending=true;continue;}
  if(pending||!['complete','unknown','sending'].includes(saved.status)||plan.kind==='create'||plan.update?.method==='POST')throw new AppError('T-MAXX oluşturma veya işlem sırası ayrıca doğrulanmalı. Tekrar gönderilmedi.',409);
  const hash=await digest(JSON.stringify(plan.request));
  if(saved.request_hash!==hash)throw new AppError('T-MAXX kayıtlı aktarım planı değişmiş. Tekrar gönderilmedi.',409);
  if(plan.update){
   const u=plan.update;
   if(!['/api//sea/seaGoodPack','/api//sea/seaContainer','/api//sea/seaGood','/api//sea/def/seaGoodWaybill'].includes(u.path)||!Number.isSafeInteger(u.entityId)||u.entityId<=0)throw new AppError('T-MAXX kayıt kimliği doğrulanamadı.',409);
   const actual=await get(u.path+'/'+u.entityId) as Record<string,unknown>;
   const keys=tmaxxSaveKeys(u.path,u).filter(k=>Object.hasOwn(u.body,k));
   if(actual?.id!==u.entityId||!Number.isInteger(actual.version)||Number(actual.version)<Number(u.body.version)||!keys.every(k=>tmaxxValueEqual(k,actual[k],u.body[k])))throw new AppError('T-MAXX yük '+plan.goodId+': kaydedilen adım beklenen bilgilerle eşleşmiyor. Tekrar gönderilmedi.',409);
   verified.push({step:plan.step,requestHash:hash,result:{id:actual.id,version:actual.version}});
  }else{
   const waybill=await get('/api//sea/def/seaGoodWaybill/getBySeaGoodId?goodId='+plan.goodId) as {id:number;seaGood?:{id:number};referenceNo?:string};
   const result=saved.result?JSON.parse(saved.result):null;
   if(saved.status!=='complete'||!waybill?.id||waybill.seaGood?.id!==plan.goodId||result?.goodId!==plan.goodId||String(waybill.referenceNo||'')!==result.reference)throw new AppError('Tamamlanan HBL sonucu doğrulanamadı.',409);
   verified.push({step:plan.step,requestHash:hash,result});
  }
 }
 return {verified,remaining:pending};
}

export async function resumeTmaxxPlan(run:Run,payload:string){
 const stored=JSON.parse(payload),batch:TmaxxBatch=stored.loads?stored:{loads:[stored]};
 const {results}=await tmaxxSteps(run);
 if(!results.length)return null;
 if(results.some(s=>s.status!=='complete'))throw new AppError('Önce T-MAXX’teki mevcut kayıtları doğrulayın.',409);
 await inspectTmaxxCheckpoint(run.owner,batch,results);
 // Retain the exact request hashes from the first attempt, including original
// versions. executeTmaxx refreshes pending entities immediately before writing.
 return batch;
}
