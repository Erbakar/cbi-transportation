import {z} from 'zod';
import {AppError,db} from './runtime';
import {bookingTmaxxLink} from './booking-tmaxx';
import {tmaxxWorkspaceClient,readTmaxxPosition} from './tmaxx-workspace';
const line=z.object({customerName:z.string().nullable(),itemName:z.string().nullable(),itemOwner:z.string().nullable(),invoiceDate:z.string().nullable(),status:z.string().nullable(),debitCredit:z.string(),currency:z.string().min(1),amount:z.number().finite(),vatAmount:z.number().finite().nullable(),totalAmount:z.number().finite().nullable(),positionReference:z.string().nullable(),goodReference:z.string().nullable(),isLocked:z.boolean()});
export async function readTmaxxFinance(id:string,owner:string){
 const link=await bookingTmaxxLink(id,owner);if(!link)return {linked:false as const,lines:[],checkedAt:new Date().toISOString()};
 const get=await tmaxxWorkspaceClient(owner),good=await get('/api//sea/seaGood/'+link.good_id) as {id:number;version:number;referenceNo:string;seaPosition?:{id:number};firm?:{id:number}};
 if(good?.id!==link.good_id||good.referenceNo!==link.good_reference||good.seaPosition?.id!==link.position_id||!Number.isSafeInteger(good.firm?.id))throw new AppError('Finans için T-MAXX yük eşleşmesi doğrulanamadı.',409);
 const query={entityId:link.good_id,operationType:'SEA',entityType:'GOOD',status:'',showType:'',showOtherDetails:'',firmId:good.firm!.id,branchIds:[]};
 const result=z.object({details:z.array(z.object({reference:z.string(),tableLines:z.array(line)}))}).safeParse(await get('/api//finance/costAndRevenue/getCostAndRevenue?query='+encodeURIComponent(JSON.stringify(query))));
 if(!result.success||result.data.details.some(d=>d.reference!==link.good_reference||d.tableLines.some(r=>r.positionReference!==link.position_reference||r.goodReference!==link.good_reference)))throw new AppError('Finans satırları hedef yükle doğrulanamadı.',502);
 const latest=await get('/api//sea/seaGood/'+link.good_id) as typeof good;if(latest.id!==good.id||latest.version!==good.version||latest.seaPosition?.id!==link.position_id||latest.referenceNo!==good.referenceNo||latest.firm?.id!==good.firm?.id)throw new AppError('Yük finans verileri okunurken değişti.',409);
 // Native details are canonical. goodDetails/groupTableLines duplicate them and must never be summed again.
 return {linked:true as const,positionReference:link.position_reference,goodReference:link.good_reference,lines:result.data.details.flatMap(d=>d.tableLines),checkedAt:new Date().toISOString()};
}
export async function tmaxxReport(owner:string,after=''){
 const {results:links}=await db().prepare('SELECT booking_id,position_reference FROM booking_tmaxx_links WHERE owner=? AND booking_id>? ORDER BY booking_id LIMIT 11').bind(owner,after).all<{booking_id:string;position_reference:string}>();
 const files=[];for(let offset=0;offset<Math.min(links.length,10);offset+=3){const group=links.slice(offset,Math.min(offset+3,10));const results=await Promise.allSettled(group.map(async l=>({bookingId:l.booking_id,finance:await readTmaxxFinance(l.booking_id,owner),position:await readTmaxxPosition(owner,l.position_reference)})));files.push(...results.map((r,i)=>r.status==='fulfilled'?{...r.value,error:null}:{bookingId:group[i].booking_id,error:r.reason instanceof Error?r.reason.message:'T-MAXX okunamadı.',finance:null,position:null}));}
 return {files,truncated:links.length>10,nextCursor:links.length>10?links[9].booking_id:null,checkedAt:new Date().toISOString(),scope:'T-MAXX yüküne bağlı bookingler; tüm şirket raporu değildir.'};
}
