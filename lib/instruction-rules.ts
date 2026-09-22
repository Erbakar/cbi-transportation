import type {Extraction} from './domain';
import type {Manual} from './manual';
import {positionCharges,type PositionPayments} from './tmaxx-payments';

export type InstructionFacts={moveType?:string;houseBillNumber?:string;blReference?:string;payments?:PositionPayments;locations?:Record<string,string>};
// Deterministic business rules. Fill gaps; preserve explicit operator corrections.
export function resolveInstruction(input:Manual,ex:Pick<Extraction,'fields'|'hblRequired'>,facts:InstructionFacts={}){
 const m=structuredClone(input),decisions:string[]=[];
 const s=m.inttra??={standardFcl:false,sealType:'',carrier:'',loadPort:'',dischargePort:'',origin:'',destination:'',issuePlace:'',ensFiler:'2',houseBill:'',euDelivery:'',paymentMethod:'',routeCountries:'',documentFreighted:'',documentUnfreighted:''};
 s.ensFiler='2';s.documentFreighted='';if(!s.paymentMethod)s.paymentMethod='D';
 decisions.push('ENS: armatör · Ödeme yöntemi: '+(s.paymentMethod==='D'?'Diğer':s.paymentMethod)+' · Navlun tutarı basılmaz');
 for(const key of ['bookingNumber','vessel','voyage'] as const){const f=ex.fields[key];if(!m[key]&&f?.value&&f.confidence>=.95&&f.source)m[key]=f.value;}
 for(const key of ['moveType','houseBillNumber','blReference'] as const)if(!m[key]&&facts[key])m[key]=facts[key]!;
 if(typeof ex.hblRequired==='boolean'){s.houseBill=ex.hblRequired?'2':'0';decisions.push(ex.hblRequired?'Acente var: MBL + HBL':'Acente yok: yalnız MBL');}
 for(const key of ['loadPort','dischargePort','origin','destination'] as const)if(!s[key]&&facts.locations?.[key])s[key]=facts.locations[key];
 if(!s.origin&&s.loadPort)s.origin=s.loadPort;
 if(!s.destination&&m.moveType==='1'&&s.dischargePort)s.destination=s.dischargePort;
 const raw=s.mblDocumentType||(ex.hblRequired===true?'SWB':ex.fields.blType?.confidence>=.95?ex.fields.blType.value||'':'');
 const bl=raw.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
 const swb=/SWB|SEA\s?WAY|RELEASE/.test(bl),original=/ORIGINAL|ORIJINAL|3\s*\/\s*3|KARGO/.test(bl);
 if(swb!==original){s.documentUnfreighted=swb?'1':'3';decisions.push(swb?'MBL: SWB · 1 navlunsuz belge':'MBL: Original · 3 navlunsuz orijinal + 3 non-negotiable kopya');}
 if(!m.chargeMode)m.chargeMode='individual';
 const incomplete=!m.charges.length||m.charges.some(r=>!r.freightTerm||!r.payer);
 if(m.chargeMode==='individual'&&incomplete&&['PP','CC'].includes(String(facts.payments?.freight))){
  const rows=['5','4','3','1','2','7'].map(chargeType=>({chargeType,freightTerm:'' as const,payer:'',paymentLocation:''}));
  m.charges=positionCharges(rows,facts.payments!,m.moveType);decisions.push('Altı masraf satırı pozisyon navlununa ve teslim şekline göre tamamlandı');
 }
 return {manual:m,decisions};
}
