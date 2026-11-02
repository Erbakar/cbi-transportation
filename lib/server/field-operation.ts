import { AppError, db, digest } from './runtime';
import { ownBooking } from './operation-documents';
import { bookingSchema } from '../operations/booking';
import { emptyField, emptyContainer, fieldActionSchema, fieldSchema, buildFieldOutput, commonValues, outputKinds, type FieldData, type FieldSource } from '../operations/field-operation';
import { zonedInstant, type ScheduleTask } from '../operations/schedule';
import { readFieldSource } from './field-source';

export async function fieldWorkspace(id:string,owner:string){
 await ownBooking(id,owner);
 const b=await db().prepare('SELECT data,revision,evidence_revision FROM booking_handovers WHERE id=? AND owner=?').bind(id,owner).first<{data:string;revision:number;evidence_revision:number}>();
 const f=await db().prepare('SELECT data,source,revision FROM booking_field_operations WHERE booking_id=? AND owner=?').bind(id,owner).first<{data:string;source:string|null;revision:number}>();
 const s=await db().prepare('SELECT data,revision FROM booking_schedules WHERE booking_id=? AND owner=?').bind(id,owner).first<{data:string;revision:number}>();
 const booking=bookingSchema.parse(JSON.parse(b!.data)), data:FieldData=f?fieldSchema.parse(JSON.parse(f.data)):emptyField(),source:FieldSource|null=f?.source?JSON.parse(f.source):null,tasks:ScheduleTask[]=s?JSON.parse(s.data):[];
 const versions={revision:f?.revision||0,bookingRevision:b!.revision,scheduleRevision:s?.revision||0,evidenceRevision:b!.evidence_revision};
 const fingerprint=await digest(JSON.stringify({versions,booking,data,source,tasks}));
 const outputs=outputKinds.map(k=>buildFieldOutput(k,booking,source,data,tasks));
 const artifacts=(await db().prepare('SELECT id,kind,fingerprint,snapshot,created_at FROM booking_field_artifacts WHERE booking_id=? AND owner=? ORDER BY created_at DESC,id DESC LIMIT 50').bind(id,owner).all<{id:string;kind:string;fingerprint:string;snapshot:string;created_at:string}>()).results.map(a=>({...a,output:JSON.parse(a.snapshot) as typeof outputs[number],snapshot:undefined,stale:a.fingerprint!==fingerprint}));
 const dispatches=(await db().prepare('SELECT id,artifact_id,recipient,sent_at,channel,evidence,created_at FROM booking_field_dispatches WHERE booking_id=? AND owner=? ORDER BY created_at DESC,id DESC LIMIT 100').bind(id,owner).all<{id:string;artifact_id:string;recipient:string;sent_at:string;channel:string;evidence:string;created_at:string}>()).results;
 const history=(await db().prepare('SELECT revision,reason,created_at FROM booking_field_events WHERE booking_id=? AND owner=? ORDER BY revision DESC LIMIT 50').bind(id,owner).all<{revision:number;reason:string;created_at:string}>()).results;
 return {...versions,booking,data,source,tasks,fingerprint,outputs,artifacts,dispatches,history,common:commonValues(booking,source,data)};
}
export async function saveField(id:string,owner:string,raw:unknown){
 const parsed=fieldActionSchema.safeParse(raw);
 if(!parsed.success)throw new AppError(parsed.error.issues[0]?.message||'Saha bilgileri geçersiz.');
 const input=parsed.data, w=await fieldWorkspace(id,owner), now=new Date().toISOString();
 if(input.action==='dispatch'){
  if(Date.parse(input.sentAt)>Date.now()+60000)throw new AppError('Gönderim zamanı gelecekte olamaz.');
  const artifact=await db().prepare('SELECT id FROM booking_field_artifacts WHERE id=? AND booking_id=? AND owner=?').bind(input.artifactId,id,owner).first();
  if(!artifact)throw new AppError('Arşivlenmiş çıktı bulunamadı.',404);
  await db().prepare('INSERT INTO booking_field_dispatches(id,artifact_id,booking_id,owner,recipient,sent_at,channel,evidence,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM booking_field_dispatches WHERE artifact_id=? AND owner=? AND recipient=? AND sent_at=? AND channel=? AND evidence=?)').bind(crypto.randomUUID(),input.artifactId,id,owner,input.recipient,input.sentAt,input.channel,input.evidence,now,input.artifactId,owner,input.recipient,input.sentAt,input.channel,input.evidence).run();
  return fieldWorkspace(id,owner);
 }
 for(const k of ['revision','bookingRevision','scheduleRevision','evidenceRevision'] as const)if(input[k]!==w[k])throw new AppError('Booking, takvim veya saha bilgileri değişti. Yenileyip tekrar kontrol edin.',409);
 const guard='EXISTS(SELECT 1 FROM booking_handovers WHERE id=? AND owner=? AND revision=? AND evidence_revision=?) AND COALESCE((SELECT revision FROM booking_schedules WHERE booking_id=? AND owner=?),0)=? AND COALESCE((SELECT revision FROM booking_field_operations WHERE booking_id=? AND owner=?),0)=?';
 const args=[id,owner,w.bookingRevision,w.evidenceRevision,id,owner,w.scheduleRevision,id,owner,w.revision];
 if(input.action==='archive'){
  const output=w.outputs.find(o=>o.kind===input.kind)!;
  const result=await db().prepare('INSERT INTO booking_field_artifacts(id,booking_id,owner,kind,fingerprint,snapshot,created_at) SELECT ?,?,?,?,?,?,? WHERE '+guard).bind(crypto.randomUUID(),id,owner,input.kind,w.fingerprint,JSON.stringify(output),now,...args).run();
  if(!result.meta.changes)throw new AppError('Kaynaklar değişti; çıktı arşivlenmedi. Yenileyin.',409);
  return fieldWorkspace(id,owner);
 }
 let data=w.data, source=w.source;
 if(input.action==='save'){
  data=input.data;
  if(w.data.containers.some(c=>!data.containers.some(n=>n.id===c.id))||w.data.incidents.some(c=>!data.incidents.some(n=>n.id===c.id)))throw new AppError('Mevcut saha satırları silinemez; iptal edin veya olay durumunu güncelleyin.');
 }else{
  const result=await readFieldSource(owner,input.reference,input.goodId);
  if(!result.source||result.fingerprint!==input.fingerprint)throw new AppError('T-MAXX verileri önizlemeden sonra değişti; yeniden okuyun.',409);
  source=result.source;
  // Preserve entered field work. Source containers seed only a completely empty operation.
  if(!data.containers.length)data={...data,containers:source.containers.map(c=>({...emptyContainer(),number:c.number,type:c.type,seal:c.seal}))};
  const valid=fieldSchema.safeParse(data);
  if(!valid.success)throw new AppError('T-MAXX konteyner bilgileri kontrol edilmeli: '+valid.error.issues[0].message,422);
  data=valid.data;
 }
 for(const row of data.containers)for(const k of ['emptyPickup','loadingStart','loadingEnd','gateIn'] as const)if(row[k]&&zonedInstant(row[k].slice(0,10),row[k].slice(11),data.zone)>Date.now()+60000)throw new AppError('Gerçekleşen saha zamanı gelecekte olamaz. Planlanan tarihleri operasyon takvimine girin.');
 for(const row of data.incidents)for(const k of ['start','end'] as const)if(row[k]&&zonedInstant(row[k].slice(0,10),row[k].slice(11),data.zone)>Date.now()+60000)throw new AppError('Saha olayı zamanı gelecekte olamaz.');
 const serialized=JSON.stringify(data), sourceText=source?JSON.stringify(source):null;
 const write=w.revision===0?db().prepare('INSERT INTO booking_field_operations(booking_id,owner,revision,data,source,updated_at) SELECT ?,?,1,?,?,? WHERE '+guard+' ON CONFLICT(booking_id) DO NOTHING').bind(id,owner,serialized,sourceText,now,...args):db().prepare('UPDATE booking_field_operations SET revision=revision+1,data=?,source=?,updated_at=? WHERE booking_id=? AND owner=? AND '+guard).bind(serialized,sourceText,now,id,owner,...args);
 const result=await db().batch([write,db().prepare('INSERT INTO booking_field_events(id,booking_id,owner,revision,reason,snapshot,created_at) SELECT ?,?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),id,owner,w.revision+1,input.reason,JSON.stringify({data,source}),now)]);
 if(!result[0].meta.changes)throw new AppError('Kaynaklar eşzamanlı değişti. Yenileyip yeniden deneyin.',409);
 return fieldWorkspace(id,owner);
}
export async function fieldArtifact(id:string,owner:string,artifactId:string){
 await ownBooking(id,owner);
 const a=await db().prepare('SELECT snapshot,created_at FROM booking_field_artifacts WHERE id=? AND booking_id=? AND owner=?').bind(artifactId,id,owner).first<{snapshot:string;created_at:string}>();
 if(!a)throw new AppError('Çıktı bulunamadı.',404);
 return {output:JSON.parse(a.snapshot) as ReturnType<typeof buildFieldOutput>,createdAt:a.created_at};
}
