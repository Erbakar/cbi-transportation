/**
 * Reads the values a CBI sender typed in answer to the staff-gap notice, e.g.
 * "1. INTTRA: House Bill Number alanını doldurun. : 1046473" or "2) 34500" or "posta kodu: 34500".
 * Only the items that were asked (the record's open issues) are answered; anything unclear is skipped.
 * The text is untrusted data: values are only written into the matching manual field, with limits.
 */
import {addressKeys,addressLabels,addressLimits,partyLabels} from '../inttra-quality';

export type StaffAnswer={issue:string;path:['houseBillNumber']|['houseBills',number,'number']|['partyOverrides','shipper'|'consignee'|'notify',string];value:string};

const roles=Object.entries(partyLabels) as ['shipper'|'consignee'|'notify',string][];
const norm=(s:string)=>s.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu,' ').trim();

/** The manual field an open issue asks for, or null when it cannot be answered by a typed value. */
export function issueTarget(issue:string):StaffAnswer['path']|null{
 if(/^INTTRA: House Bill Number alanını doldurun\.$/.test(issue))return ['houseBillNumber'];
 const bill=issue.match(/^HBL (\d+): House Bill Number alanını doldurun\.$/);if(bill)return ['houseBills',Number(bill[1])-1,'number'];
 for(const [role,label] of roles)for(const key of addressKeys)if(issue===`${label}: ${addressLabels[key]} bilgisini tamamlayın.`)return ['partyOverrides',role,key];
 return null;
}

function valid(path:StaffAnswer['path'],raw:string){
 const value=raw.replace(/\s+/g,' ').trim().replace(/[.;,]$/,'');
 if(!value||/^(yok|none|n\/?a|-+)$/i.test(value))return '';
 if(path[0]!=='partyOverrides')return /^[A-Z0-9][A-Z0-9 ./-]{1,39}$/i.test(value)?value:'';
 const key=path[2] as keyof typeof addressLimits;
 if(value.length>addressLimits[key])return '';
 if(key==='postalCode'&&!/^[A-Z0-9 -]{3,17}$/i.test(value))return '';
 return value;
}

/** Short words a person uses for an item instead of copying the whole line. */
function aliases(path:StaffAnswer['path']):string[]{
 if(path[0]==='houseBillNumber'||path[0]==='houseBills')return ['house bill number','house bill no','hbl numarası','hbl number','hbl no','hbl'];
 const key=path[2] as typeof addressKeys[number];
 return [norm(addressLabels[key]),...(key==='postalCode'?['posta kodu','zip','postal code']:[])];
}

export function staffAnswers(text:string,issues:string[]):StaffAnswer[]{
 const listed=issues.map(issue=>({issue,path:issueTarget(issue)}));
 const asked=listed.filter((a):a is {issue:string;path:StaffAnswer['path']}=>!!a.path);
 if(!asked.length)return [];
 const lines=text.split(/\r?\n/).map(l=>l.trim()).filter(l=>l&&!/^>/.test(l));
 const found=new Map<string,StaffAnswer>();
 const put=(a:{issue:string;path:StaffAnswer['path']},raw:string)=>{const value=valid(a.path,raw);if(value&&!found.has(a.issue))found.set(a.issue,{...a,value});};
 for(const line of lines){
  // 1) The notice line copied with the value after it.
  for(const a of asked){const at=line.indexOf(a.issue);if(at>=0){const rest=line.slice(at+a.issue.length).replace(/^\s*[:=–-]+\s*/,'');if(rest)put(a,rest);}}
  // 2) "2. <anything> : value" or "2) value": the number of the item in the notice.
  const numbered=line.match(/^(\d{1,2})\s*[.)-]\s*(.*)$/);
  if(numbered){const item=listed[Number(numbered[1])-1],a=item?.path?{issue:item.issue,path:item.path}:null;if(a&&!found.has(a.issue)){const body=numbered[2],sep=body.lastIndexOf(':');put(a,sep>=0?body.slice(sep+1):body);}}
 }
 // 3) "posta kodu : 34500 HBL NO : 1046473": a short name only counts when exactly one asked item fits it; the value is one token.
 const flat=lines.join('  ');
 for(const a of asked){
  if(found.has(a.issue))continue;
  const fits=asked.filter(b=>aliases(b.path).some(x=>aliases(a.path).includes(x)));if(fits.length!==1)continue;
  for(const alias of aliases(a.path)){
   const m=flat.match(new RegExp(`(?:^|[^\\p{L}])${alias.replace(/ /g,'\\s*')}\\s*[:=]\\s*([A-Z0-9][A-Z0-9./-]{0,39})(?=\\s|$)`,'iu'));
   if(m){put(a,m[1]);break;}
  }
 }
 return [...found.values()];
}
