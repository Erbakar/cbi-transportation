import {assertLifecycleSelection} from './document-lifecycle';
import {AppError,db,digest} from './runtime';
import {controlState,assertControlFiles,controlIdle} from './control-state';
import {assessControl,controlDocumentTypes} from './control-assessment';
import {readControlDocument} from './control-extraction';
import {controlActionSchema,flattenControlPayload,controlPlanIssues} from '../operations/control-review';
import {stableControl} from '../operations/bill-control';
import {owned} from './records';
import {vgmWorkspace} from './vgm';
export async function billControlWorkspace(id:string,owner:string){
 const state=await controlState(id,owner),assessment=assessControl(state);
 const requests=(await db().prepare('SELECT * FROM bill_control_requests WHERE booking_id=? AND owner=? ORDER BY rowid DESC LIMIT 50').bind(id,owner).all<{id:string;record_id:string;kind:string;payload:string;payload_hash:string;fingerprint:string;created_at:string}>()).results;
 const approvals=(await db().prepare('SELECT a.* FROM bill_control_approvals a JOIN bill_control_requests r ON r.id=a.request_id WHERE r.booking_id=? AND a.owner=? ORDER BY a.rowid DESC').bind(id,owner).all<{id:string;request_id:string;decision_hash:string;reason:string;owner:string;created_at:string;revoked_at:string|null;revocation_reason:string|null}>()).results;
 const records=(await db().prepare("SELECT id,filename FROM records WHERE owner=? AND status<>'deleted' AND id NOT IN (SELECT record_id FROM bill_control_links) ORDER BY created_at DESC LIMIT 100").bind(owner).all<{id:string;filename:string}>()).results;
 const vg=await vgmWorkspace(id,owner),seen=new Set<string>();
 const decisionHash=await digest(stableControl(state.decisions.filter(d=>d.fingerprint===state.fingerprint)));
 return {reference:JSON.parse(state.booking.data).salesReference,...assessment,fingerprint:state.fingerprint,documents:state.docs.map(d=>({id:d.id,type:d.type,filename:d.filename,current:!!d.current,version:d.version})),readings:state.readings.map(r=>({id:r.id,documentId:r.document_id,status:r.status,error:r.error})),decisions:state.decisions,events:state.events,links:state.links.map(r=>({id:r.id,filename:r.filename})),records,approvalHistory:approvals,
 requests:requests.map(r=>({...r,payload:undefined,fields:flattenControlPayload(JSON.parse(r.payload)),stale:r.fingerprint!==state.fingerprint,planIssues:controlPlanIssues(r.kind,JSON.parse(r.payload),assessment.field),approval:approvals.find(a=>a.request_id===r.id),decisionStale:approvals.find(a=>a.request_id===r.id)?.decision_hash!==decisionHash})),
 vgmSources:vg.approvals.filter(a=>{if(seen.has(a.container_number))return false;seen.add(a.container_number);return !a.revoked_at&&!a.stale;}).map(a=>({number:a.container_number,...a.snapshot.values})),documentCount:state.docs.filter(d=>d.current).length};
}
export async function saveControl(id:string,owner:string,raw:unknown){
 const parsed=controlActionSchema.safeParse(raw);if(!parsed.success)throw new AppError(parsed.error.issues[0]?.message||'Kontrol bilgileri geçersiz.');const v=parsed.data;
 const state=await controlState(id,owner);await controlIdle(id,owner);
 const now=new Date().toISOString(),guard='EXISTS(SELECT 1 FROM booking_handovers WHERE id=? AND owner=? AND control_epoch=?)';
 async function insert(sql:string,args:unknown[]){const result=await db().prepare(sql+' WHERE '+guard).bind(...args,id,owner,state.booking.control_epoch).run();if(!result.meta.changes)throw new AppError('Kaynaklar eşzamanlı değişti. Yenileyin.',409);}
 if(v.action==='read'){
  const doc=state.docs.find(d=>d.id===v.documentId&&d.current&&controlDocumentTypes.includes(d.type));if(!doc)throw new AppError('Güncel kontrol belgesi bulunamadı.',404);
  await db().prepare("UPDATE bill_control_readings SET status='failed',error='Okuma süresi doldu.' WHERE document_id=? AND owner=? AND status='reading' AND lease_until<?").bind(doc.id,owner,Date.now()).run();
  const run=crypto.randomUUID();try{await db().prepare("INSERT INTO bill_control_readings(id,booking_id,owner,document_id,document_hash,status,lease_until,created_at) VALUES(?,?,?,?,?,'reading',?,?)").bind(run,id,owner,doc.id,doc.hash,Date.now()+180000,now).run();}catch{throw new AppError('Belge halen okunuyor.',409);}
  try{const result=await readControlDocument(doc);const saved=await db().prepare("UPDATE bill_control_readings SET status='ready',result=?,lease_until=0 WHERE id=? AND status='reading' AND lease_until>=?").bind(JSON.stringify(result),run,Date.now()).run();if(!saved.meta.changes)throw new AppError('Okuma kilidi değişti.',409);}catch(e){await db().prepare("UPDATE bill_control_readings SET status='failed',error=? WHERE id=? AND status='reading'").bind(e instanceof AppError?e.message:'Belge okunamadı.',run).run();throw e;}
 }else if(v.action==='link'){
  const r=await owned(v.recordId,owner),field=assessControl(state).field,manual=r.manual?JSON.parse(r.manual):{};
  if(r.lock_until>Date.now())throw new AppError('Konşimento işleniyor.',409);
  const reference=String(manual.tmaxxReference||'').trim().toUpperCase();
  if(!field||![field.reference,field.goodReference].some(x=>x.trim().toUpperCase()===reference))throw new AppError('Konşimento pozisyon referansı bu booking kaydının T-MAXX kaynağıyla aynı olmalı.',422);
  if(!r.extraction)throw new AppError('Önce konşimento talimatını okuyup kontrol edin.',422);
  const ex=JSON.parse(r.extraction),numbers=(ex.containers||[]).map((c:{containerNumber?:{value?:string}})=>String(c.containerNumber?.value||'').replace(/[\s-]/g,'').toUpperCase());
  if(!numbers.length||numbers.some((n:string)=>!field.containers.some(c=>c.number.replace(/[\s-]/g,'').toUpperCase()===n)))throw new AppError('Konşimento konteynerleri seçilen pozisyon yüküyle eşleşmiyor.',422);
  const existing=await db().prepare('SELECT record_id FROM bill_control_links WHERE record_id=?').bind(r.id).first();if(existing)throw new AppError('Konşimento zaten bir kontrol dosyasına bağlı.',409);
  const linked=await db().prepare('INSERT INTO bill_control_links(record_id,booking_id,owner,reason,created_at) SELECT ?,?,?,?,? WHERE '+guard+' AND EXISTS(SELECT 1 FROM records WHERE id=? AND owner=? AND lock_until<=? AND revision=? AND manual IS ? AND extraction IS ? AND status<>\'deleted\')').bind(r.id,id,owner,v.reason,now,id,owner,state.booking.control_epoch,r.id,owner,Date.now(),r.revision,r.manual,r.extraction).run();
  if(!linked.meta.changes)throw new AppError('Konşimento veya kaynaklar değişti. Bağlantı kurulmadı.',409);
 }else if(v.action==='revoke'){
  const changed=await db().prepare('UPDATE bill_control_approvals SET revoked_at=?,revocation_reason=? WHERE id=? AND owner=? AND revoked_at IS NULL AND request_id IN(SELECT id FROM bill_control_requests WHERE booking_id=? AND owner=?)').bind(now,v.reason,v.approvalId,owner,id,owner).run();if(!changed.meta.changes)throw new AppError('Aktif onay bulunamadı.',404);
 }else{
  if(v.fingerprint!==state.fingerprint)throw new AppError('Kaynaklar değişti. Kontrolü yenileyin.',409);
  const assessment=assessControl(state);
  if(v.action==='decision'){
   const doc=state.docs.find(d=>'document:'+d.id===v.subject&&d.current);
   if(v.mode==='exclude'||v.mode==='restore'){if(!doc)throw new AppError('Güncel belge seçilmeli.',422);}
   else if(v.subject.startsWith('container:')){
    const row=assessment.containerRows.find(r=>r.subject===v.subject);if(!row||row.level!=='review'||v.mode!=='accept'||!row.present.some(p=>p.sourceId===v.choice))throw new AppError('Geçerli konteyner farkı ve kaynak seçilmeli.',422);
   }else if(v.subject.startsWith('field:')){
    const row=assessment.rows.find(r=>'field:'+r.key===v.subject);
    if(!row||row.level!=='review'||!assessment.sources.find(s=>s.id===v.choice)?.values[row.key])throw new AppError('Onaylanabilir alan farkı ve kaynak seçilmeli. Kritik farklar kaynağında düzeltilmeli.',422);
    if(v.mode==='exception'&&!['shipper','consigneeName','freightPayment'].includes(row.key))throw new AppError('Bu alana taraf/navlun istisnası uygulanamaz.',422);
   }else if(!assessment.blockers.some(b=>b.subject===v.subject&&!b.critical)||v.mode!=='accept')throw new AppError('Onaylanabilir okuma uyarısı bulunamadı.',422);
   await insert('INSERT INTO bill_control_decisions(id,booking_id,owner,fingerprint,subject,action,choice,reason,created_at) SELECT ?,?,?,?,?,?,?,?,?',[crypto.randomUUID(),id,owner,state.fingerprint,v.subject,v.mode,v.choice,v.reason,now]);
  }else if(v.action==='document'){
   const doc=state.docs.find(d=>d.id===v.documentId&&d.current);if(!doc)throw new AppError('Belge güncel değil.',409);
   if(v.kind==='draft_approved'){
    if(!['hbl_draft','mbl_draft'].includes(doc.type)||assessment.blockers.some(b=>!b.subject.startsWith('final:')))throw new AppError('Önce taslağın kaynak ve fark kontrollerini tamamlayın.',422);
   }else if(v.kind==='final_verified'){
    const expected=doc.type==='hbl_final'?'hbl_draft':['mbl_final','sea_waybill'].includes(doc.type)?'mbl_draft':'';
    const draft=state.docs.find(d=>d.id===v.relatedId&&d.current&&d.type===expected);
    if(!draft||!state.events.some(e=>e.document_id===draft.id&&e.kind==='draft_approved'))throw new AppError('Güncel ve onaylı ilgili taslak gerekli.',422);
    if(assessment.blockers.some(b=>!b.subject.startsWith('final:')))throw new AppError('Önce kaynak/fark kontrollerini tamamlayın.',422);
   }else{
    const task=assessment.tasks.find(t=>t.id===v.relatedId&&t.requiredDocument===doc.type&&t.status!=='cancelled');if(!task)throw new AppError('Belgeyle eşleşen teslim görevi seçilmeli.',422);
   }
   await assertControlFiles([doc]);
   await insert('INSERT INTO bill_control_document_events(id,booking_id,owner,document_id,kind,related_id,reason,created_at) SELECT ?,?,?,?,?,?,?,?',[crypto.randomUUID(),id,owner,doc.id,v.kind,v.relatedId,v.reason,now]);
  }else if(v.action==='approve'){
   if(assessment.blockers.length)throw new AppError(assessment.blockers.map(b=>b.message).join('\n'),422);
   const request=await db().prepare('SELECT id,kind,payload FROM bill_control_requests WHERE id=? AND booking_id=? AND owner=? AND fingerprint=?').bind(v.requestId,id,owner,state.fingerprint).first<{id:string;kind:string;payload:string}>();if(!request)throw new AppError('Aktarım planı değişti. Konşimento ekranında yeniden hazırlayın.',409);
   const planIssues=controlPlanIssues(request.kind,JSON.parse(request.payload),assessment.field);if(planIssues.length)throw new AppError(planIssues.join(' '),422);
   await assertControlFiles(state.docs.filter(d=>!assessment.excluded.includes('document:'+d.id)));
   const decisionHash=await digest(stableControl(state.decisions.filter(d=>d.fingerprint===state.fingerprint)));
   await insert('INSERT INTO bill_control_approvals(id,request_id,decision_hash,owner,reason,created_at) SELECT ?,?,?,?,?,?',[crypto.randomUUID(),v.requestId,decisionHash,owner,v.reason,now]);
  }
 }
 return billControlWorkspace(id,owner);
}
export async function prealertManifest(id:string,owner:string){
 const state=await controlState(id,owner),assessment=assessControl(state);
 if(assessment.blockers.length)throw new AppError('Pre-alert için kaynak ve onay kontrolleri tamamlanmalı.',422);
 const finals=state.docs.filter(d=>d.current&&['hbl_final','mbl_final','sea_waybill'].includes(d.type)&&!assessment.excluded.includes('document:'+d.id));
 if(!finals.length)throw new AppError('Onaylı güncel final belge gerekli.',422);
 for(const doc of finals)await assertLifecycleSelection(id,owner,doc.id,'prealert');
 await assertControlFiles(finals);const after=await controlState(id,owner);if(after.booking.control_epoch!==state.booking.control_epoch)throw new AppError('Belgeler değişti.',409);
 return {reference:JSON.parse(state.booking.data).salesReference,generatedAt:new Date().toISOString(),sent:false,documents:finals.map(d=>({id:d.id,filename:d.filename,version:d.version,sha256:d.hash,url:'/api/bookings/'+id+'/lifecycle/'+d.id+'?purpose=prealert'}))};
}
