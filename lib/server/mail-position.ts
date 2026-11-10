import {db} from './runtime';
import {findExistingLoads,tmaxxClient} from './tmaxx-workflow';
import {normalizeTmaxxReference} from '../tmaxx-reference';

const clean=(v:string)=>v.replace(/[\s-]/g,'').toUpperCase();

/**
 * Finds the T-MAXX position for a mailed instruction from the containers (and booking)
 * read from its documents — what staff do on screen by typing the reference. Only one
 * position holding every container, with no conflicting booking, is accepted; anything
 * else returns '' and the reference is asked for. Read-only: nothing is written to T-MAXX.
 */
export async function findPosition(owner:string,recordId:string):Promise<string>{
 const row=await db().prepare('SELECT fields,extraction FROM records WHERE id=? AND owner=?').bind(recordId,owner).first<{fields:string|null;extraction:string|null}>();
 if(!row?.extraction)return '';
 const ex=JSON.parse(row.extraction) as {containers?:{containerNumber?:{value?:string}}[]};
 const fields=JSON.parse(row.fields||'{}') as Record<string,{value?:string}>;
 const containers=[...new Set((ex.containers||[]).map(c=>clean(c.containerNumber?.value||'')).filter(n=>/^[A-Z]{4}\d{7}$/.test(n)))];
 const booking=(fields.bookingNumber?.value||'').trim();
 if(!containers.length||containers.length>20)return '';
 const loads=await findExistingLoads(owner,booking,containers);
 const byPosition=new Map<number,{containers:Set<string>;bookings:Set<string>}>();
 for(const load of loads){
  const p=byPosition.get(load.positionId)||{containers:new Set<string>(),bookings:new Set<string>()};
  load.containers.forEach(c=>p.containers.add(clean(c)));if(load.booking)p.bookings.add(clean(load.booking));
  byPosition.set(load.positionId,p);
 }
 const fits=[...byPosition].filter(([,p])=>containers.every(c=>p.containers.has(c))&&(!booking||!p.bookings.size||p.bookings.has(clean(booking))));
 if(fits.length!==1)return '';
 const position=await (await tmaxxClient(owner))('/api//sea/seaPosition/'+fits[0][0]) as {id?:number;referenceNo?:string}|null;
 const reference=normalizeTmaxxReference(String(position?.referenceNo||''));
 return position?.id===fits[0][0]&&/^S\.E\.\d{2}\.\d{2}\.\d{5}$/.test(reference)?reference:'';
}
