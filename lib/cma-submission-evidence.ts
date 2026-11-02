// SUBMITTED proves receipt, not integration/acceptance or a verified final weight.
export function cmaSubmissionEvidence(rows:string[][], payload:{booking:string;container:string;signature:string;vgmKg:string}, createdAt:string){
 const matches=rows.filter(r=>r[0]?.trim()===payload.booking&&r[3]?.trim()===payload.container);
 if(matches.length!==1)return null;
 const r=matches[0],status=r[2]?.trim().toUpperCase();
 if(!['SUBMITTED','INTEGRATED'].includes(status))return null;
 if(r[6]?.trim().toUpperCase()!==payload.signature.trim().toUpperCase())return null;
 const date=r[7]?.match(/^(\d{2})-([A-Z]{3})-(\d{4})\b/i);
 const months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
 if(!date||months.indexOf(date[2].toUpperCase())<0)return null;
 const day=`${date[3]}-${String(months.indexOf(date[2].toUpperCase())+1).padStart(2,'0')}-${date[1]}`;
 if(day<createdAt.slice(0,10))return null;
 // CMA displays No VGM until integration; never claim the weight was accepted.
 if(status==='INTEGRATED'){
  const mass=r[5]?.match(/^([\d,.]+)\s*KGM$/i);
  if(!mass||Number(mass[1].replace(/,/g,''))!==Number(payload.vgmKg))return null;
 }
 return status==='SUBMITTED'?'CMA listesinde gönderildi olarak doğrulandı. Armatörün ağırlık doğrulaması ve sisteme işlemesi bekleniyor.':'CMA listesinde ağırlık ve gönderim doğrulandı; armatör sistemine işlendi.';
}
