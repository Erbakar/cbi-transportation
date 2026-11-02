// Preserve the carrier's displayed Sending Date; it is not the cutoff date.
export function cmaHistoryRows(rows:string[][],now=Date.now()){
 const months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
 const today=new Date(now+3*3600000).toISOString().slice(0,10),start=new Date(now+3*3600000-30*86400000).toISOString().slice(0,10);
 return rows.filter(r=>{const m=r[7]?.match(/^(\d{2})-([A-Z]{3})-(\d{4})\b/i);if(!m||!r[3]||!/^(submitted|integrated)$/i.test(r[2]?.trim()||''))return false;const month=months.indexOf(m[2].toUpperCase());if(month<0)return false;const day=`${m[3]}-${String(month+1).padStart(2,'0')}-${m[1]}`;return day>=start&&day<=today;});
}
