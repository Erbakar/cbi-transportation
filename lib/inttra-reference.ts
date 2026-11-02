export type Option={label:string;value:string};
export type CountryOption=Option&{code?:string};
export type Geography={label:string;value:string};
export function decodeOptions(raw:unknown):Option[]{
 let value=raw;for(let i=0;i<3&&typeof value==='string';i++){try{value=JSON.parse(value)}catch{value=decodeURIComponent(String(value))}}
 const list=Array.isArray(value)?value:(value as {content?:unknown})?.content;
 if(!Array.isArray(list))throw Error('Platform seçenekleri okunamadı.');
 return list.filter(x=>x&&typeof x.label==='string'&&typeof x.value==='string'&&x.value!=='0');
}
export function locationParts(value:string){const [id,country,...label]=value.split(':');if(!/^\d+$/.test(id)||!country||!label.length)throw Error('Platform konumu seçilmeli.');return {id,country,label:label.join(':')};}
export function exactOption(options:Option[],value:string,kind:string){
 const selected=options.filter(o=>o.value===value);if(selected.length===1)return selected[0];if(selected.length>1)throw Error(`${kind}: platform kodu tekil değil (${value}).`);
 const normalize=(s:string)=>s.trim().toUpperCase().replace(/[\s_-]/g,'');
 const aliases:Record<string,string>={'40HC':'40 High Cube','40HQ':'40 High Cube','40DC':'40 Standard Dry','40FT':'40 Standard Dry','20DC':'20 Standard Dry','20GP':'20 Standard Dry','40GP':'40 Standard Dry','PACKAGES':'Package','PACKS':'Package','PKG':'Package','BOXES':'Box','CARTONS':'Carton','PALLETS':'Pallet','PALET':'Pallet','PALETLER':'Pallet','PAKET':'Package','KOLI':'Package','KOLİ':'Package','KAP':'Package','PKGS':'Package','20OT':'20 Open Top','40OT':'40 Open Top','20FR':'20 Flat Rack','40FR':'40 Flat Rack','20RF':'20 Reefer','40RF':'40 Reefer','40RH':'40 Reefer High Cube','40HCOT':'40 Foot High Cube Open Top Container','45HC':'45 High Cube'};
 const target=aliases[normalize(value)]||value;const matches=options.filter(o=>o.value===value||normalize(o.label)===normalize(target));
 if(matches.length!==1)throw Error(`${kind}: platform karşılığı tekil değil (${value}).`);return matches[0];
}

export function packageOption(options:Option[],label:string,code?:string):Option {
 if(!code)return exactOption(options,label,'Ambalaj');
 const selected=options.filter(o=>o.value===code);
 if(selected.length!==1||selected[0].label!==label)throw Error('Ambalaj seçimi değişmiş; güncel listeden yeniden seçin.');
 return selected[0];
}

// Resolve only against the current platform list. Keep explicit selections and
// require a unique match; similar names (e.g. Turkmenistan) are not aliases.
export function resolveCountryOption(options:CountryOption[],value:string|null|undefined):CountryOption|null{
 const raw=value?.trim();if(!raw)return null;
 const available=options.filter(option=>option.value.trim()&&option.value!=='0');
 const selected=available.filter(option=>option.value===raw);
 if(selected.length)return selected.length===1?selected[0]:null;
 const key=(text:string)=>{
  const normalized=latinText(text).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toUpperCase();
  return ['TURKEY','TURKIYE','TUR'].includes(normalized)?'TR':normalized;
 };
 const target=key(raw);
 const matches=available.filter(option=>key(option.label)===target||(option.code&&key(option.code)===target));
 return matches.length===1?matches[0]:null;
}

export const containerTypeNames=['20 DC','20 OT','20 FR','20 RF','40 DC','40 HC','40 OT','40 HC OT','40 FR','40 RF','40 RH','45 HC'];
export function latinText(s:string){return s.replace(/[çÇğĞıİöÖşŞüÜ]/g,c=>({'ç':'c','Ç':'C','ğ':'g','Ğ':'G','ı':'i','İ':'I','ö':'o','Ö':'O','ş':'s','Ş':'S','ü':'u','Ü':'U'}[c]!));}
export function latinPayload<T>(value:T):T{if(typeof value==='string')return latinText(value) as T;if(Array.isArray(value))return value.map(latinPayload) as T;if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,latinPayload(v)])) as T;return value;}
