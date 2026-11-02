import {AppError,db} from './runtime';
import {bookingTmaxxLink} from './booking-tmaxx';
import {tmaxxWorkspaceClient} from './tmaxx-workspace';
import {operationDates,goodOperationDates,fieldTextFields} from '../operations/tmaxx-operations';
type Entity=Record<string,unknown>;
const relation=(v:unknown)=>(v as {id?:number}|null)?.id;
const text=(v:unknown)=>typeof v==='string'?v:null;
export async function readTmaxxOperations(id:string,owner:string){
 const link=await bookingTmaxxLink(id,owner);if(!link)return {linked:false as const,checkedAt:new Date().toISOString(),dates:[],fields:[],containers:[]};
 const get=await tmaxxWorkspaceClient(owner),position=await get('/api//sea/seaPosition/'+link.position_id) as Entity,good=await get('/api//sea/seaGood/'+link.good_id) as Entity;
 if(position?.id!==link.position_id||good?.id!==link.good_id||position.referenceNo!==link.position_reference||good.referenceNo!==link.good_reference||relation(good.seaPosition)!==position.id||!Number.isInteger(position.version)||!Number.isInteger(good.version)||!relation(position.firm)||relation(position.firm)!==relation(good.firm))throw new AppError('T-MAXX pozisyon/yük kimliği doğrulanamadı.',409);
 const list=await get('/api//sea/seaContainer/findBySeaGoodId?seaGoodId='+link.good_id);
 if(!Array.isArray(list)||list.length>100||list.some(c=>!Number.isSafeInteger(c.id)||c.id<=0||relation(c.seaGood)!==link.good_id)||new Set(list.map(c=>c.id)).size!==list.length)throw new AppError('T-MAXX konteyner listesi doğrulanamadı.',502);
 const latestPosition=await get('/api//sea/seaPosition/'+link.position_id) as Entity,latestGood=await get('/api//sea/seaGood/'+link.good_id) as Entity;
 if(latestPosition.id!==position.id||latestGood.id!==good.id||latestPosition.version!==position.version||latestGood.version!==good.version||relation(latestGood.seaPosition)!==position.id)throw new AppError('T-MAXX kaydı okunurken değişti. Yenileyin.',409);
 const dates=(['position','good'] as const).flatMap(scope=>[...operationDates,...(scope==='good'?goodOperationDates:[])].map(f=>({scope,key:f.key,label:f.label,value:text((scope==='position'?position:good)[f.key])})));
 return {linked:true as const,positionReference:link.position_reference,goodReference:link.good_reference,checkedAt:new Date().toISOString(),dates,fields:fieldTextFields.map(f=>({label:f.label,value:text(good[f.key])})),containers:list.map(c=>({id:c.id,number:text(c.no),type:text(c.containerType?.name),seal:text(c.sealNo)}))};
}
export async function tmaxxCalendar(owner:string,hideTests=false){
 const {results:links}=await db().prepare(`SELECT l.booking_id FROM booking_tmaxx_links l WHERE l.owner=? ${hideTests?"AND NOT EXISTS (SELECT 1 FROM booking_reporting p WHERE p.booking_id=l.booking_id AND p.owner=l.owner AND json_extract(p.data,'$.test')=1)":''} ORDER BY l.created_at DESC LIMIT 51`).bind(owner).all<{booking_id:string}>();
 const bookings=[];for(let offset=0;offset<Math.min(links.length,50);offset+=3){const group=links.slice(offset,Math.min(offset+3,50));const values=await Promise.allSettled(group.map(l=>readTmaxxOperations(l.booking_id,owner)));bookings.push(...values.map((r,i)=>r.status==='fulfilled'?{bookingId:group[i].booking_id,data:r.value,error:null}:{bookingId:group[i].booking_id,data:null,error:r.reason instanceof Error?r.reason.message:'T-MAXX okunamadı.'}));}
 return {bookings,truncated:links.length>50,checkedAt:new Date().toISOString()};
}
