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
export type TMaxxUpdate={path:string;method:'PUT'|'POST';entityId:number;body:Entity};
export function assignContainerSlots(containers:Entity[],ex:Extraction,allowBlank=false):Entity[]{
 const blank=containers.every(c=>!c.no&&!c.sealNo&&!Number(c.grossWeight));
 if(!blank)return containers;
 if(!allowBlank||containers.length!==ex.containers.length)throw new AppError('Boş konteynerler için kesin pozisyon referansı gerekli.',422);
 const available=[...containers].sort((a,b)=>a.id-b.id),result:Entity[]=[];
 for(const source of [...ex.containers].sort((a,b)=>String(a.containerNumber?.value).localeCompare(String(b.containerNumber?.value)))){
  const index=available.findIndex(c=>normalize((c.containerType as {name?:string})?.name)===normalize(source.containerType?.value));
  if(index<0)throw new AppError('Konteyner tipi ve boş yer adedi eşleşmiyor.',422);
  const [slot]=available.splice(index,1);result.push({...slot,no:source.containerNumber.value});
 }
 return result;
}
export function buildExistingLoadPlan(good:Entity,originalContainers:Entity[],packs:Entity[],waybill:Entity,ex:Extraction,options:{allowBlankContainers?:boolean;houseBillNumber?:string;bookingNumber?:string}={}):TMaxxUpdate[]{
 const number=(fields:Extraction['fields'],key:string)=>{const f=fields[key];if(!f?.value||!f.source||f.confidence<.95||!/^\d+(\.\d+)?$/.test(f.value))throw new AppError('Sayısal alan doğrulanmalı: '+key,422);return Number(f.value)};
 const output:TMaxxUpdate[]=[];
 if(good.isLocked||good.isFinancialLocked)throw new AppError('T-MAXX yükü kilitli; güncelleme durduruldu.',422);
 if(!ex.containers.length||!ex.cargoLines.length)throw new AppError('Konteyner ve mal satırları gerekli.',422);
 const containers=assignContainerSlots(originalContainers,ex,!!options.allowBlankContainers);
 const add=(path:string,entity:Entity,patch:Record<string,unknown>)=>{if(!Number.isSafeInteger(entity.id)||!Number.isInteger(entity.version))throw new AppError('T-MAXX kayıt sürümü doğrulanamadı.',422);output.push({path,method:'PUT',entityId:entity.id,body:{...entity,...patch}})};
 const currentIds=new Set<number>();
 for(const c of ex.containers){
  const matches=containers.filter(x=>normalize(x.no)===normalize(c.containerNumber?.value));
  if(matches.length!==1)throw new AppError('Konteyner tam eşleşmiyor.',422);
  const current=matches[0];if(normalize((current.containerType as {name?:string})?.name)!==normalize(c.containerType?.value))throw new AppError('Konteyner tipi platformla eşleşmiyor.',422);
  currentIds.add(current.id);if(!c.sealNumber?.value||!c.sealNumber.source||c.sealNumber.confidence<.95)throw new AppError('Mühür bilgisi doğrulanmalı.',422);
  add('/api//sea/seaContainer',current,{no:c.containerNumber.value,sealNo:c.sealNumber.value,grossWeight:number(c,'grossWeightKg')});
 }
 if(currentIds.size!==containers.length)throw new AppError('Yükte belgede olmayan konteynerler var.',422);
 const used=new Set<number>(),assigned=new Set<number>();
 const blankPacks=packs.filter(p=>!p.seaContainer&&!Number(p.quantity)&&!Number(p.grossWeight)&&!Number(p.netWeight)&&!p.imo&&!p.gtip&&!p.htsCode).sort((a,b)=>a.id-b.id);
 for(const line of ex.cargoLines){
  const no=line.containerNumber?.value||(ex.containers.length===1?ex.containers[0].containerNumber?.value:null);
  if(!no)throw new AppError('Mal kaleminin konteyner bağlantısı belgede doğrulanmalı.',422);
  const container=containers.find(c=>normalize(c.no)===normalize(no));if(!container)throw new AppError('Mal kaleminin konteyneri bulunamadı.',422);
  if(assigned.has(container.id))throw new AppError('Aynı konteynerde birden çok mal kalemi için satır eşlemesi gerekli.',422);assigned.add(container.id);
  const matches=packs.filter(p=>(p.seaContainer as Entity|undefined)?.id===container.id);
  if(matches.length>1)throw new AppError('Mal satırı eşlemesi tekil değil.',422);
  const p=matches[0]||(options.allowBlankContainers?blankPacks.find(p=>!used.has(p.id)):undefined)||{id:0,version:0,firm:good.firm,seaGood:{id:good.id,version:good.version,firm:good.firm},measureUnit:'CM',weightUnit:'KG'};
  if(p.id)used.add(p.id);
  for(const key of ['description','packageType'])if(!line[key]?.value||!line[key].source||line[key].confidence<.95)throw new AppError('Mal kalemi alanı doğrulanmalı: '+key,422);
  add('/api//sea/seaGoodPack',p,{seaContainer:{id:container.id,version:container.version,firm:container.firm},quantity:number(line,'packageCount'),packing:line.packageType.value,grossWeight:number(line,'grossWeightKg'),...(line.netWeightKg?.value?{netWeight:number(line,'netWeightKg')}:{netWeight:p.netWeight??0}),goodDescription:line.description.value});
  if(!p.id){const update=output[output.length-1];update.method='POST';update.entityId=container.id;update.body.id=null as unknown as number;}
 }
 if(used.size!==packs.length)throw new AppError('Yükte belgelerle eşleşmeyen mal satırları var.',422);
 for(const [key,value]of [['hblNo',options.houseBillNumber],['bookingNo',options.bookingNumber]])if(value&&good[key!]&&String(good[key!])!==value)throw new AppError('T-MAXX mevcut '+key+' farklı; üzerine yazılmadı.',422);
 add('/api//sea/seaGood',good,{quantity:number(ex.fields,'packageCount'),grossWeight:number(ex.fields,'grossWeightKg'),...(ex.fields.netWeightKg?.value?{netWeight:number(ex.fields,'netWeightKg')}:{netWeight:good.netWeight??0}),...(options.houseBillNumber?{hblNo:options.houseBillNumber}:{}),...(options.bookingNumber?{bookingNo:options.bookingNumber}:{})});
 output.push({path:'/api//sea/def/seaGoodWaybill',method:'PUT',entityId:waybill.id,body:buildHblUpdate(waybill,ex)});return output;
}

