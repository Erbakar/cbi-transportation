import {z} from 'zod';
import {AppError,db,digest,runtime} from './runtime';
import {bookingTmaxxLink} from './booking-tmaxx';
import type {DocumentRow} from './operation-documents';
import {readTmaxxArchiveFile,tmaxxWorkspaceClient} from './tmaxx-workspace';
const archive=z.object({sourceType:z.string().optional(),id:z.number().int().positive(),entityid:z.number().int().positive(),reference:z.string().nullable(),description:z.string().nullish(),fileName:z.string(),fileSize:z.number(),type:z.object({id:z.number().int().positive()}).nullable()});
/** Read-only on T-MAXX. Never retries upload or archive creation; only records proven reconciliation locally. */
export async function recoverBookingDocument(id:string,owner:string,documentId:string){
 const link=await bookingTmaxxLink(id,owner);if(!link)throw new AppError('Önce dosyanın T-MAXX yük bağlantısı gerekli.',409);
 const doc=await db().prepare('SELECT * FROM operation_documents WHERE id=? AND booking_id=? AND owner=?').bind(documentId,id,owner).first<DocumentRow>();
 const job=await db().prepare('SELECT * FROM booking_tmaxx_documents WHERE document_id=? AND booking_id=? AND owner=?').bind(documentId,id,owner).first<{good_id:number;type_id:number;content_hash:string;verified_at:string|null;remote_id:number|null;target_kind:'good'|'position';target_id:number|null}>();
 if(!doc||!job)throw new AppError('Bu dosyada kontrol edilecek belge aktarımı bulunamadı.',404);
 if(job.good_id!==link.good_id||job.content_hash!==doc.hash)throw new AppError('Belge aktarım hedefi veya kaynak özeti değişmiş.',409);
 const entityId=job.target_kind==='position'?link.position_id:link.good_id;
 if(!['good','position'].includes(job.target_kind)||(job.target_id??job.good_id)!==entityId)throw new AppError('Arşiv hedefi değişmiş.',409);
 if(job.verified_at&&job.remote_id)return {status:'synced' as const,remoteId:job.remote_id,recovered:true};
 const {results:steps}=await db().prepare('SELECT step,status,result,request_hash FROM booking_tmaxx_steps WHERE document_id=?').bind(documentId).all<{step:string;status:string;result:string|null;request_hash:string}>();
 // Do not race an in-flight request. Crashed sending journals become inspectable after the transport deadline.
 if(steps.some(s=>s.status==='sending')){const row=await db().prepare("SELECT updated_at FROM booking_tmaxx_steps WHERE document_id=? AND status='sending' ORDER BY updated_at DESC LIMIT 1").bind(documentId).first<{updated_at:string}>();if(!row||!Number.isFinite(Date.parse(row.updated_at))||Date.now()-Date.parse(row.updated_at)<300000)throw new AppError('Aktarım halen çalışıyor olabilir. Beş dakika sonra arşivi kontrol edin.',409);}
 if(!steps.some(s=>s.step==='upload'))throw new AppError('Henüz T-MAXX dosya gönderimi başlatılmamış.',409);
 const object=await runtime().BUCKET.get(doc.object_key);if(!object||await digest(await object.arrayBuffer())!==doc.hash)throw new AppError('Kaynak belgenin bütünlüğü doğrulanamadı.',409);
 const get=await tmaxxWorkspaceClient(owner),good=await get('/api//sea/seaGood/'+link.good_id) as {id:number;referenceNo:string;seaPosition?:{id:number}};
 if(good.id!==link.good_id||good.referenceNo!==link.good_reference||good.seaPosition?.id!==link.position_id)throw new AppError('T-MAXX yük ilişkisi değişmiş.',409);
 const parsed=z.array(archive).safeParse(await get('/api//document/doc/findByEntityId?entityid='+entityId));if(!parsed.success||parsed.data.some(d=>d.entityid!==entityId))throw new AppError('T-MAXX arşiv listesi doğrulanamadı.',502);
 const marker=`CBI belge ${doc.id} · v${doc.version} · ${doc.hash}`,candidates=parsed.data.filter(d=>d.description===marker);
 if(candidates.length!==1)throw new AppError(candidates.length?'Birden fazla arşiv kaydı eşleşti. Otomatik doğrulama yapılmadı.':'T-MAXX arşivinde kanıtlı eşleşme bulunamadı. Belge yeniden gönderilmedi; T-MAXX arşivi kontrol edilmeli.',409);
 const selected=candidates[0];const exact=(d:z.infer<typeof archive>)=>d.id===selected.id&&d.entityid===entityId&&(job.target_kind!=='position'||d.sourceType==='SeaPosition')&&d.description===marker&&d.type?.id===job.type_id&&d.fileSize===doc.size&&d.fileName===doc.filename&&!!d.reference&&d.reference===selected.reference;
 if(!exact(selected))throw new AppError('Arşiv kaydının türü, hedefi veya dosya bilgileri eşleşmiyor.',409);
 const upload=steps.find(s=>s.step==='upload'),saved=steps.find(s=>s.step==='link');
 if(upload?.status==='complete'&&(!upload.result||JSON.parse(upload.result).reference!==selected.reference))throw new AppError('Dosya referansı aktarım günlüğüyle eşleşmiyor.',409);
 if(saved?.status==='complete'&&(!saved.result||JSON.parse(saved.result).id!==selected.id))throw new AppError('Arşiv kimliği aktarım günlüğüyle eşleşmiyor.',409);
 const file=await readTmaxxArchiveFile(owner,link.position_reference,selected.id);
 if(await digest(file.bytes.buffer)!==doc.hash)throw new AppError('T-MAXX dosyasının içeriği kaynak belgeyle aynı değil.',409);
 const latest=archive.safeParse(await get('/api//document/doc/'+selected.id));if(!latest.success||!exact(latest.data))throw new AppError('Arşiv kaydı kontrol sırasında değişti.',409);
 const result={status:'synced' as const,remoteId:selected.id,recovered:true},now=new Date().toISOString(),evidence={targetKind:job.target_kind,entityId,goodId:job.good_id,typeId:job.type_id,hash:doc.hash,reference:selected.reference,remoteId:selected.id};
 // Preserve the uncertain upload/link journal. Reconciliation is a separate, auditable local step.
 const committed=await db().batch([
 db().prepare('UPDATE booking_tmaxx_documents SET remote_id=?,verified_at=? WHERE document_id=? AND booking_id=? AND owner=? AND good_id=? AND type_id=? AND content_hash=? AND verified_at IS NULL').bind(selected.id,now,documentId,id,owner,job.good_id,job.type_id,doc.hash),
 db().prepare("INSERT INTO booking_tmaxx_steps(document_id,step,request_hash,status,result,updated_at) SELECT ?,'reconcile',?,'complete',?,? WHERE changes()=1").bind(documentId,await digest(JSON.stringify(evidence)),JSON.stringify(evidence),now)
 ]);
 if(!committed[0].meta.changes){const winner=await db().prepare('SELECT remote_id,verified_at FROM booking_tmaxx_documents WHERE document_id=? AND owner=?').bind(documentId,owner).first<{remote_id:number;verified_at:string}>();if(!winner?.verified_at||winner.remote_id!==selected.id)throw new AppError('Aktarım durumu değişti; yeniden kontrol edin.',409);}
 return result;
}
