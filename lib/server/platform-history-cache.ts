import {db} from './runtime';
import type {RecentDocument,recentPlatformDocuments} from './recent-platform-documents';
export async function storeArchivePage(owner:string,offset:number,page:number,result:Awaited<ReturnType<typeof recentPlatformDocuments>>){
 const day=new Date(Date.parse(result.checkedAt)+10800000-offset*86400000).toISOString().slice(0,10);
 if(result.failures.length)return;
 await db().prepare('INSERT INTO platform_history_pages(owner,day,page,data,checked_at) VALUES(?,?,?,?,?) ON CONFLICT(owner,day,page) DO UPDATE SET data=excluded.data,checked_at=excluded.checked_at').bind(owner,day,page,JSON.stringify(result.documents),Date.now()).run();
 if(result.nextDocumentOffset===null)await db().prepare('DELETE FROM platform_history_pages WHERE owner=? AND day=? AND page>?').bind(owner,day,page).run();
}
export async function cachedArchive(owner:string){
 const start=new Date(Date.now()-30*86400000).toISOString();
 const pages=(await db().prepare('SELECT data,checked_at FROM platform_history_pages WHERE owner=? AND day>=?').bind(owner,start.slice(0,10)).all<{data:string;checked_at:number}>()).results;
 const rows=new Map<number,RecentDocument>();for(const page of pages)for(const row of JSON.parse(page.data) as RecentDocument[])if(row.date>=start)rows.set(row.id,row);
 return {rows:[...rows.values()].sort((a,b)=>b.date.localeCompare(a.date)),checkedAt:pages.length?Math.max(...pages.map(p=>p.checked_at)):null,complete:false};
}
