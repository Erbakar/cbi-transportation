import {db,digest,AppError,runtime} from './runtime';
import {ownBooking,type DocumentRow} from './operation-documents';
import {stableControl} from '../operations/bill-control';
import type {ControlDecision} from '../operations/control-review';
export type ControlDoc=DocumentRow&{current:number};
export type ControlEvent={id:string;document_id:string;kind:string;related_id:string;reason:string;created_at:string};
export async function controlState(id:string,owner:string){
 await ownBooking(id,owner);
 const booking=await db().prepare('SELECT data,revision,evidence_revision,control_epoch FROM booking_handovers WHERE id=? AND owner=?').bind(id,owner).first<{data:string;revision:number;evidence_revision:number;control_epoch:number}>();
 const field=await db().prepare('SELECT data,source,revision FROM booking_field_operations WHERE booking_id=? AND owner=?').bind(id,owner).first<{data:string;source:string|null;revision:number}>();
 const schedule=await db().prepare('SELECT data,revision FROM booking_schedules WHERE booking_id=? AND owner=?').bind(id,owner).first<{data:string;revision:number}>();
 const docs=(await db().prepare('SELECT d.*,NOT EXISTS(SELECT 1 FROM operation_documents n WHERE n.replaces_id=d.id) current FROM operation_documents d WHERE booking_id=? AND owner=? ORDER BY d.id').bind(id,owner).all<ControlDoc>()).results;
 const readings=(await db().prepare('SELECT * FROM bill_control_readings WHERE booking_id=? AND owner=? ORDER BY rowid DESC').bind(id,owner).all<{id:string;document_id:string;document_hash:string;status:string;result:string|null;error:string|null}>()).results;
 const links=(await db().prepare("SELECT r.id,r.revision,r.filename,r.manual,r.extraction,r.fields,r.hash FROM bill_control_links l JOIN records r ON r.id=l.record_id AND r.owner=l.owner WHERE l.booking_id=? AND l.owner=? AND r.status<>'deleted' ORDER BY r.id").bind(id,owner).all<{id:string;revision:number;filename:string;manual:string|null;extraction:string|null;fields:string|null;hash:string}>()).results;
 const vgm=(await db().prepare('SELECT id,fingerprint,revoked_at FROM booking_vgm_approvals WHERE booking_id=? AND owner=? ORDER BY rowid DESC').bind(id,owner).all()).results;
 const events=(await db().prepare('SELECT * FROM bill_control_document_events WHERE booking_id=? AND owner=? ORDER BY rowid DESC').bind(id,owner).all<ControlEvent>()).results;
 const fingerprint=await digest(stableControl({booking:{data:booking!.data,revision:booking!.revision,evidence_revision:booking!.evidence_revision},field,schedule,docs:docs.map(d=>[d.id,d.hash,d.current]),readings,links,vgm,events}));
 const decisions=(await db().prepare('SELECT * FROM bill_control_decisions WHERE booking_id=? AND owner=? ORDER BY rowid DESC').bind(id,owner).all<ControlDecision>()).results;
 return {booking:booking!,field,schedule,docs,readings,links,events,fingerprint,decisions};
}
export async function assertControlFiles(docs:ControlDoc[]){for(const d of docs.filter(d=>d.current)){const file=await runtime().BUCKET.get(d.object_key);if(!file||await digest(await file.arrayBuffer())!==d.hash)throw new AppError('Kaynak dosya bütünlüğü doğrulanamadı: '+d.filename,409);}}
export async function controlIdle(id:string,owner:string){const busy=await db().prepare('SELECT r.id FROM bill_control_links l JOIN records r ON r.id=l.record_id WHERE l.booking_id=? AND l.owner=? AND r.lock_until>? LIMIT 1').bind(id,owner,Date.now()).first();if(busy)throw new AppError('Bağlı konşimento işleniyor; işlem bittikten sonra kontrol kararını değiştirin.',409);}
