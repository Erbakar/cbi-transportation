export const controlLabels = {
 salesReference:'Satış referansı',position:'Pozisyon',bookingNumber:'Booking numarası',hblNumber:'HBL numarası',mblNumber:'MBL numarası',
 customer:'Müşteri',shipper:'Yükleyici',consigneeName:'Alıcı',notifyName:'Notify',agent:'Acente',carrier:'Armatör',
 loadPort:'Yükleme limanı',dischargePort:'Boşaltma limanı',receipt:'Teslim alma yeri',delivery:'Teslim yeri',transshipment:'Aktarma limanı',
 vessel:'Gemi',voyage:'Sefer',etd:'ETD',shippedOnBoard:'Yükleme tarihi',equipmentType:'Ekipman tipi',equipmentCount:'Ekipman adedi',
 containers:'Konteyner numaraları',seals:'Mühür numaraları',packages:'Kap / paket',description:'Mal tanımı',hsCode:'HS kodu',volume:'Hacim',
 netKg:'Yük net · kg',grossKg:'Yük brüt · kg',tareKg:'Dara · kg',vgmKg:'VGM · kg',incoterm:'Incoterm',freightPayment:'Navlun ödeme',payableAt:'Ödeme yeri',
 blType:'BL türü',originals:'Original sayısı',copies:'Kopya sayısı',release:'Teslim şekli',
} as const;
export type ControlKey=keyof typeof controlLabels;
export type ControlCell={value:string;proof:string;page?:number|null;confidence?:number};
export type ControlSource={id:string;label:string;kind:string;status:string;href?:string;values:Partial<Record<ControlKey,ControlCell>>};
export type ControlLevel='missing'|'single'|'consistent'|'review'|'critical';
export const controlLevelLabels:Record<ControlLevel,string>={missing:'Veri bekleniyor',single:'Tek kaynak',consistent:'Değerler aynı',review:'İnceleme gerekli',critical:'Kritik uyuşmazlık'};
// Compare only the same semantic field. Never compare cargo gross with VGM,
// remove punctuation from identifiers, or infer a business exception from a party name.
export function compareControl(sources:ControlSource[]){
 return (Object.keys(controlLabels) as ControlKey[]).map(key=>{
  const present=sources.flatMap(s=>{const cell=s.values[key];return cell?.value.trim()?[{sourceId:s.id,...cell}]:[];});
  const values=new Set(present.map(c=>c.value.normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase()));
  const level:ControlLevel=!present.length?'missing':present.length===1?'single':values.size===1?'consistent':['customer','loadPort','dischargePort','containers','bookingNumber'].includes(key)?'critical':'review';
  return {key,label:controlLabels[key],level,present};
 });
}

export function stableControl(value:unknown):string{
 if(value===null||typeof value!=='object')return JSON.stringify(value)??'null';
 if(Array.isArray(value))return '['+value.map(stableControl).join(',')+']';
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stableControl((value as Record<string,unknown>)[k])).join(',')+'}';
}
