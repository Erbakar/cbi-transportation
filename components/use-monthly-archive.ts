'use client';
import {useDisplayCache} from './use-display-cache';
import type {RecentDocument,recentPlatformDocuments} from '@/lib/server/recent-platform-documents';
type Snapshot={rows:RecentDocument[];progress:string;complete?:boolean;warning?:string};
export function useMonthlyArchive(){return useDisplayCache<Snapshot>('tmaxx-archive-month',async(signal,publish)=>{
 const all=new Map<number,RecentDocument>();let offset:number|null=0,documentOffset=0,failed=0,progress='Arşiv taraması hazırlanıyor…';
 const snapshot=(complete=false,warning=''):Snapshot=>({rows:[...all.values()].sort((a,b)=>b.date.localeCompare(a.date)),progress,complete,warning});
 try{const cache=await fetch('/api/tmaxx/archive-cache',{signal});if(cache.ok){const d=await cache.json() as {rows:RecentDocument[]};d.rows.forEach(r=>all.set(r.id,r));if(all.size){progress='Kayıtlı belgeler gösteriliyor; arka planda güncelleniyor.';publish(snapshot());}}}catch(e){if(signal.aborted)throw e;}
 try{do{
  const r=await fetch('/api/tmaxx/recent-documents?offset='+offset+'&documentOffset='+documentOffset,{signal});const d=await r.json() as Awaited<ReturnType<typeof recentPlatformDocuments>>&{error?:string};if(!r.ok)throw Error(d.error||'T-MAXX arşivi okunamadı.');
  if(documentOffset===0&&!d.failures.length){const day=new Date(Date.parse(d.checkedAt)+10800000-offset*86400000).toISOString().slice(0,10);for(const [id,row] of all)if(new Date(Date.parse(row.date)+10800000).toISOString().slice(0,10)===day)all.delete(id);}
  d.documents.forEach(row=>all.set(row.id,row));failed+=d.failures.length;progress=`${d.scanned} / ${d.available} arşiv günü incelendi`;offset=d.next;documentOffset=d.nextDocumentOffset??0;publish(snapshot(false,failed?`${failed} belge eşleştirilemedi; diğer belgeler gösteriliyor.`:''));
 }while(offset!==null);}catch(e){if(signal.aborted)throw e;if(!all.size)throw e;return snapshot(false,(e as Error).message+' Okunan belgeler korundu.');}
 return snapshot(failed===0,failed?`${failed} belge eşleştirilemedi; liste eksik olabilir.`:'');
 });}
