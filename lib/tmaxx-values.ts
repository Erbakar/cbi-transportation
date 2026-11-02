// Only canonical decimal values are normalized. Locale-ambiguous numbers are never guessed.
export const numericTmaxxFields=new Set(['quantity','grossWeight','netWeight','volume']);
export const tmaxxFieldLabels:Record<string,string>={containerType:'Konteyner tipi',no:'Konteyner numarası',sealNo:'Mühür numarası',quantity:'Kap adedi',packing:'Ambalaj',grossWeight:'Brüt ağırlık (kg)',netWeight:'Net ağırlık (kg)',volume:'Hacim (m³)',goodDescription:'Mal açıklaması',hblNo:'HBL numarası',bookingNo:'Booking numarası',consignor:'Gönderen',consignee:'Alıcı',notify:'Notify',portOfLoading:'Yükleme limanı',portOfDischarge:'Boşaltma limanı',quantityAndDescription:'HBL mal açıklaması',seaContainer:'Konteyner bağlantısı'};
export function tmaxxValueEqual(key:string,a:unknown,b:unknown){
 if(key==='seaContainer'||key==='containerType')return (a as {id?:number})?.id===(b as {id?:number})?.id;
 // T-MAXX transliterates Turkish letters when saving HBL parties. Keep every
 // other character (including digits, punctuation and spacing) significant.
 if(['consignor','consignee','notify'].includes(key)&&typeof a==='string'&&typeof b==='string'){
  const letters:Record<string,string>={'Ç':'C','Ğ':'G','İ':'I','Ö':'O','Ş':'S','Ü':'U','ç':'c','ğ':'g','ı':'i','ö':'o','ş':'s','ü':'u'};
  const canonical=(value:string)=>value.replace(/[ÇĞİÖŞÜçğıöşü]/g,c=>letters[c]);
  return canonical(a)===canonical(b);
 }
 if(numericTmaxxFields.has(key)){
  const valid=(v:unknown)=>typeof v==='number'?Number.isFinite(v):typeof v==='string'&&/^\d+(\.\d+)?$/.test(v);
  return valid(a)&&valid(b)?Number(a)===Number(b):a===b;
 }
 return (a??'')===(b??'');
}
export function parseTmaxxEdit(key:string,value:string){
 if(value.length>20000)throw Error('Alan en fazla 20.000 karakter olabilir.');
 if(numericTmaxxFields.has(key)){
  if(!/^\d+(\.\d+)?$/.test(value)||!Number.isFinite(Number(value)))throw Error('Sayıyı binlik ayırıcı olmadan yazın; ondalık için nokta kullanın.');
  const n=Number(value);if((key==='quantity'||key==='grossWeight')&&n<=0)throw Error('Kap adedi ve brüt ağırlık sıfırdan büyük olmalı.');
  if(key==='quantity'&&!Number.isSafeInteger(n))throw Error('Kap adedi tam sayı olmalı.');
  return n;
 }
 return value;
}

export function tmaxxBusinessError(status:number,body:string):string|null{
 if(status===400&&/BCM\s*-\s*Booking Confirmation/i.test(body)&&/WorkFlow|Booking Onay Kontrol/i.test(body))return 'T-MAXX: Taşıyıcının BCM / Booking Confirmation belgesi bu yükün dijital arşivine ilişkilendirilmeli. Booking onay belgesini doğru yüke ekledikten sonra mevcut kaydı yeniden kontrol edin.';
 return null;
}

export function tmaxxCargoIssues(body:Record<string,unknown>):{key:string;message:string}[]{
 const issues:{key:string;message:string}[]=[];
 for(const key of numericTmaxxFields){
  if(!Object.hasOwn(body,key))continue;
  try{parseTmaxxEdit(key,String(body[key]??''));}
  catch(e){issues.push({key,message:(e as Error).message});}
 }
 if(!issues.some(i=>['netWeight','grossWeight'].includes(i.key))&&body.netWeight!==undefined&&body.grossWeight!==undefined&&Number(body.netWeight)>Number(body.grossWeight))issues.push({key:'netWeight',message:'Net ağırlık brüt ağırlıktan büyük olamaz. Belgedeki değerleri kontrol edin.'});
 for(const key of ['packing','goodDescription'])if(Object.hasOwn(body,key)&&!String(body[key]??'').trim())issues.push({key,message:tmaxxFieldLabels[key]+' boş bırakılamaz.'});
 return issues;
}
