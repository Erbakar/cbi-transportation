import {AppError,db} from './runtime';
import {bookingTmaxxLink,tmaxxArchiveTypes,documentTarget,syncBookingDocument} from './booking-tmaxx';
import {addDocument,listDocuments} from './operation-documents';
import {recoverBookingDocument} from './tmaxx-document-recovery';
export const archivePurposes={hbl_approval:{code:'DOM',label:'HBL müşteri onayı'},prealert:{code:'PRA',label:'Pre-alert'}} as const;
export type ArchivePurpose=keyof typeof archivePurposes;
async function target(id:string,owner:string,purpose:ArchivePurpose){
 const link=await bookingTmaxxLink(id,owner);if(!link)throw new AppError('Önce booking dosyasını T-MAXX yüküne bağlayın.',409);
 const types=(await tmaxxArchiveTypes(owner)).filter(t=>t.code===archivePurposes[purpose].code);
 if(types.length!==1)throw new AppError('T-MAXX arşiv belge türü tekil ve aktif olarak doğrulanamadı.',409);
 await documentTarget(id,owner,types[0].id);return types[0];
}
export async function operationArchiveWorkspace(id:string,owner:string){const link=await bookingTmaxxLink(id,owner),docs=await listDocuments(id,owner);const jobs=await db().prepare('SELECT document_id,type_id,remote_id,verified_at,target_kind,target_id,EXISTS(SELECT 1 FROM booking_tmaxx_steps s WHERE s.document_id=booking_tmaxx_documents.document_id AND s.status IN (\'sending\',\'unknown\')) uncertain FROM booking_tmaxx_documents WHERE booking_id=? AND owner=?').bind(id,owner).all<{document_id:string;type_id:number;remote_id:number|null;verified_at:string|null;target_kind:'good'|'position';target_id:number|null;uncertain:number}>();return {link,documents:docs.filter(d=>d.sourceReference.startsWith('[CBI arşiv:')).map(d=>({...d,job:jobs.results.find(j=>j.document_id===d.id)||null}))};}
export async function uploadOperationArchive(id:string,owner:string,purpose:ArchivePurpose,form:FormData){
 const type=await target(id,owner,purpose);const reason=String(form.get('sourceReference')||'').trim();if(!reason||reason.length>400)throw new AppError('Belgenin kaynağını en fazla 400 karakterle belirtin.',422);
 form.set('type','other');form.set('sourceReference','[CBI arşiv:'+purpose+'] '+reason);
 const saved=await addDocument(id,owner,form);
 const stored=(await listDocuments(id,owner)).find(d=>d.id===saved.documentId);if(!stored?.isCurrent||!stored.sourceReference.startsWith('[CBI arşiv:'+purpose+'] '))throw new AppError('Bu dosya daha önce başka amaçla veya eski sürüm olarak yüklenmiş. Booking belge arşivinden mevcut kaydı kontrol edin.',409);
 try{return {...saved,archive:await syncBookingDocument(id,owner,saved.documentId,type.id,purpose==='prealert'?'position':'good')};}catch(e){return {...saved,archive:{status:'pending',message:e instanceof Error?e.message:'T-MAXX aktarımı doğrulanamadı.'}};}
}
export async function retryOperationArchive(id:string,owner:string,documentId:string,recover=false){
 const docs=await listDocuments(id,owner),doc=docs.find(d=>d.id===documentId&&d.isCurrent);if(!doc)throw new AppError('Güncel arşiv belgesi bulunamadı.',404);
 const purpose=(Object.keys(archivePurposes) as ArchivePurpose[]).find(p=>doc.sourceReference.startsWith('[CBI arşiv:'+p+'] '));if(!purpose)throw new AppError('Belge bu arşiv işlemine ait değil.',422);
 if(recover)return recoverBookingDocument(id,owner,documentId);
 const type=await target(id,owner,purpose);return syncBookingDocument(id,owner,documentId,type.id,purpose==='prealert'?'position':'good');
}
