import {AppError} from './runtime';
import {bookingTmaxxLink} from './booking-tmaxx';
import {readTmaxxPosition,readTmaxxArchiveFile} from './tmaxx-workspace';
import {tmaxxDocument} from './tmaxx-document';
export async function bookingErpDocuments(bookingId:string,owner:string){
 const link=await bookingTmaxxLink(bookingId,owner);if(!link)return {linked:false as const,documents:[]};
 const snapshot=await readTmaxxPosition(owner,link.position_reference);
 if(snapshot.position.id!==link.position_id||!snapshot.loads.some(l=>l.id===link.good_id&&l.reference===link.good_reference))throw new AppError('T-MAXX yük bağlantısı değişmiş.',409);
 return {linked:true as const,link,checkedAt:snapshot.checkedAt,documents:snapshot.documents.filter(d=>d.entityId===link.good_id||d.entityId===link.position_id)};
}
export async function bookingErpFile(bookingId:string,owner:string,documentId:number){const w=await bookingErpDocuments(bookingId,owner);if(!w.linked||!w.documents.some(d=>d.id===documentId))throw new AppError('Belge bağlı yükün veya pozisyonun arşivinde yok.',404);const file=await readTmaxxArchiveFile(owner,w.link.position_reference,documentId);if(file.entityId!==w.link.good_id&&file.entityId!==w.link.position_id)throw new AppError('Belge başka yüke taşınmış.',409);return file;}
export async function bookingErpHbl(bookingId:string,owner:string,reportId?:number){const w=await bookingErpDocuments(bookingId,owner);if(!w.linked)throw new AppError('Önce T-MAXX yüküne bağlayın.',409);return tmaxxDocument(owner,w.link.good_id,reportId);}
