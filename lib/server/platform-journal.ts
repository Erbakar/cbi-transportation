import {AppError,db,digest} from './runtime';
export type Run={id:string;revision:number;owner:string};
// A persisted pending step is ambiguous after a crash. It is never replayed automatically.
export async function runStep<T>(run:Run,platform:string,step:string,request:unknown,send:()=>Promise<T>):Promise<T>{
 const hash=await digest(JSON.stringify(request));
 const existing=await db().prepare('SELECT status,request_hash,result FROM platform_steps WHERE record_id=? AND revision=? AND platform=? AND step=?').bind(run.id,run.revision,platform,step).first<{status:string;request_hash:string;result:string|null}>();
 if(existing?.status==='rejected'){await db().prepare("DELETE FROM platform_steps WHERE record_id=? AND revision=? AND platform=? AND step=? AND status='rejected'").bind(run.id,run.revision,platform,step).run();}
 if(existing&&existing.status!=='rejected'){if(existing.request_hash!==hash)throw new AppError('Önceki platform adımı farklı bilgilerle başlatılmış; mevcut kayıt doğrulanmalı.',409);if(existing.status==='complete'&&existing.result)return JSON.parse(existing.result);throw new AppError('Önceki platform isteğinin sonucu belirsiz. Otomatik tekrar gönderim durduruldu.',409);}
 const claimed=await db().prepare("INSERT OR IGNORE INTO platform_steps(record_id,revision,platform,step,status,request_hash,updated_at) VALUES(?,?,?,?,'sending',?,?)").bind(run.id,run.revision,platform,step,hash,new Date().toISOString()).run();
 if(!claimed.meta.changes)throw new AppError('Bu platform adımı zaten başlatıldı.',409);
 try{const result=await send();await db().prepare("UPDATE platform_steps SET status='complete',result=?,updated_at=? WHERE record_id=? AND revision=? AND platform=? AND step=?").bind(JSON.stringify(result),new Date().toISOString(),run.id,run.revision,platform,step).run();return result;}
 catch(e){await db().prepare("UPDATE platform_steps SET status=?,updated_at=? WHERE record_id=? AND revision=? AND platform=? AND step=?").bind(step.startsWith('review:')&&e instanceof AppError&&e.status===422?'rejected':'unknown',new Date().toISOString(),run.id,run.revision,platform,step).run();throw e;}
}
