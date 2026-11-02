import {AppError,db,digest,runtime} from './runtime';
import {controlState,controlIdle,assertControlFiles} from './control-state';
import {assessControl} from './control-assessment';
import {documentLifecycleWorkspace,assertLifecycleSelection} from './document-lifecycle';
import {exportVgm} from './vgm';
import {stableControl,type ControlKey} from '../operations/bill-control';
import {emptyPrealert,summaryLabels,prealertConfigSchema,prealertActionSchema,prealertConfigIssues,prealertText,prealertEml,type PrealertConfig} from '../operations/prealert';
type Settings={booking_id:string;owner:string;revision:number;source_fingerprint:string;data:string;status:string;latest_package_id:string|null;updated_at:string};
type Package={id:string;booking_id:string;owner:string;config_revision:number;fingerprint:string;snapshot:string;created_at:string};
type PackageSnapshot={reference:string;subject:string;body:string;config:PrealertConfig;documents:{id:string;filename:string;mime:string;hash:string;version:number;objectKey:string}[]};
async function context(id:string,owner:string){
 const state=await controlState(id,owner),assessment=assessControl(state),lifecycle=await documentLifecycleWorkspace(id,owner);
 const settings=await db().prepare('SELECT * FROM booking_prealerts WHERE booking_id=? AND owner=?').bind(id,owner).first<Settings>();
 const draft=JSON.parse(state.booking.data),defaults=emptyPrealert();
 const value=(key:ControlKey)=>{const row=assessment.rows.find(r=>r.key===key);return row?.present.find(p=>p.sourceId===row.decision?.choice)?.value||row?.present[0]?.value||'';};
 for(const key of ['bookingNumber','vessel','voyage','loadPort','dischargePort','packages','grossKg','description'] as const)defaults.summary[key]=value(key);
 defaults.summary.consignee=value('consigneeName');defaults.summary.agent=value('agent');defaults.summary.release=value('release')||value('blType');
 defaults.summary.containers=assessment.field?.containers.map(c=>{const row=assessment.containerRows?.find(r=>r.subject==='container:'+c.number.replace(/[\s-]/g,'').toUpperCase()+':seals');const seal=row?.present.find(p=>p.sourceId===row.decision?.choice)?.value||c.seal;return c.number+' / '+seal;}).join('\n')||'';
 for(const kind of ['etd','eta'] as const){const tasks=assessment.tasks.filter(t=>t.kind===kind&&t.status!=='cancelled');defaults.summary[kind]=tasks.length?tasks.map(t=>[t.date,t.time,t.zone].filter(Boolean).join(' ')).join(' / '):kind==='etd'?value('etd'):'';}
 const eligible=state.docs.filter(d=>d.current&&lifecycle.dossiers.some(g=>g.head_id===d.id&&!g.superseded&&!g.needsApproval&&g.versions.some(v=>v.document_id===d.id&&v.final)));
 defaults.documentIds=eligible.filter(d=>['hbl_final','mbl_final','sea_waybill'].includes(d.type)).map(d=>d.id);
 const config=settings?prealertConfigSchema.parse(JSON.parse(settings.data)):defaults;
 const sourceFingerprint=await digest(stableControl({source:state.fingerprint,decisions:state.decisions,lifecycle:lifecycle.fingerprint}));
 const fingerprint=await digest(stableControl({sourceFingerprint,config,revision:settings?.revision||0}));
 const selected=state.docs.filter(d=>config.documentIds.includes(d.id));
 const issues=prealertConfigIssues(config);
 const normalize=(s:string)=>s.normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
 for(const key of Object.keys(defaults.summary) as (keyof typeof defaults.summary)[])if(defaults.summary[key]&&normalize(config.summary[key])!==normalize(defaults.summary[key]))issues.push('Operasyon özeti kaynakla uyuşmuyor: '+summaryLabels[key]+'. Kaynağı düzeltin veya doğrulanmış değeri kullanın.');
 const reviewStale=!!settings&&settings.source_fingerprint!==sourceFingerprint;if(reviewStale)issues.push('Kaynaklar son kontrolden sonra değişti. Özeti, alıcıları ve ekleri yeniden kontrol edip kaydedin.');
 // Phase 7's exact-version final approval supersedes the old Phase 6 draft-to-final marker only for enrolled final attachments.
 const finalIds=eligible.map(d=>d.id);
 for(const b of assessment.blockers)if(!(b.subject.startsWith('final:')&&finalIds.includes(b.subject.slice(6))))issues.push(b.message);
 for(const type of ['hbl_final','master'])if(!selected.some(d=>type==='master'?['mbl_final','sea_waybill'].includes(d.type):d.type===type))issues.push(type==='master'?'Final MBL veya Sea Waybill gerekli.':'Final HBL gerekli.');
 for(const required of [...config.requiredTypes,...(config.vgmRequired?['vgm']:[])])if(!selected.some(d=>d.type===required))issues.push('Zorunlu ek eksik: '+required);
 for(const docId of config.documentIds){const doc=selected.find(d=>d.id===docId);if(!doc||!doc.current){issues.push('Seçilen ek eksik veya eski sürüm.');continue;}if(['hbl_draft','mbl_draft'].includes(doc.type))issues.push(doc.filename+': taslak eklenemez.');if(!finalIds.includes(docId))issues.push(doc.filename+': belge yönetiminde güncel ve onaylı final olarak seçilmeli.');}
 if(selected.reduce((n,d)=>n+d.size,0)>20*1024*1024)issues.push('E-posta paketindeki toplam ek boyutu 20 MB sınırını aşıyor.');
 if(config.vgmRequired||selected.some(d=>d.type==='vgm')){try{await exportVgm(id,owner);}catch(e){issues.push(e instanceof AppError?e.message:'VGM onayları doğrulanamadı.');}}
 return {state,assessment,lifecycle,settings,config,fingerprint,sourceFingerprint,reviewStale,issues:[...new Set(issues)],selected,reference:String(draft.salesReference),defaults};
}
export async function prealertWorkspace(id:string,owner:string){const c=await context(id,owner);const packages=(await db().prepare('SELECT * FROM prealert_packages WHERE booking_id=? AND owner=? ORDER BY rowid DESC').bind(id,owner).all<Package>()).results;const dispatches=(await db().prepare('SELECT id,owner,package_id,sent_at,channel,evidence,created_at,snapshot FROM prealert_dispatches WHERE booking_id=? AND owner=? ORDER BY rowid DESC').bind(id,owner).all<{id:string;owner:string;package_id:string;sent_at:string;channel:string;evidence:string;created_at:string;snapshot:string}>()).results;
 return {reference:c.reference,revision:c.settings?.revision||0,config:c.reviewStale?{...c.config,checks:[]}:c.config,reviewStale:c.reviewStale,sourceSummary:c.defaults.summary,fingerprint:c.fingerprint,issues:c.issues,status:c.settings?.status==='sent'&&!c.issues.length&&packages[0]?.fingerprint===c.fingerprint?'sent':packages[0]?.fingerprint===c.fingerprint&&!c.issues.length?'prepared':c.settings?'review':'draft',documents:c.state.docs.map(d=>({id:d.id,filename:d.filename,type:d.type,current:!!d.current,final:c.lifecycle.dossiers.some(g=>g.versions.some(v=>v.document_id===d.id&&v.final)),size:d.size})),packages:packages.map(p=>{const s=JSON.parse(p.snapshot) as PackageSnapshot;return {id:p.id,createdAt:p.created_at,stale:p.fingerprint!==c.fingerprint,subject:s.subject,body:s.body,to:s.config.to,cc:s.config.cc,documents:s.documents.map(d=>({id:d.id,filename:d.filename,version:d.version})),dispatch:dispatches.find(d=>d.package_id===p.id)||null};}),dispatches:dispatches.map(d=>({...d,snapshot:JSON.parse(d.snapshot) as {to:string[];cc:string[];documents:{id:string;filename:string;hash:string}[]}}))};
}
async function verify(c:Awaited<ReturnType<typeof context>>,id:string,owner:string){if(c.issues.length)throw new AppError(c.issues.join('\n'),422);for(const d of c.selected)await assertLifecycleSelection(id,owner,d.id,'prealert');await assertControlFiles(c.state.docs.filter(d=>!c.assessment.excluded.includes('document:'+d.id)));}
export async function savePrealert(id:string,owner:string,raw:unknown){const p=prealertActionSchema.safeParse(raw);if(!p.success)throw new AppError(p.error.issues[0]?.message||'Pre-alert bilgileri geçersiz.');const v=p.data,c=await context(id,owner),now=new Date().toISOString();await controlIdle(id,owner);
 if(v.action==='save'){
  if(v.revision!==(c.settings?.revision||0))throw new AppError('Hazırlık başka bir işlemde değişti; yenileyin.',409);
  const result=await db().prepare("INSERT INTO booking_prealerts(booking_id,owner,revision,source_fingerprint,data,status,updated_at) SELECT ?,?,1,?,?,'draft',? WHERE ?=0 AND EXISTS(SELECT 1 FROM booking_handovers WHERE id=? AND control_epoch=?) ON CONFLICT(booking_id) DO NOTHING").bind(id,owner,c.sourceFingerprint,JSON.stringify(v.data),now,v.revision,id,c.state.booking.control_epoch).run();
  if(v.revision>0){const updated=await db().prepare("UPDATE booking_prealerts SET revision=revision+1,source_fingerprint=?,data=?,status='draft',updated_at=? WHERE booking_id=? AND owner=? AND revision=? AND EXISTS(SELECT 1 FROM booking_handovers WHERE id=? AND control_epoch=?)").bind(c.sourceFingerprint,JSON.stringify(v.data),now,id,owner,v.revision,id,c.state.booking.control_epoch).run();if(!updated.meta.changes)throw new AppError('Hazırlık eşzamanlı değişti.',409);}else if(!result.meta.changes)throw new AppError('Hazırlık eşzamanlı oluşturuldu.',409);
 }else{
  if(v.fingerprint!==c.fingerprint)throw new AppError('Kaynak, belge veya alıcılar değişti. Paketi yeniden hazırlayın.',409);await verify(c,id,owner);
  const again=await context(id,owner);if(again.fingerprint!==c.fingerprint)throw new AppError('Paket doğrulanırken kaynak değişti.',409);
  const guard='EXISTS(SELECT 1 FROM booking_handovers WHERE id=? AND owner=? AND control_epoch=?) AND EXISTS(SELECT 1 FROM booking_prealerts WHERE booking_id=? AND owner=? AND revision=?) AND NOT EXISTS(SELECT 1 FROM bill_control_links l JOIN records r ON r.id=l.record_id WHERE l.booking_id=? AND r.lock_until>?)';
  const args=[id,owner,c.state.booking.control_epoch,id,owner,c.settings?.revision||0,id,Date.now()];
  if(v.action==='prepare'){
   if(v.revision!==c.settings?.revision)throw new AppError('Hazırlığı önce kaydedin.',409);
   const existing=await db().prepare('SELECT id FROM prealert_packages WHERE booking_id=? AND owner=? AND config_revision=? AND fingerprint=?').bind(id,owner,v.revision,c.fingerprint).first<{id:string}>();
   if(existing)return prealertWorkspace(id,owner);
   const packageId=crypto.randomUUID(),subject='PRE-ALERT | '+c.reference+' | '+c.config.summary.vessel;
   const snapshot:PackageSnapshot={reference:c.reference,subject,body:prealertText(c.reference,c.config,c.selected),config:c.config,documents:c.selected.map(d=>({id:d.id,filename:d.filename,mime:d.mime,hash:d.hash,version:d.version,objectKey:d.object_key}))};
   const results=await db().batch([db().prepare('INSERT INTO prealert_packages(id,booking_id,owner,config_revision,fingerprint,snapshot,created_at) SELECT ?,?,?,?,?,?,? WHERE '+guard).bind(packageId,id,owner,v.revision,c.fingerprint,JSON.stringify(snapshot),now,...args),db().prepare("UPDATE booking_prealerts SET latest_package_id=?,status='prepared',updated_at=? WHERE booking_id=? AND owner=? AND EXISTS(SELECT 1 FROM prealert_packages WHERE id=?)").bind(packageId,now,id,owner,packageId)]);if(!results[0].meta.changes)throw new AppError('Kaynaklar değişti; paket oluşturulmadı.',409);
  }else{
   const pack=await db().prepare('SELECT * FROM prealert_packages WHERE id=? AND booking_id=? AND owner=?').bind(v.packageId,id,owner).first<Package>();if(!pack||pack.fingerprint!==c.fingerprint||pack.id!==c.settings?.latest_package_id)throw new AppError('Yalnızca güncel paket için gönderim kaydedilebilir.',409);
   if(Date.parse(v.sentAt)<Date.parse(pack.created_at)||Date.parse(v.sentAt)>Date.now()+60000)throw new AppError('Gönderim zamanı paket oluşturulmasından sonra ve gelecekte olmayacak şekilde girilmeli.',422);
   if(await db().prepare('SELECT id FROM prealert_dispatches WHERE package_id=?').bind(pack.id).first())throw new AppError('Bu paketin gönderim kaydı zaten var.',409);
   const snapshot=JSON.parse(pack.snapshot) as PackageSnapshot,eventId=crypto.randomUUID();
   const results=await db().batch([db().prepare('INSERT INTO prealert_dispatches(id,package_id,booking_id,owner,sent_at,channel,evidence,snapshot,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE '+guard).bind(eventId,pack.id,id,owner,v.sentAt,v.channel,v.evidence,JSON.stringify({to:snapshot.config.to,cc:snapshot.config.cc,documents:snapshot.documents.map(d=>({id:d.id,filename:d.filename,hash:d.hash}))}),now,...args),db().prepare("UPDATE booking_prealerts SET status='sent',updated_at=? WHERE booking_id=? AND owner=? AND EXISTS(SELECT 1 FROM prealert_dispatches WHERE id=?)").bind(now,id,owner,eventId)]);if(!results[0].meta.changes)throw new AppError('Kaynaklar değişti; gönderim kaydedilmedi.',409);
  }
 }
 return prealertWorkspace(id,owner);
}
export async function downloadPrealert(id:string,owner:string,packageId:string){const c=await context(id,owner);const pack=await db().prepare('SELECT * FROM prealert_packages WHERE id=? AND booking_id=? AND owner=?').bind(packageId,id,owner).first<Package>();if(!pack)throw new AppError('Paket bulunamadı.',404);if(pack.fingerprint!==c.fingerprint||pack.id!==c.settings?.latest_package_id)throw new AppError('Eski paket indirilemez; güncel kaynaklarla yeniden hazırlayın.',409);await verify(c,id,owner);const snapshot=JSON.parse(pack.snapshot) as PackageSnapshot;
 const attachments=[];for(const d of snapshot.documents){const file=await runtime().BUCKET.get(d.objectKey);if(!file)throw new AppError('Paket eki bulunamadı.',409);const bytes=await file.arrayBuffer();if(await digest(bytes)!==d.hash)throw new AppError('Paket eki değişmiş.',409);attachments.push({filename:d.filename,mime:d.mime,bytes:new Uint8Array(bytes)});}
 const after=await context(id,owner);if(after.fingerprint!==c.fingerprint||after.issues.length)throw new AppError('İndirme sırasında kaynaklar değişti.',409);
 return prealertEml(pack.id,snapshot.subject,snapshot.body,snapshot.config.to,snapshot.config.cc,attachments);
}
