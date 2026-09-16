import type {Extraction} from '../domain';
import type {Manual} from '../manual';
import {AppError,db,digest} from './runtime';
import {prepareTmaxx,executeTmaxx} from './tmaxx-workflow';
import {prepareInttra,executeInttra} from './inttra-workflow';
import type {Run} from './platform-journal';
export async function transfer(run:Run,ex:Extraction,manual:Manual,deliveries:{id:string;platform:string;status:string}[]){
 const pending=deliveries.filter(d=>d.status!=='created');
 if(pending.some(d=>!['tmaxx','inttra'].includes(d.platform)))throw new AppError('Bu platform için aktarım eşlemesi tanımlı değil.',422);
 const keys=new Map<string,string>();
 for(const d of pending){const key=await digest(JSON.stringify([ex.fields.bookingNumber.value,ex.containers.map(c=>c.containerNumber.value).sort(),d.platform]));const existing=await db().prepare('SELECT record_id FROM deliveries WHERE owner=? AND platform=? AND business_key=? AND record_id<>?').bind(run.owner,d.platform,key,run.id).first();if(existing)throw new AppError('Aynı booking ve konteynerler başka bir kayıt üzerinden aktarılmış veya işleniyor.',409);keys.set(d.platform,key);}
 // All local mapping checks and target matching finish before either final write begins.
 const tmaxx=pending.some(d=>d.platform==='tmaxx')?await prepareTmaxx(run.owner,ex,manual):null;
 const inttra=pending.some(d=>d.platform==='inttra')?await prepareInttra(run,ex,manual):null;
 if(inttra?.warnings.length&&!inttra.approved){await db().prepare("UPDATE records SET status='missing',issues=? WHERE id=?").bind(JSON.stringify(inttra.warnings.map(w=>'INTTRA '+w.code+': '+w.message)),run.id).run();return;}
 for(const d of pending){
  const claimed=await db().prepare("UPDATE deliveries SET status='sending',payload=?,owner=?,business_key=?,updated_at=? WHERE id=? AND status IN ('waiting','failed','blocked')").bind(JSON.stringify(d.platform==='tmaxx'?tmaxx:inttra),run.owner,keys.get(d.platform),new Date().toISOString(),d.id).run();if(!claimed.meta.changes)throw new AppError('Aktarım zaten başlatılmış. Sonucu kontrol edin.',409);
  try{const reference=d.platform==='tmaxx'?await executeTmaxx(run,tmaxx!):await executeInttra(run,inttra!);await db().prepare("UPDATE deliveries SET status='created',reference=?,message=?,updated_at=? WHERE id=?").bind(reference,d.platform==='inttra'?'Talimat INTTRA’ya gönderildi. Taşıyıcı onayı ayrıca takip edilir.':'HBL bilgileri T-MAXX’e kaydedildi.',new Date().toISOString(),d.id).run();}
  catch(e){await db().prepare("UPDATE deliveries SET status='unknown',message=?,updated_at=? WHERE id=?").bind(e instanceof AppError?e.message:'Platform sonucu doğrulanamadı. Tekrar gönderim durduruldu.',new Date().toISOString(),d.id).run();throw e;}
 }
 await db().prepare("UPDATE records SET status='complete',issues=NULL WHERE id=?").bind(run.id).run();
}
