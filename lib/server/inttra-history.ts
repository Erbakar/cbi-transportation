import {z} from 'zod';
import {AppError,runtime} from './runtime';
import {contracts,platformSession} from './platforms';
const row=z.object({siId:z.string().regex(/^\d{1,15}$/),siOriginal:z.string(),siSubmittedDt:z.string(),siName:z.string(),carrierBooking:z.string(),carrier:z.string(),vessel:z.string(),voyage:z.string(),portOfLoad:z.string(),portOfDischarge:z.string(),status:z.string(),carrierAcknowledgmentStatus:z.string()});
export async function inttraHistory(owner:string,now=Date.now()){
 const contract=contracts().find(c=>c.id==='inttra');if(!contract)throw new AppError('INTTRA bağlantısı tanımlanmalı.',503);
 const env=runtime();if(!env.INTTRA_RELAY_URL||!env.INTTRA_RELAY_KEY)throw new AppError('INTTRA geçmiş bağlantısı hazır değil.',503);
 const relay=new URL(env.INTTRA_RELAY_URL);if(relay.protocol!=='https:'||relay.username||relay.password)throw new AppError('INTTRA bağlantı adresi geçersiz.',503);
 const session=await platformSession(contract,owner);if(!session.cookie)throw new AppError('INTTRA oturumu yenilenmeli.',503);
 const to=new Date(now+3*3600000).toISOString().slice(0,10),from=new Date(now+3*3600000-30*86400000).toISOString().slice(0,10);
 async function read(start:string,end:string){const r=await fetch(new URL('/history',relay),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.INTTRA_RELAY_KEY},body:JSON.stringify({cookie:session.cookie,from:start,to:end}),redirect:'manual',signal:AbortSignal.timeout(35000)});if(!r.ok)throw new AppError('INTTRA geçmişi okunamadı.',502);return z.object({rows:z.array(row),complete:z.boolean()}).parse(await r.json());}
 let result=await read(from,to);
 if(!result.complete){const unique=new Map<string,z.infer<typeof row>>();let complete=true;for(let offset=0;offset<=30;offset++){const day=new Date(now+3*3600000-offset*86400000).toISOString().slice(0,10);const page=await read(day,day);page.rows.forEach(r=>unique.set(r.siId,r));complete=complete&&page.complete;}result={rows:[...unique.values()],complete};}
 result.rows.sort((a,b)=>b.siSubmittedDt.localeCompare(a.siSubmittedDt)||b.siId.localeCompare(a.siId));
 return {...result,from,to,checkedAt:new Date(now).toISOString()};
}