export async function prepareTmaxx(owner:string,ex:Extraction,manual?:import('../manual').Manual){
 const selected=manual?.tmaxxReference?await (await import('./tmaxx-source')).tmaxxSource(owner,manual.tmaxxReference,ex):null;
 const matches=selected?[{id:selected.goodId,reference:selected.reference}]:(await findExistingLoads(owner,ex.fields.bookingNumber?.value||'',ex.containers.map(c=>c.containerNumber?.value||''))).filter(c=>c.exact);
 if(matches.length!==1)throw new AppError(matches.length?'T-MAXX: birden fazla yük eşleşti. Yük seçimi gerekli.':'T-MAXX: mevcut yük bulunamadı. Pozisyon referansını girin.',422);
 const candidate=matches[0],get=await tmaxxClient(owner);
 const good=await get('/api//sea/seaGood/'+candidate.id) as Entity;
 const containers=await get('/api//sea/seaContainer/findBySeaGoodId?seaGoodId='+candidate.id) as Entity[];
 const packs=await get('/api//sea/seaGoodPack/searchByOrder?query='+encodeURIComponent(JSON.stringify({'seaGood.id':candidate.id}))+'&orderBy='+encodeURIComponent(JSON.stringify('order by id desc'))) as Entity[];
 const waybill=await get('/api//sea/def/seaGoodWaybill/getBySeaGoodId?goodId='+candidate.id) as Entity;
 const needsWaybill=!waybill?.id;const updates=buildExistingLoadPlan(good,containers,packs,needsWaybill?{id:0,version:0}:waybill,ex,{allowBlankContainers:!!selected?.blankContainers,houseBillNumber:manual?.houseBillNumber,bookingNumber:manual?.bookingNumber});if(needsWaybill)updates.pop();
 for(const update of updates)if(update.method==='POST'){const defaults=await get('/api//sea/seaGoodPack/new') as Entity;if(defaults?.id||!Number.isInteger(defaults?.version))throw new AppError('Yeni mal kalemi başlangıç bilgisi doğrulanamadı.',502);update.body={...defaults,...update.body};}
 return {reference:String(waybill?.referenceNo||candidate.reference),goodId:good.id,updates,needsWaybill,ex};
}
export function tmaxxSaveKeys(path:string){return path.endsWith('seaContainer')?['no','sealNo','grossWeight']:path.endsWith('seaGoodPack')?['seaContainer','quantity','packing','grossWeight','netWeight','goodDescription']:path.endsWith('seaGood')?['hblNo','bookingNo','quantity','grossWeight','netWeight']:['consignor','consignee','notify','portOfLoading','portOfDischarge','quantityAndDescription'];}
export function assertTmaxxSaved(update:TMaxxUpdate,response:unknown){
 const entity=response as Entity;if(!entity||!Number.isSafeInteger(entity.id)||entity.id<=0||(update.method==='PUT'&&entity.id!==update.entityId)||!Number.isInteger(entity.version)||(update.method==='PUT'&&Number(entity.version)<=Number(update.body.version)))throw new AppError('T-MAXX kaydetme yanıtı doğrulanamadı.',502);
 const keys=tmaxxSaveKeys(update.path);
 for(const key of keys)if(key==='seaContainer'?(entity[key] as Entity)?.id!==(update.body[key] as Entity)?.id:entity[key]!==update.body[key])throw new AppError('T-MAXX kaydı beklenen bilgiyle eşleşmiyor: '+key,502);
 return {id:entity.id,version:entity.version};
}
export async function executeTmaxx(run:import('./platform-journal').Run,prepared:Awaited<ReturnType<typeof prepareTmaxx>>){
 const {runStep}=await import('./platform-journal');const c=contracts().find(c=>c.id==='tmaxx')!;const session=await platformSession(c,run.owner);
 for(let update of prepared.updates)await runStep(run,'tmaxx',update.path+':'+update.entityId,update,async()=>{
  const get=await tmaxxClient(run.owner);
  if(update.method==='PUT'){const fresh=await get(update.path+'/'+update.entityId) as Entity;if(fresh?.id!==update.entityId||!Number.isInteger(fresh.version))throw new AppError('T-MAXX güncel kayıt sürümü okunamadı.',502);update={...update,body:{...fresh,...Object.fromEntries(tmaxxSaveKeys(update.path).map(k=>[k,update.body[k]]))}};}
  if(update.method==='POST'){const current=await get('/api//sea/seaGoodPack/searchByOrder?query='+encodeURIComponent(JSON.stringify({'seaGood.id':prepared.goodId}))+'&orderBy='+encodeURIComponent(JSON.stringify('order by id desc'))) as Entity[];if(!Array.isArray(current)||current.some(p=>(p.seaContainer as Entity)?.id===update.entityId))throw new AppError('Konteyner için mal kalemi zaten var; tekrar oluşturma durduruldu.',409);}
  const r=await fetchJson('http://95.216.243.19:8090'+update.path,{method:update.method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.token,Cookie:session.cookie},body:JSON.stringify(update.body)});
  return assertTmaxxSaved(update,r.data);
 });
 if(prepared.needsWaybill){
  const created=await runStep(run,'tmaxx','create-hbl',{goodId:prepared.goodId},async()=>{const get=await tmaxxClient(run.owner);const result=await get('/api//sea/def/seaGoodWaybill/newSeaGoodWaybill/'+prepared.goodId) as Entity;if(!Number.isSafeInteger(result?.id)||result.id<=0||!Number.isInteger(result.version)||(result.seaGood as Entity)?.id!==prepared.goodId)throw new AppError('Yeni HBL yanıtı doğrulanamadı.',502);return result;});
  const update:TMaxxUpdate={path:'/api//sea/def/seaGoodWaybill',method:'PUT',entityId:created.id,body:buildHblUpdate(created,prepared.ex)};
  await runStep(run,'tmaxx','save-new-hbl',update,async()=>{const result=await fetchJson('http://95.216.243.19:8090'+update.path,{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.token,Cookie:session.cookie},body:JSON.stringify(update.body)});return assertTmaxxSaved(update,result.data);});
  return String(created.referenceNo||prepared.reference);
 }
 return prepared.reference;
}
