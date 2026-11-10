/**
 * Turns the bill-of-lading check messages (lib/domain.ts validate) into a short
 * list the customer can answer. Anything the customer cannot know (MBL parties,
 * T-MAXX/INTTRA settings, booking, vessel) stays with CBI staff.
 */
import {names} from '../domain';

export type CustomerRequest={tr:string;en:string};
const english:Record<string,string>={description:'Description of goods',packageCount:'Number of packages',packageType:'Package type',grossWeightKg:'Gross weight (kg)',netWeightKg:'Net weight (kg)',volumeM3:'Volume (m³)',shipperName:'Shipper name',shipperAddress:'Shipper full address',consigneeName:'Consignee name',consigneeAddress:'Consignee full address',notifyName:'Notify party name',notifyAddress:'Notify party full address',loadPort:'Port of loading',dischargePort:'Port of discharge',containerNumber:'Container number',containerType:'Container type',sealNumber:'Seal number',hsCode:'HS code',freightPayment:'Freight payment (prepaid / collect)',blType:'B/L type (original / express release / sea waybill)'};
const turkish:Record<string,string>={...names,shipperName:'Gönderici (shipper) adı',shipperAddress:'Gönderici açık adresi',consigneeName:'Alıcı (consignee) adı',consigneeAddress:'Alıcı açık adresi',notifyName:'Notify adı',notifyAddress:'Notify açık adresi',freightPayment:'Navlun ödeme şekli (prepaid / collect)',blType:'Konşimento tipi (orijinal / express release / sea waybill)',grossWeightKg:'Brüt ağırlık (kg)',netWeightKg:'Net ağırlık (kg)'};
/** Keys the customer controls. MBL parties, booking, vessel and voyage are arranged by CBI. */
const customerKeys=new Set(Object.keys(english));
const byLabel=new Map(Object.entries(names).map(([key,label])=>[label,key]));
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const label=`(${[...byLabel.keys()].sort((a,b)=>b.length-a.length).map(escape).join('|')})`;

const rules:[RegExp,(m:RegExpMatchArray)=>CustomerRequest|null][]=[
 [new RegExp(`^${label}: belgede bulunamadı\\.$`),m=>field(byLabel.get(m[1])!)],
 [new RegExp(`^${label}: kaynak veya okuma kesinliği yeterli değil\\.$`),m=>field(byLabel.get(m[1])!,' – lütfen teyit edin',' – please confirm')],
 [new RegExp(`^${label}: adres yarım veya kısaltılmış\\.$`),m=>field(byLabel.get(m[1])!,' – adres eksik görünüyor',' – the address looks incomplete')],
 [new RegExp(`^${label}: sayısal biçim belirsiz\\.$`),m=>field(byLabel.get(m[1])!,' – lütfen sayı olarak yazın',' – please state as a number')],
 [new RegExp(`^Konteyner (\\d+): ${label} eksik veya belirsiz\\.$`),m=>row('Konteyner','Container',m[1],byLabel.get(m[2])!)],
 [/^Konteyner (\d+): numara kontrolü başarısız\.$/,m=>({tr:`Konteyner ${m[1]} – konteyner numarası (kontrol basamağı tutmuyor)`,en:`Container ${m[1]} – container number (check digit does not match)`})],
 [/^Konteyner numarası veya kontrol basamağı geçersiz\.$/,()=>({tr:'Konteyner numarası (kontrol basamağı tutmuyor)',en:'Container number (check digit does not match)'})],
 [new RegExp(`^Mal kalemi (\\d+): ${label} eksik veya belirsiz\\.$`),m=>row('Mal kalemi','Cargo line',m[1],byLabel.get(m[2])!)],
 [/^Mal kalemi (\d+): İngilizce mal tanımı/,m=>({tr:`Mal kalemi ${m[1]} – İngilizce mal tanımı`,en:`Cargo line ${m[1]} – description of goods in English`})],
 [/^Mal kalemi (\d+): net ağırlık brütten büyük olamaz\.$/,m=>({tr:`Mal kalemi ${m[1]} – net ve brüt ağırlık (net, brütten büyük görünüyor)`,en:`Cargo line ${m[1]} – net and gross weight (net appears larger than gross)`})],
 [/^Net ağırlık brüt ağırlıktan büyük olamaz\.$/,()=>({tr:'Net ve brüt ağırlık (net, brütten büyük görünüyor)',en:'Net and gross weight (net appears larger than gross)'})],
 [new RegExp(`^${label} toplamı mal kalemleriyle eşleşmiyor\\.$`),m=>field(byLabel.get(m[1])!,' – toplam, kalemlerin toplamıyla tutmuyor',' – the total does not match the sum of the cargo lines')],
 [/^Belge çelişkisi · ([a-zA-Z]+):/,m=>field(m[1],' – belgelerde farklı değerler var, doğru değeri yazın',' – the documents show different values, please state the correct one')],
];

