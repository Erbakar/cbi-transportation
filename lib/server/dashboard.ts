import {db,AppError,digest} from './runtime';
import {ownBooking} from './operation-documents';
import {controlState} from './control-state';
import {assessControl} from './control-assessment';
import {documentLifecycleWorkspace} from './document-lifecycle';
import {vgmWorkspace} from './vgm';
import {prealertWorkspace} from './prealert';
import {financeWorkspace} from './finance';
import {taskAlerts,type ScheduleTask} from '../operations/schedule';
import {emptyReporting,reportingSchema,type ReportingData,type DashboardRow} from '../operations/dashboard';
import {tmaxxSaveKeys} from './tmaxx-workflow';
type Profile={revision:number;data:string;closed_at:string|null};
export async function dashboardIndex(owner:string,cursor=''){
 const rows=(await db().prepare('SELECT id,data,created_at FROM booking_handovers WHERE owner=? AND id>? ORDER BY id LIMIT 101').bind(owner,cursor).all<{id:string;data:string;created_at:string}>()).results;
 return {bookings:rows.slice(0,100).map(r=>({id:r.id,reference:JSON.parse(r.data).salesReference,createdAt:r.created_at})),nextCursor:rows.length>100?rows[99].id:null,checkedAt:new Date().toISOString()};
}
export async function reportingProfile(id:string,owner:string){await ownBooking(id,owner);const row=await db().prepare('SELECT revision,data,closed_at FROM booking_reporting WHERE booking_id=? AND owner=?').bind(id,owner).first<Profile>();return {revision:row?.revision||0,data:row?JSON.parse(row.data) as ReportingData:{...emptyReporting},closedAt:row?.closed_at||null};}
export async function saveReportingProfile(id:string,owner:string,raw:unknown){
 const parsed=reportingSchema.safeParse(raw);if(!parsed.success)throw new AppError(parsed.error.issues[0]?.message||'Raporlama bilgileri geçersiz.');const v=parsed.data,old=await reportingProfile(id,owner);if(old.revision!==v.revision)throw new AppError('Raporlama bilgileri değişti; yenileyin.',409);
 const now=new Date().toISOString(),closed=v.data.status==='closed'?(old.closedAt||now):null;
 const mutation=v.revision?db().prepare('UPDATE booking_reporting SET revision=revision+1,data=?,closed_at=?,updated_at=? WHERE booking_id=? AND owner=? AND revision=?').bind(JSON.stringify(v.data),closed,now,id,owner,v.revision):db().prepare('INSERT INTO booking_reporting(booking_id,owner,revision,data,closed_at,updated_at) VALUES(?,?,1,?,?,?) ON CONFLICT(booking_id) DO NOTHING').bind(id,owner,JSON.stringify(v.data),closed,now);
 const result=await db().batch([mutation,db().prepare('INSERT INTO booking_reporting_events(id,booking_id,owner,revision,snapshot,reason,created_at) SELECT ?,?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),id,owner,v.revision+1,JSON.stringify({data:v.data,closedAt:closed}),v.reason,now)]);if(!result[0].meta.changes)throw new AppError('Eşzamanlı raporlama değişikliği; yenileyin.',409);return reportingProfile(id,owner);
}
export async function dashboardFile(id:string,owner:string):Promise<DashboardRow&{tmaxxFields:number;checkedAt:string;reportingHistory:{revision:number;reason:string;created_at:string}[]}>{
 await ownBooking(id,owner);
 const head=()=>db().prepare('SELECT data,control_epoch,created_at FROM booking_handovers WHERE id=? AND owner=?').bind(id,owner).first<{data:string;control_epoch:number;created_at:string}>();
 const before=await head(),profile=await reportingProfile(id,owner),state=await controlState(id,owner),assessment=assessControl(state);
 // Reuse the same exact-source approval rules as the operational screens; no platform calls.
 const lifecycle=await documentLifecycleWorkspace(id,owner),vgm=await vgmWorkspace(id,owner),prealert=await prealertWorkspace(id,owner),finance=await financeWorkspace(id,owner);
 const extracts=(await db().prepare('SELECT e.document_id,e.status,e.id FROM booking_document_extractions e JOIN operation_documents d ON d.id=e.document_id WHERE d.booking_id=? AND d.owner=?').bind(id,owner).all<{document_id:string;status:string;id:string}>()).results;
 const applications=(await db().prepare('SELECT selected_fields FROM booking_extraction_applications WHERE booking_id=? AND owner=?').bind(id,owner).all<{selected_fields:string}>()).results;
 const duplicates=await db().prepare("SELECT COUNT(*) n FROM booking_inbox WHERE booking_id=? AND owner=? AND json_extract(decision,'$.duplicate')=1").bind(id,owner).first<{n:number}>();
 const deliveries=(await db().prepare("SELECT d.record_id,d.payload FROM deliveries d JOIN bill_control_links l ON l.record_id=d.record_id AND l.owner=d.owner WHERE l.booking_id=? AND l.owner=? AND d.platform='tmaxx' AND d.status='created'").bind(id,owner).all<{record_id:string;payload:string|null}>()).results;
 const steps=(await db().prepare("SELECT p.record_id,p.step,p.request_hash FROM platform_steps p JOIN bill_control_links l ON l.record_id=p.record_id JOIN records r ON r.id=p.record_id AND r.owner=l.owner AND r.revision=p.revision WHERE l.booking_id=? AND l.owner=? AND p.platform='tmaxx' AND p.status='complete'").bind(id,owner).all<{record_id:string;step:string;request_hash:string}>()).results;
 let tmaxxFields=0;const sent=new Set<string>();for(const d of deliveries){const p=d.payload?JSON.parse(d.payload):null;for(const load of p?.loads||[p])for(const update of load?.updates||[]){const hash=await digest(JSON.stringify(update));if(steps.some(s=>s.record_id===d.record_id&&s.request_hash===hash)){const key=d.record_id+':'+hash;if(!sent.has(key)){sent.add(key);tmaxxFields+=tmaxxSaveKeys(update.path,update).filter(k=>Object.hasOwn(update.body,k)).length;}}}}
 const reportingHistory=(await db().prepare('SELECT revision,reason,created_at FROM booking_reporting_events WHERE booking_id=? AND owner=? ORDER BY revision DESC LIMIT 20').bind(id,owner).all<{revision:number;reason:string;created_at:string}>()).results;
 const after=await head(),endProfile=await reportingProfile(id,owner);if(before?.control_epoch!==after?.control_epoch||profile.revision!==endProfile.revision)throw new AppError('Dosya hesaplama sırasında değişti. Raporu yenileyin.',409);
 const draft=JSON.parse(before!.data),current=state.docs.filter(d=>d.current),active=profile.data.status==='open';
 const has=(types:string[])=>current.some(d=>types.includes(d.type));
 const confirmed=has(['booking_confirmation','booking_revision']),instruction=has(['instruction'])||state.links.some(r=>!!r.extraction);
 const docRefs=current.map(d=>({id:d.id,type:d.type,extractionId:extracts.find(e=>e.document_id===d.id&&e.status==='ready')?.id||null}));
 const alerts=(state.schedule?JSON.parse(state.schedule.data) as ScheduleTask[]:[]).filter(t=>t.kind.endsWith('Cutoff')).flatMap(t=>taskAlerts(t,Date.now(),docRefs));
 const vgmRequired=vgm.containers.length>0||!!draft.equipmentCount||prealert.config.vgmRequired||has(['vgm']);
 const latest=vgm.approvals.filter((a,i,all)=>all.findIndex(b=>b.container_number===a.container_number)===i);
 const valid=latest.filter(a=>!a.revoked_at&&!a.stale&&vgm.documents.some(d=>d.id===a.snapshot.documentId&&d.current&&d.hash===a.snapshot.documentHash));
 const vgmPending=vgmRequired&&(!vgm.containers.length||vgm.containers.some(c=>!valid.some(a=>a.container_number===c.number.replace(/[\s-]/g,'').toUpperCase())));
 const bills=lifecycle.dossiers.filter(d=>['hbl','mbl'].includes(d.family));const draftPending=!bills.length||bills.some(d=>!d.approval||d.superseded);
 const mismatch=[...assessment.rows,...assessment.containerRows].filter(r=>r.level==='critical'||r.level==='review'&&!r.resolved).length;
 const missing=Number(!confirmed)+Number(!instruction)+Number(vgmRequired&&!has(['vgm']));
 const pass=finance.analysis.tasks.filter(t=>t.key.startsWith('pass:')).length,supplier=finance.analysis.tasks.filter(t=>t.key.startsWith('missing:')).length;
 const metrics={open:Number(active),confirmation:Number(active&&!confirmed),instruction:Number(active&&!instruction),vgm:Number(active&&vgmPending),draft:Number(active&&draftPending),prealert:Number(active&&prealert.status!=='sent'),upcoming:active?alerts.filter(a=>a.code==='upcoming').length:0,overdue:active?alerts.filter(a=>a.code==='overdue').length:0,mismatch,missingDocuments:missing,requiredDocuments:2+Number(vgmRequired),passThrough:pass,supplierInvoice:supplier,customerInvoice:Number(pass>0||finance.analysis.tasks.some(t=>t.key==='revenue'))};
 const issues:{label:string;href:string}[]=[];const add=(condition:boolean,label:string,path:string)=>{if(condition)issues.push({label,href:'/booking/'+id+path});};
 add(!!metrics.confirmation,'Booking teyidi bekleniyor','');add(!!metrics.instruction,'Talimat bekleniyor','');add(!!metrics.vgm,'VGM onayı bekleniyor','/vgm');add(!!metrics.draft,'Draft onayı bekleniyor','/documents');add(!!metrics.prealert,'Pre-alert bekleniyor','/prealert');add(!!(metrics.upcoming+metrics.overdue),'Cut-off takibi','');add(!!mismatch,'Belge uyuşmazlığı','/control');add(!!(pass+supplier+metrics.customerInvoice),'Finans takibi','/finance');
 let autoFields=0,correctedFields=0;for(const r of state.links){if(!r.extraction)continue;const original=JSON.parse(r.extraction).fields||{},manual=r.manual?JSON.parse(r.manual):{};for(const [key,raw] of Object.entries(original)){const field=raw as {value?:string|null};if(field.value===null||field.value===undefined||field.value==='')continue;autoFields++;const override=Object.hasOwn(manual.fieldOverrides||{},key)?manual.fieldOverrides[key]:['bookingNumber','vessel','voyage'].includes(key)&&manual[key]?manual[key]:undefined;if(override!==undefined&&String(override)!==String(field.value))correctedFields++;}}
 const readDocuments=current.filter(d=>extracts.some(e=>e.document_id===d.id&&e.status==='ready')||state.readings.find(r=>r.document_id===d.id)?.status==='ready'&&state.readings.find(r=>r.document_id===d.id)?.document_hash===d.hash||vgm.readings.find(r=>r.document_id===d.id)?.status==='ready'&&vgm.readings.find(r=>r.document_id===d.id)?.document_hash===d.hash).length;
 const closed=profile.closedAt?Date.parse(profile.closedAt):NaN,created=Date.parse(before!.created_at),elapsedHours=Number.isFinite(closed)&&closed>=created?(closed-created)/3600000:null;
 const carrierSource=assessment.field?.values.carrier||'';
 return {id,reference:draft.salesReference,customer:draft.customer||'',route:[draft.loadPort||'?',draft.dischargePort||'?'].join(' → '),assignee:draft.assignee||owner,createdAt:before!.created_at,profile:profile.data,profileRevision:profile.revision,closedAt:profile.closedAt,carrierSource,metrics,totals:finance.analysis.totals,financeCount:finance.entries.filter(e=>!e.voided_at).length,issues,elapsedHours,autoFields,correctedFields,prefilledFields:new Set(applications.flatMap(a=>JSON.parse(a.selected_fields) as string[])).size,documents:current.length,readDocuments,duplicateMatches:duplicates?.n||0,revisions:bills.reduce((n,b)=>n+Math.max(0,b.versions.filter(v=>lifecycle.documents.some(d=>d.id===v.document_id&&['hbl_draft','mbl_draft'].includes(d.type))).length-1),0),prealertEvaluated:prealert.revision>0,prealertHasIssues:prealert.issues.length>0,tmaxxFields,reportingHistory,checkedAt:new Date().toISOString()};
}
