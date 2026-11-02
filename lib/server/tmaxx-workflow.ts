import {tmaxxValueEqual} from '../tmaxx-values';
import type {Extraction} from '../domain';
import {cargoPrint} from '../shipment-rules';
import {descriptionHasNetWeight,resolveTmaxxPacking,tmaxxHblPortName,type TmaxxPackingOption} from '../tmaxx-hbl-format';
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
export async function tmaxxClient(owner:string){const c=contracts().find(c=>c.id==='tmaxx');if(!c?.authVerified&&!c?.verified)throw new AppError('T-MAXX giriş bağlantısı doğrulanmalı.',503);const session=await platformSession(c!,owner);return async(path:string)=>{if((!path.startsWith('/api//sea/')&&!/^\/api\/\/marketing\/def\/addressCard\/\d+$/.test(path)&&path!=='/api//manage/admintools/selectBox/getByName?name=packingTypes')||path.includes('://')||path.includes('..'))throw new AppError('Geçersiz T-MAXX sorgusu.');const r=await fetchJson('http://95.216.243.19:8090'+path,{method:'GET',headers:{Authorization:'Bearer '+session.token,Cookie:session.cookie}});return r.data;};}
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
export function buildHblUpdate(existing:Entity,ex:Extraction,options:{legacy?:boolean}={}){
 if(!Number.isSafeInteger(existing.id)||!Number.isInteger(existing.version))throw new AppError('Mevcut HBL kimliği veya sürümü doğrulanamadı.',422);
 const value=(key:string)=>{const f=ex.fields[key];if(!f?.value||!f.source||f.confidence<.95)throw new AppError('HBL alanı doğrulanmalı: '+key,422);return f.value};
 // Retain unrelated accounting, company references and optimistic version from the fresh server record.
 const port=(key:string)=>options.legacy?value(key):tmaxxHblPortName(value(key));
 return {...existing,consignor:value('shipperName')+'\n'+value('shipperAddress'),consignee:value('consigneeName')+'\n'+value('consigneeAddress'),notify:value('notifyName')+'\n'+value('notifyAddress'),portOfLoading:port('loadPort'),portOfDischarge:port('dischargePort'),quantityAndDescription:ex.cargoLines.map((c,i)=>{const f=c.description;if(!f?.value||!f.source||f.confidence<.95)throw new AppError(`Mal kalemi ${i+1} doğrulanmalı.`,422);return cargoPrint(c).description}).join('\n\n')};
}
export type TMaxxUpdate={path:string;method:'PUT'|'POST';entityId:number;body:Entity;lineIndex?:number;expectedPackCount?:number};
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
export function buildExistingLoadPlan(good:Entity,originalContainers:Entity[],packs:Entity[],waybill:Entity,ex:Extraction,options:{allowBlankContainers?:boolean;houseBillNumber?:string;bookingNumber?:string;packIds?:Record<number,number>;containerTypes?:Entity[];packingTypes?:TmaxxPackingOption[]}={}):TMaxxUpdate[]{
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
  const current=matches[0];let containerType=current.containerType;
  if(normalize((containerType as {name?:string})?.name)!==normalize(c.containerType?.value)){const types=(options.containerTypes||[]).filter(t=>normalize(t.name)===normalize(c.containerType?.value));if(types.length!==1)throw new AppError('Konteyner tipi T-MAXX listesinde tekil eşleşmiyor.',422);containerType=types[0];}
  const omitSeal=ex.omittedSeals?.includes(c.containerNumber?.value||'');
  const seal=c.sealNumber?.value?.trim();
  currentIds.add(current.id);if(!omitSeal&&seal&&(!c.sealNumber.source||c.sealNumber.confidence<.95))throw new AppError('Mühür bilgisi doğrulanmalı.',422);
  // Missing optional input preserves the current ERP value; only explicit omission clears it.
  const sealPatch=omitSeal?{sealNo:current.sealNo===null?null:''}:seal?{sealNo:seal}:{};
  add('/api//sea/seaContainer',current,{containerType,no:c.containerNumber.value,...sealPatch,grossWeight:number(c,'grossWeightKg')});
  if(!omitSeal&&!seal)delete output[output.length-1].body.sealNo;
 }
 if(currentIds.size!==containers.length)throw new AppError('Yükte belgede olmayan konteynerler var.',422);
 const used=new Set<number>(),createdCounts=new Map<number,number>();
 const blankPacks=packs.filter(p=>!p.seaContainer&&!Number(p.quantity)&&!Number(p.grossWeight)&&!Number(p.netWeight)&&!p.imo&&!p.gtip&&!p.htsCode).sort((a,b)=>a.id-b.id);
 for(const [lineIndex,line] of ex.cargoLines.entries()){
  const no=line.containerNumber?.value||(ex.containers.length===1?ex.containers[0].containerNumber?.value:null);
  if(!no)throw new AppError('Mal kaleminin konteyner bağlantısı belgede doğrulanmalı.',422);
  const container=containers.find(c=>normalize(c.no)===normalize(no));if(!container)throw new AppError('Mal kaleminin konteyneri bulunamadı.',422);
  const matches=packs.filter(p=>(p.seaContainer as Entity|undefined)?.id===container.id&&!used.has(p.id));
  const chosen=options.packIds?.[lineIndex];
  const description=cargoPrint(line).description;
  const exact=matches.filter(p=>normalize(p.goodDescription)===normalize(description)&&Number(p.quantity)===number(line,'packageCount')&&Number(p.grossWeight)===number(line,'grossWeightKg'));
  const count=ex.cargoLines.filter(l=>normalize(l.containerNumber?.value||no)===normalize(no)).length;
  let selected:Entity|undefined;
  if(chosen){selected=packs.find(p=>p.id===chosen);if(!selected||used.has(chosen)||((selected.seaContainer as Entity|undefined)?.id!==container.id&&selected.seaContainer))throw new AppError('Mal kalemi '+(lineIndex+1)+': T-MAXX satır seçimi konteynerle eşleşmiyor.',422);}
  else if(chosen!==0){if(exact.length===1)selected=exact[0];else if(matches.length===1&&count===1)selected=matches[0];else if(matches.length)throw new AppError('Mal kalemi '+(lineIndex+1)+': T-MAXX mal satırını seçin.',422);}
  const p=selected||(options.allowBlankContainers?blankPacks.find(p=>!used.has(p.id)):undefined)||{id:0,version:0,firm:good.firm,seaGood:{id:good.id,version:good.version,firm:good.firm},measureUnit:'CM',weightUnit:'KG'};
  if(p.id)used.add(p.id);
  for(const key of ['description','packageType'])if(!line[key]?.value||!line[key].source||line[key].confidence<.95)throw new AppError('Mal kalemi alanı doğrulanmalı: '+key,422);
  let packing:string;try{packing=resolveTmaxxPacking(line.packageType.value!,options.packingTypes||[]);}catch(error){throw new AppError((error as Error).message,422);}
  const netWeight=line.netWeightKg?.value?number(line,'netWeightKg'):p.netWeight??0;
  add('/api//sea/seaGoodPack',p,{seaContainer:{id:container.id,version:container.version,firm:container.firm},quantity:number(line,'packageCount'),packing,grossWeight:number(line,'grossWeightKg'),netWeight:descriptionHasNetWeight(description)?null:netWeight,goodDescription:description,...(line.volumeM3?.value?{volume:number(line,'volumeM3')}:{volume:p.volume??0})});
  if(!p.id){const update=output[output.length-1];update.method='POST';update.entityId=container.id;update.body.id=null as unknown as number;update.lineIndex=lineIndex;update.expectedPackCount=packs.filter(p=>(p.seaContainer as Entity|undefined)?.id===container.id).length+(createdCounts.get(container.id)||0)+output.filter(u=>u.path.endsWith('seaGoodPack')&&u.method==='PUT'&&(u.body.seaContainer as Entity)?.id===container.id&&!packs.some(p=>p.id===u.entityId&&p.seaContainer)).length;createdCounts.set(container.id,(createdCounts.get(container.id)||0)+1);}
 }
 if(used.size!==packs.length)throw new AppError('Yükte belgelerle eşleşmeyen mal satırları var.',422);
 for(const [key,value]of [['hblNo',options.houseBillNumber],['bookingNo',options.bookingNumber]])if(value&&good[key!]&&String(good[key!])!==value)throw new AppError('T-MAXX mevcut '+key+' farklı; üzerine yazılmadı.',422);
 // bookingNo triggers T-MAXX's reservation approval workflow. HBL preparation
 // must preserve it; booking confirmation belongs to the separate booking flow.
 // T-MAXX derives the load total from the numeric pack fields. A weight already
 // printed in the description stays in the source data, not in that field twice.
 const netWeight=Number(output.filter(u=>u.path.endsWith('seaGoodPack')).reduce((sum,u)=>sum+Number(u.body.netWeight||0),0).toFixed(6));
 add('/api//sea/seaGood',good,{quantity:number(ex.fields,'packageCount'),grossWeight:number(ex.fields,'grossWeightKg'),netWeight,...(ex.fields.volumeM3?.value?{volume:number(ex.fields,'volumeM3')}:{volume:good.volume??0}),...(options.houseBillNumber?{hblNo:options.houseBillNumber}:{})});
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
 const packingList=await get('/api//manage/admintools/selectBox/getByName?name=packingTypes') as {items?:TmaxxPackingOption[]};
 if(!Array.isArray(packingList?.items)||!packingList.items.length)throw new AppError('T-MAXX ambalaj seçenekleri okunamadı.',502);
 const needsWaybill=!waybill?.id;const updates=buildExistingLoadPlan(good,containers,packs,needsWaybill?{id:0,version:0}:waybill,ex,{packingTypes:packingList.items,allowBlankContainers:!!selected?.blankContainers,houseBillNumber:manual?.houseBillNumber,bookingNumber:manual?.bookingNumber,containerTypes:await get('/api//sea/def/seaContainerType/searchByOrder?query=%7B%7D&orderBy=%22order%20by%20id%22') as Entity[],packIds:Object.fromEntries((manual?.cargoOverrides||[]).filter(c=>c.tmaxxPackId!==undefined).map(c=>[c.index,c.tmaxxPackId!]))});if(needsWaybill)updates.pop();
 for(const update of updates)if(update.method==='POST'){const defaults=await get('/api//sea/seaGoodPack/new') as Entity;if(defaults?.id||!Number.isInteger(defaults?.version))throw new AppError('Yeni mal kalemi başlangıç bilgisi doğrulanamadı.',502);update.body={...defaults,...update.body};}
 return {reference:String(waybill?.referenceNo||candidate.reference),goodId:good.id,updates,needsWaybill,ex,hblFormatVersion:2};
}
export function tmaxxSaveKeys(path:string){return path.endsWith('seaContainer')?['no','containerType','sealNo','grossWeight']:path.endsWith('seaGoodPack')?['seaContainer','quantity','packing','grossWeight','netWeight','goodDescription','volume']:path.endsWith('seaGood')?['hblNo','quantity','grossWeight','netWeight','volume']:['consignor','consignee','notify','portOfLoading','portOfDischarge','quantityAndDescription'];}
export function assertTmaxxSaved(update:TMaxxUpdate,response:unknown){
 const entity=response as Entity;if(!entity||!Number.isSafeInteger(entity.id)||entity.id<=0||(update.method==='PUT'&&entity.id!==update.entityId)||!Number.isInteger(entity.version)||(update.method==='PUT'&&Number(entity.version)<=Number(update.body.version)))throw new AppError('T-MAXX kaydetme yanıtı doğrulanamadı.',502);
 const keys=tmaxxSaveKeys(update.path).filter(k=>!['volume','sealNo'].includes(k)||Object.hasOwn(update.body,k));
 for(const key of keys)if(!tmaxxValueEqual(key,entity[key],update.body[key]))throw new AppError('T-MAXX kaydı beklenen bilgiyle eşleşmiyor: '+key,502);
 return {id:entity.id,version:entity.version};
}
export function orderTmaxxUpdates<T extends {path:string}>(updates:T[]):T[]{
 const rank=(path:string)=>path.endsWith('seaGoodPack')?0:path.endsWith('seaContainer')?1:path.endsWith('seaGood')?2:3;
 return [...updates].sort((a,b)=>rank(a.path)-rank(b.path));
}
export async function saveTmaxxUpdate(update:TMaxxUpdate,send:()=>Promise<unknown>,get:(path:string)=>Promise<unknown>){
 try{return assertTmaxxSaved(update,await send());}catch(error){
  // The connection or JSON parser can fail after T-MAXX has committed the write.
  // Only an exact read-back can resolve that ambiguity; never repeat the write here.
  if(update.method!=='PUT')throw error;
  let actual:Entity;
  const cause=error instanceof AppError?error.message:error instanceof SyntaxError?'T-MAXX kaydetme yanıtı okunamadı.':'T-MAXX kaydetme isteğinin yanıtı alınamadı.';
  try{actual=await get(update.path+'/'+update.entityId) as Entity;}catch{
   throw new AppError(cause+' Kayıt geri okunamadığı için sonuç belirsiz. Mevcut kaydı doğrulayın.',502);
  }
  const keys=tmaxxSaveKeys(update.path).filter(k=>Object.hasOwn(update.body,k));
  if(actual?.id===update.entityId&&Number.isInteger(actual.version)&&Number(actual.version)>=Number(update.body.version)&&keys.every(k=>tmaxxValueEqual(k,actual[k],update.body[k])))return {id:actual.id,version:actual.version};
  const changed=keys.filter(k=>!tmaxxValueEqual(k,actual?.[k],update.body[k]));
  throw new AppError(cause+' T-MAXX kaydı doğrulanamadı: '+(changed.join(', ')||'kayıt kimliği veya sürümü')+'. Mevcut ve aktarılacak değerleri kontrol edin.',409);
 }
}
export async function executeTmaxx(run:import('./platform-journal').Run,prepared:Awaited<ReturnType<typeof prepareTmaxx>>,namespace=''){
 const {runStep}=await import('./platform-journal');const c=contracts().find(c=>c.id==='tmaxx')!;const session=await platformSession(c,run.owner);
 for(let update of orderTmaxxUpdates(prepared.updates))await runStep(run,'tmaxx',namespace+update.path+':'+update.entityId+(update.lineIndex===undefined?'':':line:'+update.lineIndex),update,async()=>{
  const get=await tmaxxClient(run.owner);
  if(update.method==='PUT'){const fresh=await get(update.path+'/'+update.entityId) as Entity;if(fresh?.id!==update.entityId||!Number.isInteger(fresh.version))throw new AppError('T-MAXX güncel kayıt sürümü okunamadı.',502);update={...update,body:{...fresh,...Object.fromEntries(tmaxxSaveKeys(update.path).filter(k=>!['volume','sealNo'].includes(k)||Object.hasOwn(update.body,k)).map(k=>[k,update.body[k]]))}};}
  if(update.method==='POST'){const current=await get('/api//sea/seaGoodPack/searchByOrder?query='+encodeURIComponent(JSON.stringify({'seaGood.id':prepared.goodId}))+'&orderBy='+encodeURIComponent(JSON.stringify('order by id desc'))) as Entity[];if(!Array.isArray(current)||current.filter(p=>(p.seaContainer as Entity)?.id===update.entityId).length!==(update.expectedPackCount??0))throw new AppError('Konteyner için mal kalemi zaten var; tekrar oluşturma durduruldu.',409);}
  return saveTmaxxUpdate(update,async()=>(await fetchJson('http://95.216.243.19:8090'+update.path,{method:update.method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.token,Cookie:session.cookie},body:JSON.stringify(update.body)})).data,get);
 });
 if(prepared.needsWaybill){
  const created=await runStep(run,'tmaxx',namespace+'create-hbl',{goodId:prepared.goodId},async()=>{const get=await tmaxxClient(run.owner);const existing=await get('/api//sea/def/seaGoodWaybill/getBySeaGoodId?goodId='+prepared.goodId) as Entity|null;if(existing?.id)throw new AppError('Bu yükte HBL kaydı oluşmuş. Yeniden oluşturmadan önce mevcut kaydı doğrulayın.',409);const result=await get('/api//sea/def/seaGoodWaybill/newSeaGoodWaybill/'+prepared.goodId) as Entity;if(!Number.isSafeInteger(result?.id)||result.id<=0||!Number.isInteger(result.version)||(result.seaGood as Entity)?.id!==prepared.goodId)throw new AppError('Yeni HBL yanıtı doğrulanamadı.',502);return result;});
  const update:TMaxxUpdate={path:'/api//sea/def/seaGoodWaybill',method:'PUT',entityId:created.id,body:buildHblUpdate(created,prepared.ex,{legacy:prepared.hblFormatVersion!==2})};
  await runStep(run,'tmaxx',namespace+'save-new-hbl',update,async()=>{const get=await tmaxxClient(run.owner);return saveTmaxxUpdate(update,async()=>(await fetchJson('http://95.216.243.19:8090'+update.path,{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.token,Cookie:session.cookie},body:JSON.stringify(update.body)})).data,get);});
  return String(created.referenceNo||prepared.reference);
 }
 return prepared.reference;
}