function field(key:string,trNote='',enNote=''):CustomerRequest|null{
 if(!customerKeys.has(key))return null;
 return {tr:(turkish[key]||names[key]||key)+trNote,en:english[key]+enNote};
}
function row(tr:string,en:string,index:string,key:string):CustomerRequest|null{
 if(!customerKeys.has(key))return null;
 return {tr:`${tr} ${index} – ${(turkish[key]||names[key]).replace(/ \(kg\)$/,'')}`,en:`${en} ${index} – ${english[key].replace(/ \(kg\)$/,'')}`};
}

/** Splits check messages into what to ask the customer and what CBI staff must resolve. */
export function customerRequests(issues:string[]){
 const ask:CustomerRequest[]=[],staff:string[]=[];
 for(const issue of issues){
  const rule=rules.find(([pattern])=>pattern.test(issue));
  const request=rule?rule[1](issue.match(rule[0])!):null;
  if(request){if(!ask.some(a=>a.tr===request.tr))ask.push(request);}else staff.push(issue);
 }
 // One question per item: "Gross weight" is dropped when "Gross weight – please confirm" is asked.
 return {ask:ask.filter(a=>!ask.some(b=>b!==a&&b.tr.startsWith(a.tr+' – '))),staff};
}

export function requestText(o:{tag:string;round:number;ask:CustomerRequest[];maxRounds:number;noted?:boolean}){
 const list=(key:'tr'|'en')=>o.ask.map((a,i)=>`${i+1}. ${a[key]}`).join('\n');
 const last=o.round>=o.maxRounds;
 return [
  'Sayın ilgili,','',
  o.round===1?`${o.tag} numarasıyla kaydettiğimiz konşimento talimatınızı aldık. Konşimentoyu hazırlayabilmemiz için aşağıdaki bilgilere ihtiyacımız var:`:`Yanıtınız için teşekkür ederiz. ${o.tag} numaralı talimat için aşağıdaki bilgiler hâlâ eksik:`,
  '',list('tr'),'',
  'Lütfen bu e-postayı yanıtlayarak bilgileri yazın veya düzeltilmiş talimatı ekleyin. Konu satırındaki numarayı silmeyin.',
  ...(o.noted?['','E-postanızdaki talebiniz operasyon ekibimize iletildi; konşimento onların kontrolünden sonra platforma gönderilecek.']:[]),
  ...(last?['Bu konuda size bundan sonra operasyon ekibimiz dönüş yapacaktır.']:[]),
  '','Bu e-posta otomatik olarak gönderilmiştir.','CBI Transportation','',
  '----------','',
  'Dear Sir or Madam,','',
  o.round===1?`We have received your shipping instruction, registered as ${o.tag}. To prepare the bill of lading we need the following information:`:`Thank you for your reply. For ${o.tag} the following information is still missing:`,
  '',list('en'),'',
  'Please reply to this e-mail with the details or attach a corrected instruction. Please keep the reference in the subject line.',
  ...(o.noted?['','The request in your e-mail has been passed to our operations team; the bill of lading will be filed after their review.']:[]),
  ...(last?['Our operations team will follow up with you on this shipment.']:[]),
  '','This is an automated message.','CBI Transportation',
 ].join('\n');
}

/** Completion notice once the bill of lading has been created on the platforms. */
export function confirmText(o:{tag:string;created:{platform:string;kind:string;reference:string}[]}){
 const names:Record<string,[string,string,string]>={tmaxx:['House B/L (HBL)','House B/L (HBL)','T-MAXX'],inttra:['Master B/L talimatı (MBL)','Master B/L instruction (MBL)','INTTRA']};
 const line=(c:{platform:string;kind:string;reference:string},en:boolean)=>{
  const [tr,eng,platform]=names[c.platform]||[c.kind,c.kind,c.platform];
  const ref=c.reference?` (${en?'reference':'referans'}: ${c.reference})`:'';
  return en?`- ${eng}: created on ${platform}${ref}`:`- ${tr}: ${platform} platformunda oluşturuldu${ref}`;
 };
 return [
  'Sayın ilgili,','',
  `${o.tag} numaralı konşimento talimatınız işlendi:`,'',
  ...o.created.map(c=>line(c,false)),'',
  'Bu e-posta otomatik olarak gönderilmiştir.','CBI Transportation','',
  '----------','',
  'Dear Sir or Madam,','',
  `Your shipping instruction ${o.tag} has been processed:`,'',
  ...o.created.map(c=>line(c,true)),'',
  'This is an automated message.','CBI Transportation',
 ].join('\n');
}
