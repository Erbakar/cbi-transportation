import {AppError} from './runtime';
import {tmaxxClient} from './tmaxx-workflow';
type Load={goodId:number;reference:string};
// This flow only reads existing ERP entities. It never creates or updates a waybill.
export async function readExistingHbls(owner:string,loads:Load[]){
 if(!loads?.length||loads.length>50||new Set(loads.map(l=>l.goodId)).size!==loads.length)throw new AppError('Yük eşleşmesi doğrulanamadı.',409);
 const get=await tmaxxClient(owner),results=[];
 for(const load of loads){
  if(!Number.isSafeInteger(load.goodId)||load.goodId<=0)throw new AppError('Yük kimliği geçersiz.',409);
  const good=await get('/api//sea/seaGood/'+load.goodId) as Record<string,unknown>;
  if(good.id!==load.goodId||!load.reference||good.referenceNo!==load.reference)throw new AppError('Mevcut yük referansı eşleşmiyor.',409);
  const hbl=await get('/api//sea/def/seaGoodWaybill/getBySeaGoodId?goodId='+load.goodId) as Record<string,unknown>;
  if(!Number.isSafeInteger(hbl.id)||Number(hbl.id)<=0||(hbl.seaGood as {id?:number})?.id!==load.goodId)throw new AppError('Yüke bağlı mevcut HBL bulunamadı. Yeni kayıt oluşturulmadı.',409);
  results.push({goodId:load.goodId,waybillId:Number(hbl.id),reference:load.reference,number:String(good.hblNo||''),source:'tmaxx-existing',importedAt:new Date().toISOString(),snapshot:{shipper:String(hbl.consignor||''),consignee:String(hbl.consignee||''),notify:String(hbl.notify||''),loadPort:String(hbl.portOfLoading||''),dischargePort:String(hbl.portOfDischarge||''),description:String(hbl.quantityAndDescription||'')}});
 }
 return results;
}
