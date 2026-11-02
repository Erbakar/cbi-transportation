// INTTRA may renumber collection keys and omit CompanyAddress after splitting
// it into structured address fields. Compare semantic codes and those fields.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Data=Record<string,any>;
const text=(v:unknown)=>String(v??'').trim().replace(/\s+/g,' ');
const roles=[['19','Gönderen'],['20','Alıcı'],['27','Notify']] as const;
const fields={CompanyName:'Firma adı',Street:'Sokak / açık adres',StreetNumber:'Bina / sokak numarası',POBox:'Posta kutusu',City:'Şehir',State:'İl / bölge',Zip:'Posta kodu',CountryGeoId:'Ülke',Taxid:'Vergi numarası',EORINumber:'EORI'};
const required=new Set(['CompanyName','Street','StreetNumber','City','State','Zip','CountryGeoId']);
function byCode(collection:Data|undefined,key:string,code:string){return Object.values(collection||{}).filter(v=>v&&text(v[key])===code);}
function cargo(s:Data){return (s.Containers||[]).flatMap((c:Data)=>(c.ContainerLineItems||[]).map((line:Data)=>({line,container:text(c.ContainerNumber),key:JSON.stringify([text(c.ContainerNumber),text(line.Sequence)]),hbl:text(byCode(line.LineItemReferences,'LineItemReferenceTypeCode','11')[0]?.LineItemReferenceValue)})));}

export function multiHblIntegrityIssues(expected:Data,actual:Data=expected):string[]{
 const wanted=cargo(expected);
 const multiple=byCode(expected.SIAttrs,'AttrTypeCode','4').some(a=>a.AttrValue==='ConsolidatedShipment')||wanted.some((c:{hbl:string})=>c.hbl);
 if(!multiple)return [];
 const issues:string[]=[];
 for(const s of expected===actual?[expected]:[expected,actual]){
  const types=byCode(s.SIAttrs,'AttrTypeCode','4');
  if(types.length!==1||text(types[0].AttrTypeOptionCode)!=='2'||types[0].AttrValue!=='ConsolidatedShipment'||text(s.HouseBillIndicator)!=='2')issues.push('Çoklu HBL gönderim türü tek ve tutarlı olmalı.');
 }
 const received=cargo(actual),seen=new Set<string>();
 if(!wanted.length)issues.push('Çoklu HBL için konteyner ve mal kalemi bulunamadı.');
 if(wanted.length!==received.length)issues.push('HBL mal kalemlerinin sayısı değişti.');
 for(const row of wanted){
  const label='HBL '+(row.hbl||'?')+' · '+row.container;
  if(!row.hbl||!row.container||!text(row.line.Sequence)||seen.has(row.key)){issues.push(label+': konteyner / mal kalemi eşleşmesi doğrulanamadı.');continue;}
  seen.add(row.key);
  const matches=received.filter((r:{key:string})=>r.key===row.key);
  if(matches.length!==1||matches[0].hbl!==row.hbl){issues.push(label+': HBL numarası ve konteyner eşleşmesi değişti.');continue;}
  for(const [code,role] of roles){
   const source=byCode(row.line.PartiesJBString,'PartiesType',code),target=byCode(matches[0].line.PartiesJBString,'PartiesType',code);
   if(source.length!==1||target.length!==1){issues.push(label+' · '+role+': taraf bilgisi eksik veya birden fazla.');continue;}
   for(const [key,name] of Object.entries(fields)){
    const before=text(source[0][key]),after=text(target[0][key]);
    if(required.has(key)&&!before)issues.push(label+' · '+role+': '+name+' eksik.');
    else if(before&&before!==after)issues.push(label+' · '+role+': '+name+' kontrol yanıtında korunmadı.');
   }
  }
 }
 return [...new Set(issues)];
}
