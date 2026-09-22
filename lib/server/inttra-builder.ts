import emptyForm from '../inttra-empty-form.json';
import type {Extraction,Fields} from '../domain';
import type {Manual} from '../manual';
import {mapInttraManual} from '../inttra-mapping';
import {decodeOptions,exactOption,locationParts} from '../inttra-reference';
import {AppError} from './runtime';
import {partyRoles,inttraQualityIssues} from '../inttra-quality';
// The empty shape is the platform's createFormModel (20260727), never a past customer's SI.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Data=Record<string,any>;
export function buildInttraDraft(ex:Extraction,m:Manual,options:Data,user:Data,recordId:string,locations:Record<string,{id:string;country:string;label:string}>={}){
 const settings=m.inttra?{...m.inttra,ensFiler:'2' as const}:undefined;if(!settings)throw new AppError('INTTRA taşıyıcı, konum ve belge seçeneklerini tamamlayın.',422);
 if(!settings.standardFcl)throw new AppError('FCL ve taşıyıcı konteyneri seçimini doğrulayın.',422);
 const required=['carrier','loadPort','dischargePort','issuePlace','origin','destination','ensFiler','houseBill','euDelivery','sealType'] as const;
 for(const key of required)if(!settings[key]&&!(key==='sealType'&&ex.containers.length&&ex.containers.every(c=>ex.omittedSeals?.includes(c.containerNumber?.value||''))))throw new AppError('INTTRA seçimi gerekli: '+key,422);
 if(!settings.documentFreighted&&!settings.documentUnfreighted)throw new AppError('INTTRA: istenen belge adedini girin.',422);
 const qualityIssues=inttraQualityIssues(ex,settings.houseBill);if(qualityIssues.length)throw new AppError(qualityIssues.join('\n'),422);
 if(!settings.paymentMethod)throw new AppError('INTTRA: ödeme yöntemini seçin.',422);
 const carrier=exactOption(decodeOptions(options.carriersList),settings.carrier,'Taşıyıcı');
 const carrierId=carrier.value.split('\u0001')[0];if(!/^\d+$/.test(carrierId))throw new AppError('Taşıyıcı kimliği geçersiz.',422);
 const s:Data=structuredClone(emptyForm.ShipmentInstruction);
 const get=(fields:Fields,key:string)=>{const f=fields[key];if(!f?.value||f.confidence<.95||!f.source)throw new AppError('INTTRA: alan doğrulanmalı: '+key,422);return f.value};
 const numeric=(fields:Fields,key:string)=>{const v=get(fields,key);if(!/^\d+(\.\d+)?$/.test(v)||Number(v)<=0)throw new AppError('INTTRA sayısal alan geçersiz: '+key,422);return v};
 Object.assign(s,mapInttraManual(m,locations));s.SiId='';s.ShipmentId='';s.SiName='CBI-'+recordId;s.SiAction='draft';s.ShipmentTypeCode=1;s.ShipmentTypeDesc='FCL (Full Container Load)';s.blType='on';s.ActivityId=user.activityId||user.userActivityId;
 if(!s.ActivityId||!user.userCompanyID)throw new AppError('INTTRA kullanıcı firma bilgisi doğrulanamadı.',502);
 s.EnsFilerIndicator=settings.ensFiler;s.HouseBillIndicator=settings.houseBill;s.GoodsDeliveredToEUIndicator=settings.euDelivery;
 s.PaymentMethodTypeValue=settings.paymentMethod;s.PaymentMethodTypeDescription=({Y:'Account holder with carrier',H:'Electronic funds transfer',Z:'Not pre-paid',D:'Other',A:'Payment in cash',C:'Payment by cheque',B:'Payment by credit card'} as Record<string,string>)[settings.paymentMethod]||'';s.RoutingConsignmentCountryCodes=settings.routeCountries;
 s.ToOrderShipmentIndicatorTypeId='1';if(/TO\s+ORDER/i.test(ex.fields.mblConsigneeName?.value||''))throw new AppError('To Order alıcı için özel belge alanları gerekli.',422);
 s.TotalContainerCount=String(ex.containers.length);s.ShipmentSummary={SummaryId:'',TotalContainerCount:ex.containers.length,TotalPackageCount:Number(numeric(ex.fields,'packageCount')),TotalWeight:numeric(ex.fields,'grossWeightKg'),TotalWeightUomId:'3',TotalVolume:'',TotalVolumeUomId:''};
 const party=(role:string,prefix:string)=>{s.SICompanies[role].CompanyName=get(ex.fields,prefix+'Name');s.SICompanies[role].CompanyAddress=get(ex.fields,prefix+'Address');};
 party('shipper','mblShipper');party('consignee','mblConsignee');party('notifyParty','mblNotify');
 if(settings.houseBill==='2'){if(!m.houseBillNumber)throw new AppError('INTTRA: House Bill Number gerekli.',422);party('exportSeller','shipper');party('goodsOwner','consignee');party('ActualNotifyParty','notify');}
 if(settings.houseBill==='2'){
  const countries=decodeOptions(options.countriesList).filter(c=>c.value.trim()) as {value:string;label:string;code?:string}[];
  for(const role of partyRoles){const fields=ex.actualParties![role]!;const company=s.SICompanies[({shipper:'exportSeller',consignee:'goodsOwner',notify:'ActualNotifyParty'})[role]];
   for(const [key,target] of Object.entries({street:'Street',streetNumber:'StreetNumber',poBox:'POBox',city:'City',state:'State',postalCode:'Zip',taxId:'Taxid',eori:'EORINumber'}))company[target]=fields[key]?.value||'';
   const raw=fields.country?.value?.trim().toUpperCase();const matches=countries.filter(c=>c.value===raw||c.label.toUpperCase()===raw||c.code===raw);
   if(matches.length!==1)throw new AppError('Gerçek taraf ülkesini INTTRA listesinden seçin: '+role,422);
   company.CountryGeoId=matches[0].value;company.Country=matches[0].label;
  }
 }
 Object.assign(s.SICompanies.Carrier,{CompanyName:carrier.label,ESCompanyId:carrierId});
 Object.assign(s.SICompanies.forwarder,{CompanyName:user.userCompanyName,ESCompanyId:String(user.userCompanyID),CompanyAddress:[user.userCompanyAddressLine1,user.userCompanyAddressLine2,user.userCompanyAddressLine3,user.userCompanyAddressCity,user.userCompanyAddressCountry].filter(Boolean).join('\n')});
 const location=(value:string,type:string,description:string)=>{const p=locationParts(value);return {LocationId:'',LocationTypeCode:type,LocationTypeDescription:description,LocationCity:p.label,PrintOnBLAs:p.label,LocationCountry:p.country,GeographyAreaId:p.id,TransportationId:''};};
 s.Transportations.Transportation_1.SILocations={OriginOfGoods:location(settings.origin,'4','Origin(Operational)'),PortOfLoad:location(settings.loadPort,'3','Port Of Loading(Operational)'),PortOfDischarge:location(settings.dischargePort,'1','Port Of Discharge(Operational)'),PlaceOfFinalDelivery:location(settings.destination,'16','Place of Final Delivery'),Origin:{},Destination:{}};
 s.SILocations.BLPlaceOfIssue=location(settings.issuePlace,'6','Place of issue');
 const bl=get(ex.fields,'blType').toUpperCase();const docs:Data={};const swb=/SEAWAY|SWB|SEA WAY/.test(bl);if(!swb&&!/ORIGINAL|ORİJİNAL/.test(bl))throw new AppError('INTTRA: SWB veya Original BL seçimi doğrulanmalı.',422);
 for(const [suffix,count] of [['Freighted',settings.documentFreighted],['NonFreighted',settings.documentUnfreighted]])docs[(swb?'SeaWaybillDocument':'OriginalDocument')+suffix]={NumberOfDocuments:count};
 s.SICompanies.Requestor.CompanyDocuments=docs;
 if(user.emailAddress){s.SICompanies.Requestor.CompanyContacts={CompanyContact_1:{ContactTypeCode:'1',ContactTypeDescription:'Information Contact',CompanyCommunications:{Email_1:{CommunicationTypeCode:'3',CommunicationTypeDescription:'Email',CommunicationDetails:user.emailAddress}}}};s.SICompanies.MessageRecipient={CompanyContacts:{CompanyContact_1:{CompanyCommunications:{Email_1:{CommunicationDetails:user.emailAddress}}}}};}
 const containerOptions=decodeOptions(options.containerTypeList),packageOptions=decodeOptions(options.packageTypesList);
 const assigned=new Set<number>();
 s.Containers=ex.containers.map(c=>{
  const no=get(c,'containerNumber'),type=exactOption(containerOptions,get(c,'containerType'),'Konteyner tipi');if(!type.value.endsWith('_0'))throw new AppError('Soğutmalı/tank konteyner için özel taşıma bilgileri gerekli.',422);
  const container:Data=structuredClone(emptyForm.ShipmentInstruction.Containers[0]);
  Object.assign(container,{ContainerNumber:no,ContainerType:type.value,ContainerDescription:type.label,ContainerSupplierTypeDesc:'Carrier Supplied',ContainerProfileCode:type.value.split('_')[0]});
  container.ContainerSeals=ex.omittedSeals?.includes(no)?{}:{['ContainerSeal_'+settings.sealType]:{SealNumber:get(c,'sealNumber').split(',').map(x=>x.trim()),ContainerSealTypeCode:settings.sealType}};
  container.ContainerLineItems=ex.cargoLines.flatMap((line,index)=>{if(line.containerNumber?.value!==no&&!(ex.containers.length===1&&!line.containerNumber?.value))return [];assigned.add(index);const pack=exactOption(packageOptions,get(line,'packageType'),'Ambalaj');const item:Data=structuredClone(emptyForm.ShipmentInstruction.Containers[0].ContainerLineItems[0]);Object.assign(item,{PackageCount:numeric(line,'packageCount'),PackageTypeCode:pack.value,PackageTypeDescription:pack.label,PackageTypeDescriptionPrint:pack.label,CargoDescription:get(line,'description'),MarksAndNumbers:line.marksAndNumbers?.value||'',GrossCargoWeight:numeric(line,'grossWeightKg'),Sequence:index+1});
   if(line.hsCode?.value){item.LineItemAttrs={LineItemAttr_2:{LineItemAttrValue:line.hsCode.value,LineItemAttrTypeCode:'2'}};}
   if(line.ncmCode?.value)item.LineItemReferences.LineItemReference_15={LineItemReferenceValue:line.ncmCode.value,LineItemReferenceTypeCode:'15'};
   else delete item.LineItemReferences.LineItemReference_15;
   if(line.cusCode?.value)item.LineItemReferences.LineItemReference_20={LineItemReferenceValue:line.cusCode.value,LineItemReferenceTypeCode:'20'};
   else delete item.LineItemReferences.LineItemReference_20;
   return [item];});
  if(!container.ContainerLineItems.length)throw new AppError('INTTRA: konteynerin mal kalemi bulunamadı: '+no,422);return container;
 });
 if(assigned.size!==ex.cargoLines.length)throw new AppError('INTTRA: bazı mal kalemleri konteynere bağlanamadı.',422);
 return {ShipmentInstruction:s,chargesArray:m.chargeMode==='all'?[]:m.charges.map(r=>({ChargeTypeCode:r.chargeType,FreightTermCode:r.freightTerm==='Prepaid'?'2':'1',PartyTypeCode:r.payer,PaymentLocation:locations[r.paymentLocation]?.label||'',PaymentInstructionId:''}))};
}
