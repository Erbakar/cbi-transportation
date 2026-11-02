import { AppError,db,digest,runtime } from './runtime';
import { ownBooking,type DocumentRow } from './operation-documents';
import { readVgmFile } from './vgm-extraction';
import { vgmActionSchema,vgmReadingSchema,vgmCheck,readingWarnings,grams,kgSchema,type VgmReading,type VgmValues } from '../operations/vgm';
import { zonedInstant } from '../operations/schedule';
import type { FieldData,FieldSource } from '../operations/field-operation';
const key=(v:string)=>v.replace(/[\s-]/g,'').toUpperCase();
type Reading={id:string;document_id:string;document_hash:string;status:string;result:string|null;error:string|null;created_at:string};
type Approval={id:string;container_number:string;reading_id:string;fingerprint:string;snapshot:string;reason:string;created_at:string;revoked_at:string|null;revocation_reason:string|null};
export type VgmSnapshot={values:VgmValues;check:ReturnType<typeof vgmCheck>;documentId:string;documentHash:string;filename:string;rowIndex:number;reading:VgmReading['rows'][number];warnings:string[];position:{reference:string;positionId:number;goodId:number;goodReference:string};approvedAt:string;approvedBy:string};
async function sourceFile(id:string,owner:string,documentId:string){
 const doc=await db().prepare("SELECT * FROM operation_documents d WHERE d.id=? AND d.booking_id=? AND d.owner=? AND d.type='vgm' AND NOT EXISTS(SELECT 1 FROM operation_documents newer WHERE newer.replaces_id=d.id)").bind(documentId,id,owner).first<DocumentRow>();
 if(!doc)throw new AppError('Güncel VGM belgesi bulunamadı.',409);
 const file=await runtime().BUCKET.get(doc.object_key);
 if(!file||await digest(await file.arrayBuffer())!==doc.hash)throw new AppError('VGM belgesinin aslı / bütünlüğü doğrulanamadı.',409);
 return doc;
}
export async function vgmWorkspace(id:string,owner:string){
 await ownBooking(id,owner);
 const b=await db().prepare('SELECT data,revision,evidence_revision FROM booking_handovers WHERE id=? AND owner=?').bind(id,owner).first<{data:string;revision:number;evidence_revision:number}>();
 const f=await db().prepare('SELECT data,source,revision FROM booking_field_operations WHERE booking_id=? AND owner=?').bind(id,owner).first<{data:string;source:string|null;revision:number}>();
 const source:FieldSource|null=f?.source?JSON.parse(f.source):null,field:FieldData|null=f?JSON.parse(f.data):null;
 const versions={bookingRevision:b!.revision,evidenceRevision:b!.evidence_revision,fieldRevision:f?.revision||0};
 const fingerprint=await digest(JSON.stringify({versions,booking:b!.data,field:f?.data||null,source:f?.source||null}));
 const documents=(await db().prepare("SELECT d.id,d.filename,d.hash,NOT EXISTS(SELECT 1 FROM operation_documents n WHERE n.replaces_id=d.id) current FROM operation_documents d WHERE d.booking_id=? AND d.owner=? AND d.type='vgm' ORDER BY d.created_at DESC").bind(id,owner).all<{id:string;filename:string;hash:string;current:number}>()).results;
 const readings=(await db().prepare('SELECT id,document_id,document_hash,status,result,error,created_at FROM booking_vgm_readings WHERE booking_id=? AND owner=? ORDER BY rowid DESC LIMIT 100').bind(id,owner).all<Reading>()).results.map(r=>({...r,result:r.result?vgmReadingSchema.parse(JSON.parse(r.result)):null}));
 const approvals=(await db().prepare('SELECT * FROM booking_vgm_approvals WHERE booking_id=? AND owner=? ORDER BY rowid DESC LIMIT 200').bind(id,owner).all<Approval>()).results.map(a=>({...a,snapshot:JSON.parse(a.snapshot) as VgmSnapshot,stale:a.fingerprint!==fingerprint}));
 return {...versions,fingerprint,reference:JSON.parse(b!.data).salesReference,source,containers:field?.containers.filter(c=>!c.cancelled)||[],documents,readings,approvals};
}
export async function saveVgm(id:string,owner:string,raw:unknown){
 const parsed=vgmActionSchema.safeParse(raw);if(!parsed.success)throw new AppError(parsed.error.issues[0]?.message||'VGM bilgileri geçersiz.');
 const v=parsed.data;await ownBooking(id,owner);
 if(v.action==='read'){
  const doc=await sourceFile(id,owner,v.documentId),run=crypto.randomUUID(),now=Date.now();
  await db().prepare("UPDATE booking_vgm_readings SET status='failed',error='Okuma süresi doldu.',lease_until=0 WHERE document_id=? AND owner=? AND status='reading' AND lease_until<?").bind(doc.id,owner,now).run();
  try{await db().prepare("INSERT INTO booking_vgm_readings(id,booking_id,owner,document_id,document_hash,status,lease_until,created_at) VALUES(?,?,?,?,?,'reading',?,?)").bind(run,id,owner,doc.id,doc.hash,now+180000,new Date().toISOString()).run();}
  catch{throw new AppError('Belge halen okunuyor. Biraz sonra yenileyin.',409);}
  try{
   const result=await readVgmFile(doc);
   const saved=await db().prepare("UPDATE booking_vgm_readings SET status='ready',result=?,lease_until=0 WHERE id=? AND owner=? AND status='reading' AND lease_until>=?").bind(JSON.stringify(result),run,owner,Date.now()).run();
   if(!saved.meta.changes)throw new AppError('Okuma kilidi değişti. Yeniden okuyun.',409);
  }catch(e){await db().prepare("UPDATE booking_vgm_readings SET status='failed',error=?,lease_until=0 WHERE id=? AND owner=? AND status='reading'").bind(e instanceof AppError?e.message:'Belge okunamadı.',run,owner).run();throw e;}
  return vgmWorkspace(id,owner);
 }
 if(v.action==='revoke'){
  const r=await db().prepare('UPDATE booking_vgm_approvals SET revoked_at=?,revocation_reason=? WHERE id=? AND booking_id=? AND owner=? AND revoked_at IS NULL').bind(new Date().toISOString(),v.reason,v.approvalId,id,owner).run();
  if(!r.meta.changes)throw new AppError('Aktif onay bulunamadı.',409);
  return vgmWorkspace(id,owner);
 }
 const w=await vgmWorkspace(id,owner);
 if(v.fingerprint!==w.fingerprint)throw new AppError('Kaynaklar değişti. Güncel kontrolü açın.',409);
 const run=w.readings.find(r=>r.id===v.readingId);
 if(!run||run.status!=='ready'||!run.result||run.result.documentType!=='vgm')throw new AppError('Tamamlanmış VGM okuması gerekli.',409);
 const latest=w.readings.find(r=>r.document_id===run.document_id);
 if(latest?.id!==run.id)throw new AppError('Belge yeniden okunmuş. Son okumayı kontrol edin.',409);
 const proof=run.result.rows[v.rowIndex];if(!proof)throw new AppError('Okunan konteyner satırı bulunamadı.');
 const doc=await sourceFile(id,owner,run.document_id);
 if(doc.hash!==run.document_hash)throw new AppError('Belge sürümü değişti.',409);
 const number=key(v.values.containerNumber),matches=w.containers.filter(c=>key(c.number)===number),sourceMatches=w.source?.containers.filter(c=>key(c.number)===number)||[],container=matches[0],sourceContainer=sourceMatches[0];
 if(matches.length>1||sourceMatches.length>1)throw new AppError('Konteyner eşleşmesi tekil değil; pozisyonu kontrol edin.',422);
 if(!container||!sourceContainer||!w.source)throw new AppError('Konteyner aktif saha kaydı ve T-MAXX pozisyon kaynağıyla eşleşmeli.',422);
 if(proof.containerNumber.value&&key(proof.containerNumber.value)!==number)throw new AppError('Belgeden okunan konteyner seçilen konteynerle eşleşmiyor. Belgeyi düzeltip yeniden okuyun.',422);
 if(!proof.containerNumber.value)throw new AppError('Belgede konteyner numarası okunamadı. Daha okunaklı belge yükleyin.',422);
 if(sourceContainer.cargoGrossKg&&!kgSchema.safeParse(sourceContainer.cargoGrossKg).success)throw new AppError('T-MAXX yük ağırlığının birimi ve hassasiyeti kontrol edilmeli.',422);
 if(sourceContainer.cargoGrossKg&&grams(sourceContainer.cargoGrossKg)!==grams(v.values.referenceCargoKg))throw new AppError('Referans yük ağırlığı T-MAXX kaynak ağırlığıyla aynı olmalı. Kaynak değiştiyse önce yeniden okuyun.',422);
 if(zonedInstant(v.values.weighedAt.slice(0,10),v.values.weighedAt.slice(11),v.values.zone)>Date.now()+60000)throw new AppError('Tartım zamanı gelecekte olamaz.');
 const check=vgmCheck(v.values);if(check.errors.length)throw new AppError(check.errors.join(' '),422);
 const snapshot:VgmSnapshot={values:{...v.values,containerNumber:number},check,documentId:doc.id,documentHash:doc.hash,filename:doc.filename,rowIndex:v.rowIndex,reading:proof,warnings:readingWarnings(proof),position:{reference:w.source.reference,positionId:w.source.positionId,goodId:w.source.goodId,goodReference:w.source.goodReference},approvedAt:new Date().toISOString(),approvedBy:owner};
 const guard='EXISTS(SELECT 1 FROM booking_handovers WHERE id=? AND owner=? AND revision=? AND evidence_revision=?) AND EXISTS(SELECT 1 FROM booking_field_operations WHERE booking_id=? AND owner=? AND revision=?)';
 const saved=await db().prepare('INSERT INTO booking_vgm_approvals(id,booking_id,owner,container_number,reading_id,fingerprint,snapshot,reason,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE '+guard).bind(crypto.randomUUID(),id,owner,number,run.id,w.fingerprint,JSON.stringify(snapshot),v.reason,snapshot.approvedAt,id,owner,w.bookingRevision,w.evidenceRevision,id,owner,w.fieldRevision).run();
 if(!saved.meta.changes)throw new AppError('Kaynaklar eşzamanlı değişti. Onay verilmedi.',409);
 return vgmWorkspace(id,owner);
}
export async function exportVgm(id:string,owner:string){
 const w=await vgmWorkspace(id,owner),seen=new Set<string>();
 // Only the latest decision per container can be exported. Revoking it cannot revive an older approval.
 const latest=w.approvals.filter(a=>{if(seen.has(a.container_number))return false;seen.add(a.container_number);return true;});
 const approved=latest.filter(a=>!a.revoked_at&&!a.stale);
 if(w.containers.some(c=>!approved.some(a=>a.container_number===key(c.number))))throw new AppError('Her aktif konteyner için güncel VGM onayı gerekli.',409);
 if(!approved.length)throw new AppError('Güncel, geçerli VGM onayı yok.',409);
 for(const a of approved)await sourceFile(id,owner,a.snapshot.documentId);
 const after=await vgmWorkspace(id,owner);
 if(after.fingerprint!==w.fingerprint||approved.some(a=>after.approvals.find(n=>n.container_number===a.container_number)?.id!==a.id||!!after.approvals.find(n=>n.id===a.id)?.revoked_at))throw new AppError('Onay veya kaynaklar değişti. Yenileyin.',409);
 return {schema:'cbi.vgm.reviewed.v1',bookingId:id,reference:w.reference,generatedAt:new Date().toISOString(),unit:'KGM',purpose:'Armatör web sitesine giriş için kullanıcı onaylı VGM verisi; otomatik gönderim değildir.',destination:'carrier_website',transmitted:false,containers:approved.map(a=>({approvalId:a.id,containerNumber:a.container_number,verifiedGrossMassKg:a.snapshot.values.vgmKg,cargoGrossMassKg:a.snapshot.values.cargoKg,containerTareKg:a.snapshot.values.tareKg,weighedAt:a.snapshot.values.weighedAt,timeZone:a.snapshot.values.zone,documentNumber:a.snapshot.values.documentNumber,weighingCompany:a.snapshot.values.company,authorizedPerson:a.snapshot.values.person,sourceDocumentId:a.snapshot.documentId,sourceDocumentHash:a.snapshot.documentHash,position:a.snapshot.position,approvedAt:a.created_at,approvedBy:a.snapshot.approvedBy}))};
}
