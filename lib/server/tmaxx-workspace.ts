import {z} from 'zod';
import {AppError} from './runtime';
import {contracts,fetchJson,platformSession} from './platforms';
import {normalizeTmaxxReference} from '../tmaxx-reference';
const origin='http://95.216.243.19:8090';
const identity=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const relation=z.object({id:identity,name:z.string().nullish()}).passthrough();
const entity=z.object({id:identity,referenceNo:z.string(),version:z.number().int().nonnegative()}).passthrough();
const node=z.object({id:identity,context:z.string()}).passthrough();
const archive=z.object({id:identity,entityid:identity,fileName:z.string(),reference:z.string().nullable(),contentType:z.string().nullable(),fileSize:z.number().nonnegative(),type:relation.nullable()}).passthrough();
export const positionReference=z.string().trim().min(5).max(100).regex(/^[A-Za-z0-9.\/-]+$/,'Geçerli T-MAXX pozisyon referansını girin.').transform(normalizeTmaxxReference);
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw new AppError('T-MAXX yanıtı beklenen kayıt yapısıyla eşleşmiyor.',502);return result.data;}
function text(value:unknown){return typeof value==='string'?value:'';}
function name(value:unknown){return value&&typeof value==='object'?text((value as {name?:unknown}).name):'';}
export async function tmaxxWorkspaceClient(owner:string){
 const contract=contracts().find(c=>c.id==='tmaxx');
 if(!contract?.authVerified&&!contract?.verified)throw new AppError('T-MAXX bağlantısı doğrulanmalı.',503);
 let session=await platformSession(contract!,owner);
 return async(path:string)=>{
  const read=async()=>(await fetchJson(origin+path,{method:'GET',headers:{Authorization:'Bearer '+session.token,Cookie:session.cookie}})).data;
  try{return await read();}catch(error){
   // The native client can invalidate a cached ERP session. Retry only a read,
   // once, after an explicit 401; never replay writes or connectivity failures.
   if((error as {platformStatus?:number})?.platformStatus!==401)throw error;
   session=await platformSession(contract!,owner,true);
   return read();
  }
 };
}
export async function readTmaxxPosition(owner:string,reference:string){
 const ref=parse(positionReference,reference),get=await tmaxxWorkspaceClient(owner);
 const nodes=parse(z.array(node),await get('/api//sea/seaPosition/searchTreeNode?query='+encodeURIComponent(JSON.stringify({'referenceNo/LIKE':ref}))));
 const candidates=nodes.filter(n=>n.context==='seaPosition');
 if(candidates.length!==1)throw new AppError('Pozisyon tekil olarak bulunamadı. Tam T-MAXX referansını girin.',422);
 const position=parse(entity,await get('/api//sea/seaPosition/'+candidates[0].id));
 if(position.id!==candidates[0].id||position.referenceNo!==ref)throw new AppError('T-MAXX pozisyon referansı tam eşleşmiyor.',409);
 const rows=parse(z.array(node),await get('/api//sea/seaGood/searchTreeNode?query='+encodeURIComponent(JSON.stringify({'seaPosition.id':position.id})))).filter(n=>n.context==='seaGood');
 if(rows.length>50||new Set(rows.map(r=>r.id)).size!==rows.length)throw new AppError('Pozisyondaki yük listesi doğrulanamadı.',502);
 const loads=[];
 const documents=[];
 async function docs(id:number,scope:string){
  const list=parse(z.array(archive),await get('/api//document/doc/findByEntityId?entityid='+id));
  if(list.some(d=>d.entityid!==id))throw new AppError('Arşiv belgesi farklı bir kayda ait.',502);
  return list.map(d=>({id:d.id,entityId:id,scope,filename:d.fileName,size:d.fileSize,type:name(d.type),downloadable:!!d.reference}));
 }
 documents.push(...await docs(position.id,ref));
 for(const row of rows){
  const good=parse(entity,await get('/api//sea/seaGood/'+row.id));
  if(good.id!==row.id||parse(relation,good.seaPosition).id!==position.id)throw new AppError('Yükün pozisyon bağlantısı doğrulanamadı.',409);
  loads.push({id:good.id,reference:good.referenceNo,version:good.version,customer:name(good.customer),shipper:name(good.sender),consignee:name(good.consignee),booking:text(good.bookingNo)||text(good.rezervationNo),hbl:text(good.hblNo)});
  documents.push(...await docs(good.id,good.referenceNo));
 }
 // Detect changes while reading the multi-entity snapshot instead of mixing versions.
 const latest=parse(entity,await get('/api//sea/seaPosition/'+position.id));
 if(latest.version!==position.version)throw new AppError('Pozisyon okunurken değişti. Yeniden sorgulayın.',409);
 return {source:'T-MAXX' as const,checkedAt:new Date().toISOString(),position:{id:position.id,reference:ref,version:position.version,vessel:name(position.vessel),voyage:text(position.voyageNo),carrier:name(position.shipOwner),loadPort:name(position.fromPort),dischargePort:name(position.toPort),status:name(position.status),assignee:name(position.operationRepresentative),mbl:text(position.masterBlNo),locked:position.isLocked===true,dates:{etd:text(position.etd),eta:text(position.eta),vgm:text(position.vgmCutoffDate),documents:text(position.bdCutoffDate)}},loads,documents};
}
export async function readTmaxxArchiveFile(owner:string,reference:string,documentId:number){
 identity.parse(documentId);
 const snapshot=await readTmaxxPosition(owner,reference);
 const listed=snapshot.documents.find(d=>d.id===documentId);
 if(!listed)throw new AppError('Belge bu pozisyonun arşivinde bulunamadı.',404);
 const get=await tmaxxWorkspaceClient(owner),doc=parse(archive,await get('/api//document/doc/'+documentId));
 if(doc.entityid!==listed.entityId||!doc.reference||!/^[a-zA-Z0-9_-]{1,128}$/.test(doc.reference))throw new AppError('Belge bağlantısı doğrulanamadı.',409);
 const file=parse(z.object({obj:z.object({_id:z.string(),entityid:z.union([z.string(),z.number()]).nullable(),entity:z.string(),fileName:z.string(),contentType:z.string(),fileSize:z.number(),file:z.object({data:z.string().max(15_000_000)})})}),await get('/api/uploader/getByID/'+doc.reference)).obj;
 let fileEntity: {entityid:number};try{fileEntity=parse(z.object({entityid:identity}),JSON.parse(file.entity));}catch{throw new AppError('Arşiv dosyası kayıt bilgileri doğrulanamadı.',502);}
 if(file._id!==doc.reference||fileEntity.entityid!==doc.entityid||(file.entityid!==null&&String(file.entityid)!==String(doc.entityid))||file.fileSize!==doc.fileSize)throw new AppError('Arşiv dosyası ilgili belgeyle eşleşmiyor.',502);
 if(!/^[A-Za-z0-9+/]*={0,2}$/.test(file.file.data))throw new AppError('Belge içeriği doğrulanamadı.',502);
 const bytes=Uint8Array.from(atob(file.file.data),c=>c.charCodeAt(0));
 if(bytes.length!==doc.fileSize||bytes.length>10*1024*1024)throw new AppError('Belge boyutu doğrulanamadı.',502);
 return {bytes,filename:doc.fileName,entityId:doc.entityid};
}
export type TmaxxPositionSnapshot=Awaited<ReturnType<typeof readTmaxxPosition>>;
