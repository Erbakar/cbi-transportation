import {db} from './runtime';
import type {ScheduleTask} from '../operations/schedule';
export async function homeIndex(owner:string,cursor=''){
 const rows=(await db().prepare(`SELECT b.id,b.data,b.updated_at,s.data tasks,COALESCE(p.data,'{}') profile,
 MAX(b.updated_at,COALESCE(s.updated_at,''),COALESCE(p.updated_at,''),
 COALESCE((SELECT MAX(created_at) FROM operation_documents WHERE booking_id=b.id AND owner=b.owner),''),
 COALESCE((SELECT MAX(updated_at) FROM booking_field_operations WHERE booking_id=b.id AND owner=b.owner),''),
 COALESCE((SELECT MAX(created_at) FROM booking_finance_events WHERE booking_id=b.id AND owner=b.owner),''),
 COALESCE((SELECT MAX(updated_at) FROM document_dossiers WHERE booking_id=b.id AND owner=b.owner),''),
 COALESCE((SELECT MAX(updated_at) FROM booking_prealerts WHERE booking_id=b.id AND owner=b.owner),''),
 COALESCE((SELECT MAX(created_at) FROM booking_vgm_approvals WHERE booking_id=b.id AND owner=b.owner),'')) latest
 FROM booking_handovers b LEFT JOIN booking_schedules s ON s.booking_id=b.id AND s.owner=b.owner
 LEFT JOIN booking_reporting p ON p.booking_id=b.id AND p.owner=b.owner WHERE b.owner=? AND b.id>? ORDER BY b.id LIMIT 101`).bind(owner,cursor).all<{id:string;data:string;tasks:string|null;profile:string;latest:string}>()).results;
 return {files:rows.slice(0,100).map(r=>{const draft=JSON.parse(r.data),profile=JSON.parse(r.profile);return {id:r.id,reference:draft.salesReference,updatedAt:r.latest,test:profile.test===true,closed:profile.status==='closed',tasks:r.tasks?JSON.parse(r.tasks) as ScheduleTask[]:[]};}),nextCursor:rows.length>100?rows[99].id:null};
}
