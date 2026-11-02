import {z} from 'zod';
import {AppError} from './runtime';
import {tmaxxWorkspaceClient} from './tmaxx-workspace';
export function sourceTime(value:string){return Date.parse(value+(/(?:Z|[+-]\d\d:\d\d)$/.test(value)?'':'+03:00'));}
export function inRecentMonth(value:string,now:number){const time=sourceTime(value);return Number.isFinite(time)&&time>=now-30*86400000&&time<=now;}
const doc=z.object({id:z.number().int().positive(),entityid:z.number().int().positive(),sourceType:z.string(),createDate:z.string(),fileName:z.string().nullable(),reference:z.string().nullable(),type:z.object({id:z.number().optional(),code:z.string().nullish(),name:z.string().nullish()}).nullable()});
export type RecentDocument={id:number;reference:string;filename:string;date:string;kind:string;type:string;download:string|null};
// Read archive dates directly: recent documents may belong to much older positions.
export async function recentPlatformDocuments(owner:string,offset=0,now=Date.now(),documentOffset:number|null=null){
 const get=await tmaxxWorkspaceClient(owner);
 const day=new Date(now+3*3600000-offset*86400000).toISOString().slice(0,10);
 const query=JSON.stringify({'createDate/DT/GT':day+'T00:00:00.000','createDate/DT/LT':day+'T23:59:59.999'});
 let limit=200,list:z.infer<typeof doc>[]=[];
 for(;;){
  list=z.array(doc).parse(await get('/api//document/doc/searchByOrderAndLimit?'+new URLSearchParams({query,orderBy:'order by id desc',limit:String(limit)})));
  if(list.length<limit)break;
  if(limit>=12800)throw new AppError('Bu günün arşivi tek okumada tamamlanamadı. Sonuçlar eksik olabilir.',502);
  limit*=2;
 }
 const types=z.array(z.object({id:z.number(),code:z.string(),name:z.string()})).parse(await get('/api//document/def/docType/searchByOrder?query=%7B%7D&orderBy=%22order%20by%20id%22'));
 const documents:RecentDocument[]=[],failures:number[]=[];
 const references=new Map<string,Promise<string>>();
 async function positionReference(d:z.infer<typeof doc>){
  const key=d.sourceType+':'+d.entityid;
  if(!references.has(key))references.set(key,(async()=>{
   const p=z.object({id:z.number(),referenceNo:z.string(),seaPosition:z.object({id:z.number()}).nullish()}).parse(await get('/api//sea/'+(d.sourceType==='SeaGood'?'seaGood':'seaPosition')+'/'+d.entityid));
   if(p.id!==d.entityid)throw new Error('Arşiv hedefi eşleşmedi');
   if(d.sourceType==='SeaPosition')return p.referenceNo;
   if(!p.seaPosition)throw new Error('Yükün pozisyonu bulunamadı');
   const parent=z.object({id:z.number(),referenceNo:z.string()}).parse(await get('/api//sea/seaPosition/'+p.seaPosition.id));
   if(parent.id!==p.seaPosition.id)throw new Error('Pozisyon eşleşmedi');
   return parent.referenceNo;
  })());
  return references.get(key)!;
 }
 const eligible=list.filter(d=>['SeaPosition','SeaGood'].includes(d.sourceType)&&inRecentMonth(d.createDate,now));
 // At most 40 entity reads plus archive/auth requests per Worker invocation.
 const candidates=documentOffset===null?eligible:eligible.slice(documentOffset,documentOffset+20);
 const nextDocumentOffset=documentOffset!==null&&documentOffset+20<eligible.length?documentOffset+20:null;
 let index=0;
 async function worker(){while(index<candidates.length){const d=candidates[index++];try{
  const reference=await positionReference(d),definition=types.find(t=>t.id===d.type?.id);
  const code=(definition?.code||d.type?.code||d.type?.name?.split(' - ')[0])?.trim();
  documents.push({id:d.id,reference,filename:d.fileName||`Belge ${d.id}`,date:new Date(sourceTime(d.createDate)).toISOString(),kind:code==='PRA'?'Pre-alert':code==='VOT'?'VGM talep / ödeme formu':code==='BCM'?'Booking teyidi':'Arşiv belgesi',type:(definition?.name||d.type?.name)?.trim()||'Tür belirtilmemiş',download:d.reference?'/api/tmaxx/position/document?'+new URLSearchParams({reference,id:String(d.id)}):null});
 }catch{failures.push(d.id);}}}
 await Promise.all([worker(),worker(),worker()]);
 return {documents,failures,scanned:nextDocumentOffset===null?offset+1:offset,available:31,next:nextDocumentOffset!==null?offset:offset<30?offset+1:null,nextDocumentOffset,checkedAt:new Date(now).toISOString()};
}
