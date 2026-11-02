export type CostMapping = {id:string;name:string;firmName:string};
export function costMappings(raw:unknown):CostMapping[]{
 if(!Array.isArray(raw))throw new Error('T-MAXX masraf tanımları okunamadı.');
 const options=new Map<string,CostMapping>();
 for(const item of raw){
  if(!item||typeof item!=='object'||item.isActive!==true||item.isSea!==true)continue;
  if(!Number.isSafeInteger(item.id)||item.id<=0||typeof item.name!=='string'||!item.name.trim())continue;
  const id=String(item.id),previous=options.get(id),firmName=typeof item.firm?.name==='string'?item.firm.name:'';
  if(previous&&(previous.name!==item.name||previous.firmName!==firmName))throw new Error('T-MAXX masraf tanımı çelişkili.');
  options.set(id,{id,name:item.name,firmName});
 }
 return [...options.values()].sort((a,b)=>a.name.localeCompare(b.name,'tr'));
}
