import {controlPlanIssues} from '../operations/control-review';
import {AppError,db,digest} from './runtime';
import {controlState,assertControlFiles} from './control-state';
import {assessControl} from './control-assessment';
import {stableControl} from '../operations/bill-control';
import type {Run} from './platform-journal';
export class ControlApprovalError extends AppError {readonly controlBlocked=true;}
export async function requireControlApproval(run:Run,kind:string,payload:unknown){
 const link=await db().prepare('SELECT booking_id FROM bill_control_links WHERE record_id=? AND owner=?').bind(run.id,run.owner).first<{booking_id:string}>();
 // Legacy records remain on their established workflow until explicitly enrolled.
 if(!link)return;
 const state=await controlState(link.booking_id,run.owner),record=state.links.find(r=>r.id===run.id);
 if(!record||record.revision!==run.revision)throw new ControlApprovalError('Konşimento sürümü değişti; yeniden kontrol edin.',409);
 const payloadText=stableControl(payload),hash=await digest(payloadText);
 await db().prepare('INSERT OR IGNORE INTO bill_control_requests(id,booking_id,record_id,owner,revision,kind,payload_hash,payload,fingerprint,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),link.booking_id,run.id,run.owner,run.revision,kind,hash,payloadText,state.fingerprint,new Date().toISOString()).run();
 const request=await db().prepare('SELECT id FROM bill_control_requests WHERE record_id=? AND owner=? AND kind=? AND payload_hash=? AND fingerprint=?').bind(run.id,run.owner,kind,hash,state.fingerprint).first<{id:string}>();
 const approval=await db().prepare('SELECT id,decision_hash,revoked_at FROM bill_control_approvals WHERE request_id=? AND owner=? ORDER BY rowid DESC LIMIT 1').bind(request!.id,run.owner).first<{id:string;decision_hash:string;revoked_at:string|null}>();
 const assessment=assessControl(state),decisionHash=await digest(stableControl(state.decisions.filter(d=>d.fingerprint===state.fingerprint)));
 if(!approval||approval.revoked_at||approval.decision_hash!==decisionHash||assessment.blockers.length||controlPlanIssues(kind,payload,assessment.field).length)throw new ControlApprovalError('Konşimento veri kontrol merkezinde güncel aktarım planını gerekçesiyle onaylayın. Booking: '+JSON.parse(state.booking.data).salesReference+' · /booking/'+link.booking_id+'/control',409);
 try{await assertControlFiles(state.docs.filter(d=>!assessment.excluded.includes('document:'+d.id)));}catch(e){throw new ControlApprovalError(e instanceof AppError?e.message:'Kaynak dosya doğrulanamadı.',409);}
 const after=await controlState(link.booking_id,run.owner);
 const still=await db().prepare('SELECT id,revoked_at FROM bill_control_approvals WHERE request_id=? AND owner=? ORDER BY rowid DESC LIMIT 1').bind(request!.id,run.owner).first<{id:string;revoked_at:string|null}>();
 if(after.fingerprint!==state.fingerprint||after.booking.control_epoch!==state.booking.control_epoch||still?.id!==approval.id||still.revoked_at)throw new ControlApprovalError('Kontrol kaynağı veya onayı değişti; aktarım durduruldu.',409);
}
