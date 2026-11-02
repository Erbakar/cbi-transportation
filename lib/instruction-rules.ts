import type {Extraction} from './domain';
import type {Manual} from './manual';
import {positionCharges,type PositionPayments} from './tmaxx-payments';
import {destinationRegion,notificationEmails,mblDocumentType} from './shipment-rules';
import {normalizeTmaxxReference} from './tmaxx-reference';

export type InstructionFacts={moveType?:string;houseBillNumber?:string;blReference?:string;payments?:PositionPayments;locations?:Record<string,string>;carrier?:string;houseBills?:Manual['houseBills']};
// Deterministic business rules. Fill gaps; preserve explicit operator corrections.
export function resolveInstruction(input:Manual,ex:Pick<Extraction,'fields'|'hblRequired'>,facts:InstructionFacts={}){
 const m=structuredClone(input),decisions:string[]=[];
 const s=m.inttra??={standardFcl:true,sealType:'',carrier:'',loadPort:'',dischargePort:'',origin:'',destination:'',issuePlace:'',ensFiler:'2',houseBill:'',euDelivery:'',paymentMethod:'',routeCountries:'',documentFreighted:'',documentUnfreighted:''};
 // FCL / Carrier Supplied is the supported workflow, not a per-record confirmation.
 s.standardFcl=true;
 s.ensFiler='2';s.documentFreighted='';s.paymentMethod='D';
 s.requestorEmails??=notificationEmails;s.partnerEmails??=notificationEmails;
 if(!s.carrier&&facts.carrier)s.carrier=facts.carrier;
 if(facts.houseBills){m.houseBills=facts.houseBills.map(b=>{const previous=m.houseBills?.find(p=>p.goodId===b.goodId);return {...b,number:previous?.number||b.number,fieldOverrides:previous?.fieldOverrides||{},partyOverrides:previous?.partyOverrides||{}};});}
 decisions.push('ENS: armatör · Ödeme yöntemi: '+(s.paymentMethod==='D'?'Diğer':s.paymentMethod)+' · Navlun tutarı basılmaz');
 for(const key of ['bookingNumber','vessel','voyage'] as const){const f=ex.fields[key];if(!m[key]&&f?.value&&f.confidence>=.95&&f.source)m[key]=f.value;}
 for(const key of ['moveType','houseBillNumber','blReference'] as const)if(!m[key]&&facts[key])m[key]=facts[key]!;
 if(typeof ex.hblRequired==='boolean'){s.houseBill=ex.hblRequired?((m.houseBills?.length||0)>1?'multiple':'2'):'0';decisions.push(ex.hblRequired?'Acente var: MBL + HBL':'Acente yok: yalnız MBL');}
 for(const key of ['loadPort','dischargePort','origin','destination'] as const)if(!s[key]&&facts.locations?.[key])s[key]=facts.locations[key];
 if(!s.origin&&s.loadPort)s.origin=s.loadPort;
 if(!s.destination&&m.moveType==='1'&&s.dischargePort)s.destination=s.dischargePort;
 if(!s.destination&&s.dischargePort)s.destination=s.dischargePort;
 if(s.transportDestination===undefined)s.transportDestination=facts.locations?.transportDestination||'';
 if(!s.euDelivery)s.euDelivery=destinationRegion(s.transportDestination||s.dischargePort);
 const document=mblDocumentType(ex,m);
 s.documentUnfreighted=document==='SWB'?'1':document==='ORIGINAL'?'3':'';
 if(document)decisions.push(document==='SWB'?'MBL: SWB · 1 navlunsuz belge':'MBL: Original · 3 navlunsuz orijinal + 3 non-negotiable kopya');
 if(!m.chargeMode)m.chargeMode='individual';
 const incomplete=!m.charges.length||m.charges.some(r=>!r.freightTerm||!r.payer);
 if(m.chargeMode==='individual'&&incomplete&&['PP','CC'].includes(String(facts.payments?.freight))){
  const rows=['5','4','3','1','2','7'].map(chargeType=>({chargeType,freightTerm:'' as const,payer:'',paymentLocation:''}));
  m.charges=positionCharges(rows,facts.payments!,m.moveType);decisions.push('Altı masraf satırı pozisyon navlununa ve teslim şekline göre tamamlandı');
 }
 return {manual:m,decisions};
}

// Reconcile only known field-presence checks; never discard platform or document conflicts.
export function currentFormIssues(saved:string[],m:Manual,fields:Extraction['fields']){
 const s=m.inttra;
 const knownDocument=!!mblDocumentType({fields},m);
 const checks:Record<string,boolean>={
 'Belge tipi: belgede bulunamadı.':knownDocument,
 'INTTRA: ENS beyanı seçimini tamamlayın.':s?.ensFiler==='2',
 'INTTRA: istenen belge adedini girin.':knownDocument&&['1','3'].includes(s?.documentUnfreighted||''),
 'INTTRA: Belge düzenleme yeri seçimini tamamlayın.':!!s?.issuePlace,
 };
 const issues=saved.filter(issue=>checks[issue]!==true);
 if(!s?.issuePlace&&!issues.includes('INTTRA: Belge düzenleme yeri seçimini tamamlayın.'))issues.push('INTTRA: Belge düzenleme yeri seçimini tamamlayın.');
 return issues;
}

const sourcePaths=['bookingNumber','vessel','voyage','blReference','houseBillNumber','moveType','charges','houseBills','containerOverrides',...['carrier','loadPort','dischargePort','origin','destination','transportDestination','houseBill','euDelivery'].map(k=>'inttra.'+k),...['mblShipperName','mblShipperAddress','mblConsigneeName','mblConsigneeAddress','mblNotifyName','mblNotifyAddress','loadPort','dischargePort'].map(k=>'fieldOverrides.'+k)];
function pathValue(m:Manual,path:string):unknown{return path.split('.').reduce((v,k)=>(v as Record<string,unknown>|undefined)?.[k],m as unknown);}
function setPath(m:Manual,path:string,value:unknown){const keys=path.split('.');let obj=m as unknown as Record<string,unknown>;for(const k of keys.slice(0,-1)){obj[k]??={};obj=obj[k] as Record<string,unknown>;}obj[keys.at(-1)!]=value;}
export function resetSourceValues(input:Manual,previousReference?:string){
 const m=structuredClone(input),snapshot=m.sourceSnapshot;
 const priorReference=snapshot?.reference||previousReference;
 const changed=priorReference&&normalizeTmaxxReference(priorReference)!==normalizeTmaxxReference(m.tmaxxReference);
 for(const path of sourcePaths){const current=pathValue(m,path),old=snapshot?.values[path];
  // Only values still equal to their recorded automatic origin are refreshed.
  // On a different shipment, all shipment-specific choices must be supplied anew.
  if(current!==undefined&&(changed||(old!==undefined&&JSON.stringify(current)===JSON.stringify(old))))setPath(m,path,Array.isArray(current)?[]:typeof current==='boolean'?false:'');
 }
 if(changed){m.houseBills=[];m.containerOverrides=[];m.tmaxxPackOptions=[];m.cargoOverrides=m.cargoOverrides.map(({tmaxxPackId,...row})=>row);}
 delete m.sourceSnapshot;return m;
}
export function rememberSourceValues(before:Manual,after:Manual){
 const m=structuredClone(after),values:Record<string,unknown>={};
 for(const path of sourcePaths){const value=pathValue(m,path);if(value!==undefined&&JSON.stringify(value)!==JSON.stringify(pathValue(before,path)))values[path]=value;}
 m.sourceSnapshot={reference:m.tmaxxReference,values};return m;
}
