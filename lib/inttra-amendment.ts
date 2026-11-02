import {latinPayload,type Option} from './inttra-reference';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Shipment=Record<string,any>;
export type AmendmentField={id:string;label:string;group:string;value:string;numeric?:boolean;options?:Option[];multiline?:boolean;required?:boolean};
export function amendmentFields(s:Shipment,options:{containerTypes:Option[];packageTypes:Option[]}):AmendmentField[]{
 const rows:AmendmentField[]=[];const add=(id:string,label:string,group:string,value:unknown,extra:Partial<AmendmentField>={})=>rows.push({id,label,group,value:String(value??''),...extra});
 add('Vessel','Gemi','Taşıma',s.Vessel,{required:true});add('Voyage','Sefer','Taşıma',s.Voyage,{required:true});
 for(const [role,label]of Object.entries({shipper:'MBL gönderen',consignee:'MBL alıcı',notifyParty:'MBL notify',forwarder:'Forwarder',exportSeller:'HBL gönderen',goodsOwner:'HBL alıcı',ActualNotifyParty:'HBL notify'})){
  const p=s.SICompanies?.[role];if(!p?.CompanyName)continue;
  for(const [key,title]of Object.entries({CompanyName:'Firma',CompanyAddress:'Adres',Street:'Sokak',StreetNumber:'Bina numarası',City:'Şehir',State:'İl / bölge',Zip:'Posta kodu',Taxid:'Vergi numarası',EORINumber:'EORI'}))if(['CompanyName','CompanyAddress'].includes(key)||p[key]!==undefined)add(`SICompanies.${role}.${key}`,title,label,p[key],{multiline:['CompanyName','CompanyAddress','Street'].includes(key),required:key==='CompanyName'});
 }
 for(const [i,c]of (s.Containers||[]).entries()){
  const group='Konteyner '+c.ContainerNumber;
  const matchingTypes=options.containerTypes.filter(o=>o.value===String(c.ContainerType)||o.value.split('_')[0]===String(c.ContainerType));
  add(`Containers.${i}.ContainerType`,'Konteyner tipi',group,matchingTypes.length===1?matchingTypes[0].value:c.ContainerType,{options:options.containerTypes,required:true});
  for(const [j,l]of (c.ContainerLineItems||[]).entries()){
   const prefix=`Containers.${i}.ContainerLineItems.${j}`,section=group+' · Mal '+(j+1);
   for(const [key,title]of Object.entries({PackageCount:'Kap adedi',GrossCargoWeight:'Brüt ağırlık (kg)',GrossCargoVolume:'Hacim (m³)',CargoDescription:'Mal açıklaması',MarksAndNumbers:'Marks & Numbers'}))add(prefix+'.'+key,title,section,l[key],{numeric:['PackageCount','GrossCargoWeight','GrossCargoVolume'].includes(key),multiline:['CargoDescription','MarksAndNumbers'].includes(key),required:['PackageCount','GrossCargoWeight','CargoDescription'].includes(key)});
   add(prefix+'.PackageTypeCode','Ambalaj türü',section,l.PackageTypeCode,{options:options.packageTypes,required:true});
  }
 }
 return rows;
}
export function applyAmendment(s:Shipment,fields:AmendmentField[],edits:Record<string,string>){
 const next=structuredClone(s),allowed=new Map(fields.map(f=>[f.id,f]));
 for(const [id,value]of Object.entries(edits)){
  const f=allowed.get(id);if(!f||typeof value!=='string'||value.length>20000)throw Error('Geçersiz revizyon alanı.');
  if(f.required&&!value.trim())throw Error(f.label+' gerekli.');
  if(f.numeric&&value&&(!/^\d+(\.\d+)?$/.test(value)||!Number.isFinite(Number(value))||(f.required&&Number(value)<=0)||(id.endsWith('PackageCount')&&!Number.isSafeInteger(Number(value)))))throw Error(f.label+': geçerli bir sayı girin.');
  const choice=f.options?.find(o=>o.value===value);if(f.options&&!choice)throw Error(f.label+': listeden seçim yapın.');
  const parts=id.split('.');let parent=next;for(const part of parts.slice(0,-1))parent=parent[part];const key=parts.at(-1)!;parent[key]=value;
  if(key==='ContainerType'){if(!value.endsWith('_0'))throw Error('Reefer/tank ayrıntıları ikinci aşamada desteklenecek.');parent.ContainerDescription=choice!.label;parent.ContainerProfileCode=value.split('_')[0];}
  if(key==='PackageTypeCode'){parent.PackageTypeDescription=choice!.label;parent.PackageTypeDescriptionPrint=choice!.label;}
 }
 const cargoChanged=Object.entries(edits).some(([id,value])=>/\.(PackageCount|GrossCargoWeight|GrossCargoVolume)$/.test(id)&&value!==allowed.get(id)?.value);
 if(cargoChanged){
 for(const c of next.Containers){for(const l of c.ContainerLineItems||[]){l.CargoPackageCount=l.PackageCount;l.Weight=l.GrossCargoWeight;l.Volume=l.GrossCargoVolume;}c.GrossCargoWeightForContainer=String((c.ContainerLineItems||[]).reduce((n:number,l:Shipment)=>n+Number(l.GrossCargoWeight||0),0));c.GrossCargoVolumeForContainer=String((c.ContainerLineItems||[]).reduce((n:number,l:Shipment)=>n+Number(l.GrossCargoVolume||0),0));}
 const lines=next.Containers.flatMap((c:Shipment)=>c.ContainerLineItems||[]);
 next.ShipmentSummary={...next.ShipmentSummary,TotalPackageCount:lines.reduce((n:number,l:Shipment)=>n+Number(l.PackageCount),0),TotalWeight:String(lines.reduce((n:number,l:Shipment)=>n+Number(l.GrossCargoWeight),0))};
 }
 return latinPayload(next);
}
export function assertAmendmentIdentity(s:Shipment,original:string,shipmentId:string){
 if(String(s.originalSiId)!==original||s.ShipmentId!==shipmentId||!(s.controllerFlags?.modifyType==='amend'||Number(s.SiSequence)>1))throw Error('INTTRA revizyonu mevcut talimatla eşleşmiyor. Yeni talimat gönderilmedi.');
}

// INTTRA CreateModifySI merges the form model, then sets these UI transport fields.
export function prepareAmendmentForm(source:Shipment,user:Shipment){
 const s=structuredClone(source);
 for(const [key,value]of Object.entries({RoutingConsignmentCountryCodes:'',EBLProvider:'',IsSingleCommodity:'false'}))if(s[key]===undefined)s[key]=value;
 s.AmendAction='Amend';s.blType='on';s.ActivityId=user.activityId||user.userActivityId;
 if(!s.ActivityId)throw Error('INTTRA kullanıcı etkinliği okunamadı. Oturumu yenileyin.');
 return s;
}
