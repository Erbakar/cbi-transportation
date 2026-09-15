import type {Extraction} from '../domain';
import {AppError} from './runtime';
import {contracts,fetchJson,platformSession} from './platforms';
type Entity={id:number;version?:number;[key:string]:unknown};
export type LoadCandidate={id:number;reference:string;positionId:number;booking:string;containers:string[];exact:boolean;reason:string};
const normalize=(s:unknown)=>String(s||'').replace(/[\s-]/g,'').toUpperCase();
export function matchLoad(booking:string,containers:string[],good:Entity,actual:Entity[]):{exact:boolean;reason:string}{
 const expected=[...new Set(containers.map(normalize).filter(Boolean))].sort();const found=actual.map(c=>normalize(c.no)).filter(Boolean).sort();
 const existingBooking=String(good.bookingNo||good.rezervationNo||'');
 if(booking&&existingBooking&&normalize(booking)!==normalize(existingBooking))return {exact:false,reason:'Booking numarası farklı.'};
 if(!expected.length)return {exact:false,reason:'Kesin eşleştirme için konteyner numaraları gerekli.'};
 if(expected.length!==found.length||expected.some((n,i)=>n!==found[i]))return {exact:false,reason:'Konteyner seti tam eşleşmiyor.'};
 return {exact:true,reason:existingBooking?'Booking ve konteynerler eşleşti.':'Konteynerler tam eşleşti; yükün booking alanı boş.'};
}
export async function tmaxxClient(owner:string){const c=contracts().find(c=>c.id==='tmaxx');if(!c?.authVerified&&!c?.verified)throw new AppError('T-MAXX giriş bağlantısı doğrulanmalı.',503);const session=await platformSession(c!,owner);return async(path:string)=>{if(!path.startsWith('/api//sea/')||path.includes('://'))throw new AppError('Geçersiz T-MAXX sorgusu.');const r=await fetchJson('http://95.216.243.19:8090'+path,{method:'GET',headers:{Authorization:'Bearer '+session.token,Cookie:session.cookie}});return r.data;};}
export async function findExistingLoads(owner:string,booking:string,containers:string[]):Promise<LoadCandidate[]>{
 if(!booking&&!containers.length)throw new AppError('Yük aramak için booking veya konteyner numarası gerekli.',422);
 const get=await tmaxxClient(owner);const positions=new Map<number,Entity>();
 const queries:Record<string,string>[]=[];if(booking)queries.push({'#bookingNo#':booking});for(const no of [...new Set(containers.map(normalize).filter(Boolean))].slice(0,20))queries.push({'SEAPOSITIONCONTAINER/LIKE':no});
 if(containers.length>20)throw new AppError('20 üzeri konteyner için yük seçimi ayrıca doğrulanmalı.',422);
 for(const q of queries){const data=await get('/api//sea/seaPosition/searchTreeNode?query='+encodeURIComponent(JSON.stringify(q)));if(!Array.isArray(data))throw new AppError('T-MAXX arama yanıtı doğrulanamadı.',502);if(data.length>20)throw new AppError('Çok fazla yük bulundu; arama daraltılmalı.',422);for(const p of data)if(Number.isSafeInteger(p.id))positions.set(p.id,p);}
 if(positions.size>20)throw new AppError('Çok fazla pozisyon bulundu; arama daraltılmalı.',422);
 const goods=new Map<number,number>();for(const positionId of positions.keys()){const rows=await get('/api//sea/seaGood/searchTreeNode?query='+encodeURIComponent(JSON.stringify({'seaPosition.id':positionId})));if(!Array.isArray(rows)||rows.length>50)throw new AppError('Yük araması çok geniş veya yanıt geçersiz.',422);for(const row of rows)if(Number.isSafeInteger(row.id)&&row.context==='seaGood')goods.set(row.id,positionId);}
 if(goods.size>50)throw new AppError('Çok fazla yük bulundu; arama daraltılmalı.',422);
 const result:LoadCandidate[]=[];for(const [id,positionId] of goods){const good=await get('/api//sea/seaGood/'+id) as Entity;const list=await get('/api//sea/seaContainer/findBySeaGoodId?seaGoodId='+id);if(!good||good.id!==id||!Array.isArray(list))throw new AppError('Yük ayrıntısı doğrulanamadı.',502);result.push({id,positionId,reference:String(good.referenceNo||''),booking:String(good.bookingNo||good.rezervationNo||''),containers:list.map(c=>String(c.no||'')),...matchLoad(booking,containers,good,list)});}
 return result;
}
export function buildHblUpdate(existing:Entity,ex:Extraction){
 if(!Number.isSafeInteger(existing.id)||!Number.isInteger(existing.version))throw new AppError('Mevcut HBL kimliği veya sürümü doğrulanamadı.',422);
 const value=(key:string)=>{const f=ex.fields[key];if(!f?.value||!f.source||f.confidence<.95)throw new AppError('HBL alanı doğrulanmalı: '+key,422);return f.value};
 // Retain unrelated accounting, company references and optimistic version from the fresh server record.
 return {...existing,consignor:value('shipperName')+'\n'+value('shipperAddress'),consignee:value('consigneeName')+'\n'+value('consigneeAddress'),notify:value('notifyName')+'\n'+value('notifyAddress'),portOfLoading:value('loadPort'),portOfDischarge:value('dischargePort'),quantityAndDescription:ex.cargoLines.map((c,i)=>{const f=c.description;if(!f?.value||!f.source||f.confidence<.95)throw new AppError(`Mal kalemi ${i+1} doğrulanmalı.`,422);return f.value}).join('\n\n')};
}
export type TMaxxUpdate={path:string;method:'PUT';entityId:number;body:Entity};
export function buildExistingLoadPlan(good:Entity,containers:Entity[],packs:Entity[],waybill:Entity,ex:Extraction):TMaxxUpdate[]{
 const number=(fields:Extraction['fields'],key:string)=>{const f=fields[key];if(!f?.value||!f.source||f.confidence<.95||!/^\d+(\.\d+)?$/.test(f.value))throw new AppError('Sayısal alan doğrulanmalı: '+key,422);return Number(f.value)};
 const output:TMaxxUpdate[]=[];if(good.isLocked||good.isFinancialLocked)throw new AppError('T-MAXX yükü kilitli; güncelleme durduruldu.',422);
 if(!ex.containers.length||!ex.cargoLines.length)throw new AppError('Konteyner ve mal satırları gerekli.',422);
 const add=(path:string,entity:Entity,patch:Record<string,unknown>)=>{if(!Number.isSafeInteger(entity.id)||!Number.isInteger(entity.version))throw new AppError('T-MAXX kayıt sürümü doğrulanamadı.',422);output.push({path,method:'PUT',entityId:entity.id,body:{...entity,...patch}})};
 const currentIds=new Set<number>();
 for(const c of ex.containers){const matches=containers.filter(x=>normalize(x.no)===normalize(c.containerNumber?.value));if(matches.length!==1)throw new AppError('Konteyner tam eşleşmiyor.',422);const current=matches[0];const typeName=(current.containerType as {name?:string}|undefined)?.name;if(!c.containerType?.value||normalize(typeName)!==normalize(c.containerType.value))throw new AppError('Konteyner tipi platformla eşleşmiyor.',422);currentIds.add(current.id);if(!c.sealNumber?.value||!c.sealNumber.source||c.sealNumber.confidence<.95)throw new AppError('Mühür bilgisi doğrulanmalı.',422);add('/api//sea/seaContainer',current,{sealNo:c.sealNumber.value,grossWeight:number(c,'grossWeightKg')})}
 if(currentIds.size!==containers.length)throw new AppError('Yükte belgede olmayan konteynerler var.',422);
 const used=new Set<number>();for(const line of ex.cargoLines){const no=line.containerNumber?.value||(ex.containers.length===1?ex.containers[0].containerNumber?.value:null);if(!no)throw new AppError('Mal kaleminin konteyner bağlantısı belgede doğrulanmalı.',422);const container=containers.find(c=>normalize(c.no)===normalize(no));if(!container)throw new AppError('Mal kaleminin konteyneri bulunamadı.',422);const matches=packs.filter(p=>(p.seaContainer as Entity|undefined)?.id===container.id);if(matches.length!==1||used.has(matches[0]?.id))throw new AppError('Konteyner başına mal satırı eşlemesi tekil değil; satır seçimi gerekli.',422);const p=matches[0];used.add(p.id);for(const key of ['description','packageType']){const f=line[key];if(!f?.value||!f.source||f.confidence<.95)throw new AppError('Mal kalemi alanı doğrulanmalı: '+key,422)}add('/api//sea/seaGoodPack',p,{quantity:number(line,'packageCount'),packing:line.packageType.value,grossWeight:number(line,'grossWeightKg'),netWeight:number(line,'netWeightKg'),goodDescription:line.description.value});}
 if(used.size!==packs.length)throw new AppError('Yükte belgelerle eşleşmeyen mal satırları var.',422);
 add('/api//sea/seaGood',good,{quantity:number(ex.fields,'packageCount'),grossWeight:number(ex.fields,'grossWeightKg'),netWeight:number(ex.fields,'netWeightKg')});
 output.push({path:'/api//sea/def/seaGoodWaybill',method:'PUT',entityId:waybill.id,body:buildHblUpdate(waybill,ex)});return output;
}
