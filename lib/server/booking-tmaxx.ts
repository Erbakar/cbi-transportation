import {z} from 'zod';
import {AppError,db,digest,runtime} from './runtime';
import {ownBooking,type DocumentRow} from './operation-documents';
import {positionReference,readTmaxxPosition,tmaxxWorkspaceClient} from './tmaxx-workspace';
import {contracts,platformSession,fetchJson} from './platforms';
import {tmaxxRequest} from './tmaxx-transport';
export type BookingTmaxxLink={booking_id:string;owner:string;position_id:number;position_reference:string;good_id:number;good_reference:string;created_at:string};
export async function bookingTmaxxLink(id:string,owner:string){await ownBooking(id,owner);return db().prepare('SELECT * FROM booking_tmaxx_links WHERE booking_id=? AND owner=?').bind(id,owner).first<BookingTmaxxLink>();}
async function requireOperationalBooking(id:string,owner:string){
 const row=await db().prepare('SELECT data FROM booking_reporting WHERE booking_id=? AND owner=?').bind(id,owner).first<{data:string}>();
 if(row&&JSON.parse(row.data).test===true)throw new AppError('Test olarak işaretli dosya canlı T-MAXX yüküne bağlanamaz veya belge gönderemez.',409);
}
export const linkInput=z.object({reference:positionReference,goodId:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),revision:z.number().int().positive()}).strict();
export async function linkBookingTmaxx(id:string,owner:string,input:z.infer<typeof linkInput>){
 await ownBooking(id,owner);await requireOperationalBooking(id,owner);const prior=await bookingTmaxxLink(id,owner);
 if(prior){if(prior.position_reference===input.reference&&prior.good_id===input.goodId)return prior;throw new AppError('Dosya başka bir T-MAXX yüküne bağlı. Mevcut eşleşme otomatik değiştirilemez.',409);}
 const snapshot=await readTmaxxPosition(owner,input.reference),load=snapshot.loads.find(l=>l.id===input.goodId);
 if(!load)throw new AppError('Seçili yük bu pozisyonda bulunamadı.',422);
 const result=await db().prepare(`INSERT OR IGNORE INTO booking_tmaxx_links(booking_id,owner,position_id,position_reference,good_id,good_reference,created_at) SELECT id,owner,?,?,?,?,? FROM booking_handovers WHERE id=? AND owner=? AND revision=? AND NOT EXISTS(SELECT 1 FROM booking_tmaxx_runs WHERE booking_id=? AND status IN ('prepared','sending','unknown'))`).bind(snapshot.position.id,snapshot.position.reference,load.id,load.reference,new Date().toISOString(),id,owner,input.revision,id).run();
 if(!result.meta.changes)throw new AppError('Dosya değişti, açık T-MAXX işlemi var veya yük başka bir booking dosyasına bağlı.',409);
 return bookingTmaxxLink(id,owner);
}
export async function tmaxxArchiveTypes(owner:string){const get=await tmaxxWorkspaceClient(owner);const result=z.array(z.object({id:z.number().int().positive(),code:z.string(),name:z.string(),isActive:z.boolean().nullable().optional()})).safeParse(await get('/api//document/def/docType/searchByOrder?query=%7B%7D&orderBy=%22order%20by%20id%22'));if(!result.success)throw new AppError('T-MAXX belge türleri doğrulanamadı.',502);return result.data.filter(t=>t.isActive!==false).map(t=>({id:t.id,code:t.code,name:t.name}));}
export async function documentTarget(id:string,owner:string,typeId:number){
 const link=await bookingTmaxxLink(id,owner);if(!link)return null;await requireOperationalBooking(id,owner);
 const snapshot=await readTmaxxPosition(owner,link.position_reference);
 if(snapshot.position.id!==link.position_id||!snapshot.loads.some(l=>l.id===link.good_id&&l.reference===link.good_reference)||snapshot.position.locked)throw new AppError('T-MAXX yük eşleşmesi değişmiş veya pozisyon kilitli.',409);
 const type=(await tmaxxArchiveTypes(owner)).find(t=>t.id===typeId);if(!type)throw new AppError('T-MAXX arşiv belge türünü seçin.',422);
 return {link,type};
}
export async function bookingTmaxxStep<T>(documentId:string,step:string,request:unknown,send:()=>Promise<T>):Promise<T>{
 const hash=await digest(JSON.stringify(request));const row=await db().prepare('SELECT * FROM booking_tmaxx_steps WHERE document_id=? AND step=?').bind(documentId,step).first<{request_hash:string;status:string;result:string|null}>();
 if(row){if(row.request_hash!==hash)throw new AppError('Belge aktarım bilgileri değişmiş.',409);if(row.status==='complete'&&row.result)return JSON.parse(row.result);throw new AppError('Önceki T-MAXX isteğinin sonucu belirsiz. Mükerrer belgeyi önlemek için tekrar gönderilmedi; arşiv kontrol edilmeli.',409);}
 const claim=await db().prepare("INSERT OR IGNORE INTO booking_tmaxx_steps(document_id,step,request_hash,status,updated_at) VALUES(?,?,?,'sending',?)").bind(documentId,step,hash,new Date().toISOString()).run();if(!claim.meta.changes)throw new AppError('Belge aktarımı zaten başlatıldı.',409);
 try{const result=await send();await db().prepare("UPDATE booking_tmaxx_steps SET status='complete',result=?,updated_at=? WHERE document_id=? AND step=?").bind(JSON.stringify(result),new Date().toISOString(),documentId,step).run();return result;}catch(e){await db().prepare("UPDATE booking_tmaxx_steps SET status='unknown',updated_at=? WHERE document_id=? AND step=?").bind(new Date().toISOString(),documentId,step).run();throw e;}
}
export async function syncBookingDocument(id:string,owner:string,documentId:string,typeId:number,targetKind:'good'|'position'='good'){
 if(!['good','position'].includes(targetKind))throw new AppError('Arşiv hedefi geçersiz.',422);
 const target=await documentTarget(id,owner,typeId);if(!target)throw new AppError('Önce T-MAXX yükünü bağlayın.',409);
 const doc=await db().prepare('SELECT * FROM operation_documents WHERE id=? AND booking_id=? AND owner=?').bind(documentId,id,owner).first<DocumentRow>();if(!doc)throw new AppError('Belge bulunamadı.',404);
 const {link,type}=target;
 const entityId=targetKind==='position'?link.position_id:link.good_id;
 await db().prepare('INSERT OR IGNORE INTO booking_tmaxx_documents(document_id,booking_id,owner,good_id,type_id,content_hash,target_kind,target_id) VALUES(?,?,?,?,?,?,?,?)').bind(doc.id,id,owner,link.good_id,type.id,doc.hash,targetKind,entityId).run();
 const job=await db().prepare('SELECT * FROM booking_tmaxx_documents WHERE document_id=?').bind(doc.id).first<{good_id:number;type_id:number;content_hash:string;remote_id:number|null;verified_at:string|null;target_kind:'good'|'position';target_id:number|null}>();
 if(!job||job.good_id!==link.good_id||job.type_id!==type.id||job.content_hash!==doc.hash||job.target_kind!==targetKind||(job.target_id??job.good_id)!==entityId)throw new AppError('Belge başka bir hedef veya tür ile aktarılmaya başlanmış.',409);
 if(job.verified_at&&job.remote_id)return {status:'synced' as const,remoteId:job.remote_id};
 const object=await runtime().BUCKET.get(doc.object_key);if(!object)throw new AppError('Kaynak belge bulunamadı.',404);const bytes=await object.arrayBuffer();if(await digest(bytes)!==doc.hash)throw new AppError('Kaynak belgenin içeriği değişmiş.',409);
 const c=contracts().find(c=>c.id==='tmaxx');if(!c)throw new AppError('T-MAXX bağlantısı tanımlanmalı.',503);let session=await platformSession(c,owner);if(!session.userId)session=await platformSession(c,owner,true);if(!session.userId)throw new AppError('T-MAXX kullanıcı kimliği doğrulanamadı.',502);
 const headers={Authorization:'Bearer '+session.token,Cookie:session.cookie},base='http://95.216.243.19:8090';
 const get=async(path:string)=>(await fetchJson(base+path,{method:'GET',headers})).data as Record<string,unknown>;
 const good=await get('/api//sea/seaGood/'+link.good_id);if(good.id!==link.good_id||good.referenceNo!==link.good_reference||good.isLocked||(good.seaPosition as {id?:number})?.id!==link.position_id)throw new AppError('T-MAXX yükü değişmiş veya kilitli.',409);
 const page=await get('/api//manage/xinerji/page/getByContext?context='+(targetKind==='position'?'seaPosition':'seaGood')),template=await get('/api//document/doc/new');if(!Number.isSafeInteger(page.id)||template.id)throw new AppError('T-MAXX arşiv şablonu doğrulanamadı.',502);
 const entity={...template,entityid:entityId,sourceType:targetKind==='position'?'SeaPosition':'SeaGood',page:{id:page.id},type:{id:type.id},user:{id:session.userId},fileName:doc.filename,contentType:doc.mime,fileSize:doc.size,description:`CBI belge ${doc.id} · v${doc.version} · ${doc.hash}`};
 const request={goodId:link.good_id,typeId:type.id,hash:doc.hash,...(targetKind==='position'?{targetKind,entityId}:{})};
 const upload=await bookingTmaxxStep(doc.id,'upload',request,async()=>{const form=new FormData();form.append('file',new Blob([bytes],{type:doc.mime}),doc.filename);form.append('entity',JSON.stringify(entity));const encoded=new Request('http://localhost',{method:'POST',body:form});const r=await tmaxxRequest(base+'/api/uploader/upload',{method:'POST',headers:{...headers,'Content-Type':encoded.headers.get('content-type')!},body:await encoded.arrayBuffer()});if(!r.ok)throw new AppError('T-MAXX dosya yükleme sonucu doğrulanamadı.',502);const value=z.object({res:z.object({uid:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)})}).safeParse(await r.json());if(!value.success)throw new AppError('T-MAXX dosya kimliği doğrulanamadı.',502);return {reference:value.data.res.uid};});
 const saved=await bookingTmaxxStep(doc.id,'link',{...request,reference:upload.reference},async()=>{const r=await fetchJson(base+'/api//document/doc',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({...entity,reference:upload.reference})});const saved=r.data as Record<string,unknown>;if(!Number.isSafeInteger(saved.id)||Number(saved.id)<=0||saved.entityid!==entityId||saved.reference!==upload.reference)throw new AppError('T-MAXX arşiv kaydı doğrulanamadı.',502);return {id:Number(saved.id)};});
 const verified=await get('/api//document/doc/'+saved.id);if(verified.entityid!==entityId||(verified.type as {id?:number})?.id!==type.id||verified.reference!==upload.reference||verified.fileSize!==doc.size||(targetKind==='position'&&(verified.sourceType!=='SeaPosition'||(verified.page as {id?:number})?.id!==page.id)))throw new AppError('T-MAXX belge kaydı geri okunarak doğrulanamadı.',502);
 await db().prepare('UPDATE booking_tmaxx_documents SET remote_id=?,verified_at=? WHERE document_id=?').bind(saved.id,new Date().toISOString(),doc.id).run();return {status:'synced' as const,remoteId:saved.id};
}
