import {AppError,db,digest,runtime} from './runtime';
import {ownBooking,type DocumentRow} from './operation-documents';
import {stableControl} from '../operations/bill-control';
import {lifecycleSchema,lifecycleTransition,dossierTypeAllowed,finalTypeAllowed,availableLifecycleActions,type Dossier,type DossierVersion,type DossierEvent} from '../operations/document-lifecycle';
type Doc=DocumentRow&{current:number};
type Reading={document_id:string;id:string;status:string;result:string|null};
async function snapshot(bookingId:string,owner:string){
 await ownBooking(bookingId,owner);
 const booking=await db().prepare('SELECT data,control_epoch,evidence_revision FROM booking_handovers WHERE id=? AND owner=?').bind(bookingId,owner).first<{data:string;control_epoch:number;evidence_revision:number}>();
 const docs=(await db().prepare('SELECT d.*,NOT EXISTS(SELECT 1 FROM operation_documents n WHERE n.replaces_id=d.id) current FROM operation_documents d WHERE d.booking_id=? AND d.owner=? ORDER BY d.created_at,d.id').bind(bookingId,owner).all<Doc>()).results;
 const groups=(await db().prepare('SELECT * FROM document_dossiers WHERE booking_id=? AND owner=? ORDER BY created_at,id').bind(bookingId,owner).all<Dossier>()).results;
 const versions=(await db().prepare('SELECT v.* FROM document_dossier_versions v JOIN document_dossiers g ON g.id=v.dossier_id WHERE g.booking_id=? AND g.owner=? ORDER BY v.version DESC').bind(bookingId,owner).all<DossierVersion>()).results;
 const events=(await db().prepare('SELECT e.* FROM document_dossier_events e JOIN document_dossiers g ON g.id=e.dossier_id WHERE g.booking_id=? AND g.owner=? ORDER BY e.revision DESC').bind(bookingId,owner).all<DossierEvent>()).results;
 const readings=(await db().prepare('SELECT id,document_id,status,result FROM bill_control_readings WHERE booking_id=? AND owner=? ORDER BY rowid DESC').bind(bookingId,owner).all<Reading>()).results;
 const bookingReadings=(await db().prepare('SELECT e.id,e.document_id,e.status,e.result FROM booking_document_extractions e JOIN operation_documents d ON d.id=e.document_id WHERE d.booking_id=? AND d.owner=?').bind(bookingId,owner).all<Reading>()).results;
 const fingerprints:Record<string,string>={};for(const doc of docs)fingerprints[doc.id]=await digest(stableControl({hash:doc.hash,type:doc.type,reading:readings.find(r=>r.document_id===doc.id)||null,bookingReading:bookingReadings.find(r=>r.document_id===doc.id)||null}));
 const fingerprint=await digest(stableControl({docs:docs.map(d=>[d.id,d.hash,d.current]),fingerprints,groups,events}));
 return {booking:booking!,docs,groups,versions,events,readings,bookingReadings,fingerprints,fingerprint};
}
async function verifyFile(doc:Doc){const file=await runtime().BUCKET.get(doc.object_key);const bytes=file?await file.arrayBuffer():null;if(!bytes||await digest(bytes)!==doc.hash)throw new AppError('Belgenin aslı veya bütünlüğü doğrulanamadı.',409);return bytes;}
function approvalFor(s:Awaited<ReturnType<typeof snapshot>>,g:Dossier){
 const last=s.events.find(e=>e.dossier_id===g.id&&e.document_id===g.head_id&&['approved','rejected','review'].includes(e.action));
 return last?.action==='approved'&&last.fingerprint===s.fingerprints[g.head_id||'']?last:null;
}
function changesBetween(s:Awaited<ReturnType<typeof snapshot>>,before:string|null,after:string){
 const fields=(id:string|null)=>{const r=s.readings.find(r=>r.document_id===id)||s.bookingReadings.find(r=>r.document_id===id);if(r?.status!=='ready'||!r.result)return new Map<string,string>();const data=JSON.parse(r.result) as {fields?:{key:string;value:string|null}[]};return new Map((data.fields||[]).map(f=>[f.key,f.value||'']));};
 const old=fields(before),next=fields(after);
 if(!before)return [];
 return [...new Set([...old.keys(),...next.keys()])].filter(k=>old.get(k)!==next.get(k)).map(k=>({field:k,before:old.get(k)||'',after:next.get(k)||'',source:'Belge okumaları'}));
}
export async function documentLifecycleWorkspace(bookingId:string,owner:string){
 const s=await snapshot(bookingId,owner);
 return {reference:JSON.parse(s.booking.data).salesReference,fingerprint:s.fingerprint,documents:s.docs.map(d=>({id:d.id,type:d.type,filename:d.filename,current:!!d.current,createdAt:d.created_at,uploadedBy:d.owner,source:d.source_reference,seriesId:d.series_id})),
 dossiers:s.groups.map(g=>{const doc=s.docs.find(d=>d.id===g.head_id),approval=approvalFor(s,g),superseded=!!doc&&!doc.current;
 const read=s.readings.find(r=>r.document_id===g.head_id)||s.bookingReadings.find(r=>r.document_id===g.head_id);
 return {...g,approval,needsApproval:['approved','final','prealert'].includes(g.state)&&!approval,superseded,readingReady:read?.status==='ready',actions:superseded?[]:availableLifecycleActions(g.state),
 versions:s.versions.filter(v=>v.dossier_id===g.id).map(v=>({...v,changes:JSON.parse(v.changes) as {field:string;before:string;after:string;source:string}[],filename:s.docs.find(d=>d.id===v.document_id)?.filename||'',current:v.document_id===g.head_id&&!superseded,final:v.document_id===g.final_id&&!superseded&&!!approval})),events:s.events.filter(e=>e.dossier_id===g.id)};})};
}
export async function saveDocumentLifecycle(bookingId:string,owner:string,raw:unknown){
 const parsed=lifecycleSchema.safeParse(raw);if(!parsed.success)throw new AppError(parsed.error.issues[0]?.message||'Belge durumu geçersiz.');const input=parsed.data;
 const s=await snapshot(bookingId,owner),now=new Date().toISOString(),eventId=crypto.randomUUID();
 const busy=await db().prepare('SELECT r.id FROM bill_control_links l JOIN records r ON r.id=l.record_id WHERE l.booking_id=? AND l.owner=? AND r.lock_until>? LIMIT 1').bind(bookingId,owner,Date.now()).first();if(busy)throw new AppError('Bağlı konşimento işleniyor. Belge durumunu işlem sonrası değiştirin.',409);
 if(input.action==='create'){
  const id=crypto.randomUUID(),key=input.reference.normalize('NFKC').toUpperCase();
  if(s.groups.some(g=>g.family===input.family&&g.reference.normalize('NFKC').toUpperCase()===key))throw new AppError('Bu belge dosyası zaten var.',409);
  await db().batch([
   db().prepare("INSERT INTO document_dossiers(id,booking_id,owner,family,reference,reference_key,state,created_at,updated_at,last_event_id) VALUES(?,?,?,?,?,?,'waiting',?,?,?)").bind(id,bookingId,owner,input.family,input.reference,key,now,now,eventId),
   db().prepare("INSERT INTO document_dossier_events(id,dossier_id,document_id,revision,action,actor,party,event_at,evidence,evidence_document_id,reason,fingerprint,created_at) VALUES(?,?,NULL,0,'create',?,?,?,'',NULL,?,'',?)").bind(eventId,id,owner,owner,now,input.reason,now),
  ]);
  return documentLifecycleWorkspace(bookingId,owner);
 }
 const g=s.groups.find(g=>g.id===input.dossierId);if(!g)throw new AppError('Belge dosyası bulunamadı.',404);
 if(g.revision!==input.revision||s.fingerprint!==input.fingerprint)throw new AppError('Belge veya durum değişti. Listeyi yenileyin.',409);
 let documentId=g.head_id,state=g.state,finalId=g.final_id,party='',eventAt=now,evidence='',evidenceId:string|null=null,eventAction:string=input.action,eventFingerprint='';
 let newVersion:{number:number;changes:unknown[]}|null=null;
 if(input.action==='attach'){
  const doc=s.docs.find(d=>d.id===input.documentId&&d.current);if(!doc)throw new AppError('Yalnızca güncel arşiv belgesi sürüm olarak eklenebilir.',409);
  if(!dossierTypeAllowed(g.family,doc.type))throw new AppError('Belge türü dosyayla eşleşmiyor.',422);
  if(s.versions.some(v=>v.document_id===doc.id))throw new AppError('Belge zaten bir sürüm dosyasında.',409);
  // A replacement chain cannot be split between dossiers to bypass old-version protection.
  const chainOwner=s.versions.find(v=>s.docs.find(d=>d.id===v.document_id)?.series_id===doc.series_id&&v.dossier_id!==g.id);if(chainOwner)throw new AppError('Bu belge zinciri başka bir dosyaya bağlı.',409);
  if(!!input.cost!==!!input.currency)throw new AppError('Ücret ve para birimi birlikte girilmeli.',422);
  if(g.head_id&&!input.changes.length&&!changesBetween(s,g.head_id,doc.id).length)throw new AppError('Revizyonda değişen alanları ve eski/yeni değerleri belirtin. Değişiklik yoksa bunu açıklayan bir satır ekleyin.',422);
  await verifyFile(doc);documentId=doc.id;state=g.head_id?'revision_received':'received';finalId=null;party=input.sender;evidence=doc.source_reference;eventFingerprint=s.fingerprints[doc.id];
  newVersion={number:Math.max(0,...s.versions.filter(v=>v.dossier_id===g.id).map(v=>v.version))+1,changes:[...changesBetween(s,g.head_id,doc.id),...input.changes.map(c=>({...c,source:'Kullanıcı beyanı'}))]};
 }else{
  const doc=s.docs.find(d=>d.id===g.head_id&&d.current);if(!doc)throw new AppError('Belge eski sürüm veya eksik. Yeni sürümü dosyaya ekleyin.',409);
  if(Date.parse(input.eventAt)>Date.now()+60000)throw new AppError('İşlem zamanı gelecekte olamaz.',422);
  const last=s.events.find(e=>e.dossier_id===g.id&&e.document_id===g.head_id&&!['attach','replacement_uploaded'].includes(e.action));
  if(last&&Date.parse(input.eventAt)<Date.parse(last.event_at))throw new AppError('İşlem zamanı önceki durum kaydından önce olamaz.',422);
  if(input.evidenceDocumentId&&!s.docs.some(d=>d.id===input.evidenceDocumentId&&d.current))throw new AppError('Onay/gönderim kanıtı bu dosyanın güncel arşiv belgesi olmalı.',422);
  try{state=lifecycleTransition(g.state,input.to);}catch(e){throw new AppError((e as Error).message,422);}
  if(input.to==='extracted'){const read=s.readings.find(r=>r.document_id===doc.id)||s.bookingReadings.find(r=>r.document_id===doc.id);if(read?.status!=='ready')throw new AppError('Önce belgenin alanlarını okuyun.',422);}
  if(['final','prealert'].includes(input.to)&&!approvalFor(s,g))throw new AppError('Bu sürüme bağlı güncel onay kanıtı gerekli. Kontrole alıp yeniden onaylayın.',409);
  if(input.to==='final'){
   if(!finalTypeAllowed(g.family,doc.type))throw new AppError('Taslak türündeki dosya final seçilemez. Final belgeyi yeni sürüm olarak ekleyip onaylayın.',422);
   finalId=doc.id;
  }
  if(input.to==='prealert'&&g.final_id!==doc.id)throw new AppError('Pre-alert için tek güncel final sürüm seçilmeli.',409);
  if(['rejected','review'].includes(input.to))finalId=null;
  if(input.to==='sent'&&s.versions.filter(v=>v.dossier_id===g.id).length>1)state='resent';
  await verifyFile(doc);if(input.evidenceDocumentId)await verifyFile(s.docs.find(d=>d.id===input.evidenceDocumentId)!);
  party=input.party;eventAt=input.eventAt;evidence=input.evidence;evidenceId=input.evidenceDocumentId||null;eventAction=input.to;eventFingerprint=s.fingerprints[doc.id];
 }
 const revision=g.revision+1;
 const mutations=[db().prepare('UPDATE document_dossiers SET head_id=?,final_id=?,state=?,revision=?,updated_at=?,last_event_id=? WHERE id=? AND owner=? AND revision=? AND EXISTS(SELECT 1 FROM booking_handovers WHERE id=? AND owner=? AND control_epoch=? AND evidence_revision=?) AND NOT EXISTS(SELECT 1 FROM bill_control_links l JOIN records r ON r.id=l.record_id WHERE l.booking_id=document_dossiers.booking_id AND r.lock_until>?)').bind(documentId,finalId,state,revision,now,eventId,g.id,owner,g.revision,bookingId,owner,s.booking.control_epoch,s.booking.evidence_revision,Date.now())];
 const guard='EXISTS(SELECT 1 FROM document_dossiers WHERE id=? AND last_event_id=?)';
 if(input.action==='attach'&&newVersion)mutations.push(db().prepare('INSERT INTO document_dossier_versions(id,dossier_id,document_id,version,actor,sender,requested_by,changes,cost,currency,risk,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE '+guard).bind(crypto.randomUUID(),g.id,documentId,newVersion.number,owner,input.sender,input.requestedBy,JSON.stringify(newVersion.changes),input.cost,input.currency,input.risk,now,g.id,eventId));
 mutations.push(db().prepare('INSERT INTO document_dossier_events(id,dossier_id,document_id,revision,action,actor,party,event_at,evidence,evidence_document_id,reason,fingerprint,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE '+guard).bind(eventId,g.id,documentId,revision,eventAction,owner,party,eventAt,evidence,evidenceId,input.reason,eventFingerprint,now,g.id,eventId));
 const results=await db().batch(mutations);if(!results[0].meta.changes)throw new AppError('Belge eşzamanlı değişti. İşlem uygulanmadı.',409);
 return documentLifecycleWorkspace(bookingId,owner);
}
export async function assertLifecycleSelection(bookingId:string,owner:string,documentId:string,purpose:'customer'|'prealert'){
 const s=await snapshot(bookingId,owner),version=s.versions.find(v=>v.document_id===documentId),doc=s.docs.find(d=>d.id===documentId);
 if(!doc||!doc.current)throw new AppError('Eski sürüm gönderim veya pre-alert için kullanılamaz.',409);
 if(!version){if(s.versions.some(v=>s.docs.find(d=>d.id===v.document_id)?.series_id===doc.series_id))throw new AppError('Yeni revizyonu önce belge dosyasına ekleyip kontrol edin.',409);return;} // Preserve the established workflow of documents not enrolled in Phase 7.
 const g=s.groups.find(g=>g.id===version.dossier_id)!;
 if(g.head_id!==documentId)throw new AppError('Seçilen dosya belgenin son sürümü değil.',409);
 if(purpose==='prealert'&&(g.final_id!==documentId||!['final','prealert'].includes(g.state)||!approvalFor(s,g)))throw new AppError('Pre-alert için onaylı tek güncel final sürüm gerekli.',409);
 if(purpose==='customer'&&!['prepared','sent','resent','approved','final','prealert'].includes(g.state))throw new AppError('Belge henüz gönderime hazır değil.',409);
 if(purpose==='customer'&&['approved','final','prealert'].includes(g.state)&&!approvalFor(s,g))throw new AppError('Belge yeniden okunmuş; onayını yenileyin.',409);
 await verifyFile(doc);
 const approval=approvalFor(s,g);if(approval?.evidence_document_id){const proof=s.docs.find(d=>d.id===approval.evidence_document_id);if(!proof)throw new AppError('Onay kanıtı bulunamadı.',409);await verifyFile(proof);}
 const check=await db().prepare('SELECT revision FROM document_dossiers WHERE id=? AND owner=?').bind(g.id,owner).first<{revision:number}>();
 const head=await db().prepare('SELECT evidence_revision FROM booking_handovers WHERE id=? AND owner=?').bind(bookingId,owner).first<{evidence_revision:number}>();
 if(check?.revision!==g.revision||head?.evidence_revision!==s.booking.evidence_revision)throw new AppError('Gönderim seçimi sırasında belge değişti.',409);
}
export async function lifecycleDownload(bookingId:string,owner:string,documentId:string,purpose:'customer'|'prealert'){
 await assertLifecycleSelection(bookingId,owner,documentId,purpose);
 const doc=await db().prepare('SELECT * FROM operation_documents WHERE id=? AND booking_id=? AND owner=?').bind(documentId,bookingId,owner).first<Doc>();if(!doc)throw new AppError('Belge bulunamadı.',404);
 const bytes=await verifyFile(doc);await assertLifecycleSelection(bookingId,owner,documentId,purpose);
 return {bytes,mime:doc.mime,filename:doc.filename};
}
