export type Option={label:string;value:string};
export type Geography={label:string;value:string};
export function decodeOptions(raw:unknown):Option[]{
 let value=raw;for(let i=0;i<3&&typeof value==='string';i++){try{value=JSON.parse(value)}catch{value=decodeURIComponent(String(value))}}
 const list=Array.isArray(value)?value:(value as {content?:unknown})?.content;
 if(!Array.isArray(list))throw Error('Platform seçenekleri okunamadı.');
 return list.filter(x=>x&&typeof x.label==='string'&&typeof x.value==='string'&&x.value!=='0');
}
export function locationParts(value:string){const [id,country,...label]=value.split(':');if(!/^\d+$/.test(id)||!country||!label.length)throw Error('Platform konumu seçilmeli.');return {id,country,label:label.join(':')};}
export function exactOption(options:Option[],value:string,kind:string){
 const normalize=(s:string)=>s.trim().toUpperCase().replace(/[\s_-]/g,'');
 const aliases:Record<string,string>={'40HC':'40 High Cube','40HQ':'40 High Cube','40DC':'40 Standard Dry','20DC':'20 Standard Dry','20GP':'20 Standard Dry','40GP':'40 Standard Dry','PACKAGES':'Package','PACKS':'Package','PKG':'Package','CARTONS':'Carton','PALLETS':'Pallet'};
 const target=aliases[normalize(value)]||value;const matches=options.filter(o=>o.value===value||normalize(o.label)===normalize(target));
 if(matches.length!==1)throw Error(`${kind}: platform karşılığı tekil değil (${value}).`);return matches[0];
}
