export type TmaxxPackingOption={code:string;name:string};
const normalized=(value:string)=>value.trim().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ');

// Match the live select-box code, never persist the document's display text.
export function resolveTmaxxPacking(value:string,options:TmaxxPackingOption[]):string{
 const valid=options.filter(o=>o&&typeof o.code==='string'&&o.code.trim()&&typeof o.name==='string');
 const input=value.trim(),key=normalized(input);
 const choose=(matches:TmaxxPackingOption[])=>{const codes=[...new Set(matches.map(o=>o.code))];if(codes.length>1)throw Error('T-MAXX ambalaj seçimi birden fazla seçenekle eşleşiyor: '+input);return codes[0];};
 const exact=choose(valid.filter(o=>o.code===input));if(exact)return exact;
 const code=choose(valid.filter(o=>normalized(o.code)===key));if(code)return code;
 const name=choose(valid.filter(o=>normalized(o.name)===key));if(name)return name;
 const aliases:Record<string,string>={PAKET:'PACKAGES',PAKETLER:'PACKAGES',PACKS:'PACKAGES',PKG:'PACKAGES',PKGS:'PACKAGES',BOX:'BOXES',CARTON:'CARTONS',PALET:'PALLETS',PALETLER:'PALLETS',KOLI:'COLLIES'};
 const alias=aliases[key],matched=alias&&choose(valid.filter(o=>o.code===alias));if(matched)return matched;
 throw Error('T-MAXX ambalaj listesinde karşılığı bulunamadı: '+input+'. Ambalaj türünü doğrulayın.');
}

// Remove only the native "name - country - location" suffix, not hyphens
// within the port name or operational location identifiers used elsewhere.
export function tmaxxHblPortName(value:string){return value.trim().replace(/\s+[-–]\s+[A-Z]{2}\s+[-–]\s+[A-Z0-9]{3}$/i,'').trim();}

export function descriptionHasNetWeight(value:string){
 const description=normalized(value);
 return /\b(?:NET\s*(?:WEIGHT|WT\.?|KG|KILOS?|AGIRLIK)|N\.?\s*W\.?)\s*(?:\((?:KGS?|KILOGRAMS?)\))?\s*[:=\-]?\s*\d/.test(description);
}
