import {AppError,db} from './runtime';
import {syncBookingDocument} from './booking-tmaxx';
import {recoverBookingDocument} from './tmaxx-document-recovery';
export async function inboxTmaxxStates(owner:string){
 const {results}=await db().prepare(`SELECT i.id,l.position_reference,l.good_reference,j.type_id,j.remote_id,j.verified_at,
 EXISTS(SELECT 1 FROM booking_tmaxx_steps s WHERE s.document_id=i.document_id AND s.status IN ('sending','unknown')) uncertain
 FROM booking_inbox i LEFT JOIN booking_tmaxx_links l ON l.booking_id=i.booking_id AND l.owner=i.owner
 LEFT JOIN booking_tmaxx_documents j ON j.document_id=i.document_id AND j.owner=i.owner AND j.booking_id=i.booking_id
 WHERE i.owner=? AND i.status='attached' ORDER BY i.created_at DESC LIMIT 100`).bind(owner).all<{id:string;position_reference:string|null;good_reference:string|null;type_id:number|null;remote_id:number|null;verified_at:string|null;uncertain:number}>();
 return Object.fromEntries(results.map(r=>[r.id,{positionReference:r.position_reference,goodReference:r.good_reference,typeId:r.type_id,remoteId:r.remote_id,status:r.verified_at?'synced':!r.good_reference?'unlinked':r.uncertain?'unknown':r.type_id?'pending':'ready'}]));
}
export async function transferInboxDocument(inboxId:string,owner:string,action:'sync'|'recover',typeId?:number){
 const row=await db().prepare(`SELECT i.booking_id,i.document_id FROM booking_inbox i JOIN operation_documents d ON d.id=i.document_id AND d.booking_id=i.booking_id AND d.owner=i.owner AND d.hash=i.hash AND d.size=i.size WHERE i.id=? AND i.owner=? AND i.status='attached'`).bind(inboxId,owner).first<{booking_id:string;document_id:string}>();
 if(!row)throw new AppError('Önce gelen belgeyi doğrulayarak booking dosyasına bağlayın.',409);
 if(action==='recover')return recoverBookingDocument(row.booking_id,owner,row.document_id);
 if(!Number.isSafeInteger(typeId)||!typeId||typeId<1)throw new AppError('T-MAXX belge türünü seçin.',422);
 return syncBookingDocument(row.booking_id,owner,row.document_id,typeId);
}
