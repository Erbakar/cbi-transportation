import {z} from 'zod';
import {AppError,db,digest,runtime} from './runtime';
import {documentMime,MAX_DOCUMENT_BYTES,safeFilename} from '../operations/documents';
import {positionReference,readTmaxxPosition,readTmaxxArchiveFile} from './tmaxx-workspace';
import {tmaxxArchiveTypes} from './booking-tmaxx';
import {contracts,platformSession,fetchJson} from './platforms';
import {tmaxxRequest,type TmaxxTransportProgress} from './tmaxx-transport';
type Upload={id:string;owner:string;position_id:number;position_reference:string;filename:string;size:number;hash:string;object_key:string;type_id:number;state:string;remote_id:number|null;message:string|null;created_at:string;updated_at:string};
const now=()=>new Date().toISOString();
const pendingMessage='PDF platformda kayıtlı, ancak T-MAXX arşivine aktarımı henüz doğrulanamadı. Dosyayı yeniden yüklemeyin; bu kayıttaki “Aktarımı kontrol et” düğmesini kullanın.';
const uncertainMessage='Önceki gönderimin T-MAXX’e ulaşıp ulaşmadığı doğrulanamadı. Aynı belgenin iki kez oluşmaması için tekrar gönderilmedi. PDF platformda kayıtlı; arşiv kaydının destek ekibi tarafından kontrol edilmesi gerekiyor.';
const retryMessage='T-MAXX arşiv bağlantısı kurulamadığı için yükleme reddedildi. PDF kayıtlı; bağlantı düzeldiğinde “Yeniden aktar” ile aynı dosyayı gönderebilirsiniz.';
type ArchiveFailure={status:number;kind:string;retryable?:boolean};
function retryableFailure(error:unknown){return (error as {archiveFailure?:ArchiveFailure})?.archiveFailure?.retryable===true;}
function archiveMessage(error:unknown):string{
 const message=error instanceof Error?error.message:'';
 if(/mongo|127\.0\.0\.1:27017|connection refused/i.test(message))return 'T-MAXX’in dosya arşiv servisine erişilemiyor. PDF platformda kayıtlı. Destek ekibinin arşiv bağlantısını kontrol etmesi gerekiyor; dosyayı yeniden yüklemeyin.';
 if(/timeout|timed out|socket|fetch failed/i.test(message))return 'T-MAXX dosya servisi yanıt vermediği için aktarım sonucu doğrulanamadı. PDF platformda kayıtlı. Dosyayı yeniden yüklemeyin; mevcut kayıttan aktarımı kontrol edin.';
 if(message==='T-MAXX aktarımı doğrulanamadı. PDF korundu.'||message==='T-MAXX dosya yükleme sonucu doğrulanamadı.')return pendingMessage;
 if(message==='Önceki aktarım sonucu belirsiz. Mükerrer kayıt oluşturmamak için tekrar gönderilmedi.')return uncertainMessage;
 return error instanceof AppError?message:pendingMessage;
}
const matchedMessage='T-MAXX’teki mevcut Pre-alert ile eşleştirildi; belge yeniden yüklenmedi.';
function failureDetails(error:unknown){
 // Keep diagnostic codes, never response bodies, PDF contents or credentials.
 if(error instanceof z.ZodError)return {kind:'response-schema',issues:error.issues.map(issue=>({code:issue.code,path:issue.path}))};
 const details=(error as {archiveFailure?:ArchiveFailure})?.archiveFailure;
 if(details)return details;
 const message=error instanceof Error?error.message:'';
 if(/timed out|timeout/i.test(message))return {kind:'timeout'};
 if(message==='ERP response too large')return {kind:'response-too-large'};
 if(/Incomplete ERP|Invalid ERP/.test(message))return {kind:'incomplete-response'};
 const systemMessage=message.replace(/Bearer\s+\S+/gi,'Bearer [redacted]').replace(/(?:JSESSIONID|password|token)\s*[=:]\s*[^\s;,]+/gi,'[redacted]').replace(/[A-Za-z0-9_.-]{80,}/g,'[redacted]').slice(0,240);
 return {kind:error instanceof AppError?'application-error':'unexpected-error',name:error instanceof Error?error.name:'Unknown',...(error instanceof AppError?{}:{systemMessage})};
}
export async function prealertList(owner:string){
 type Listed=Pick<Upload,'id'|'position_reference'|'filename'|'state'|'remote_id'|'message'|'created_at'>&{queue_state:string|null;next_attempt_at:number|null;queue_message:string|null};
 return (await db().prepare('SELECT d.id,d.position_reference,d.filename,d.state,d.remote_id,d.message,d.created_at,q.state AS queue_state,q.next_at AS next_attempt_at,q.message AS queue_message FROM prealert_uploads d LEFT JOIN prealert_queue q ON q.document_id=d.id AND q.owner=d.owner WHERE d.owner=? ORDER BY d.created_at DESC LIMIT 200').bind(owner).all<Listed>()).results.map(row=>({...row,message:row.state==='pending'&&row.message?archiveMessage(new AppError(row.message)):row.message}));
}
async function own(id:string,owner:string){const row=await db().prepare('SELECT * FROM prealert_uploads WHERE id=? AND owner=?').bind(id,owner).first<Upload>();if(!row)throw new AppError('Pre-alert bulunamadı.',404);return row;}
export async function prealertFile(id:string,owner:string){const row=await own(id,owner),object=await runtime().BUCKET.get(row.object_key);if(!object)throw new AppError('PDF bulunamadı.',404);const bytes=await object.arrayBuffer();if(await digest(bytes)!==row.hash)throw new AppError('PDF içeriği doğrulanamadı.',409);return {bytes,filename:row.filename};}
export async function lookupPrealertPosition(owner:string,reference:string){
 const ref=positionReference.parse(reference);
 try{
  const snapshot=await readTmaxxPosition(owner,ref);
  const types=(await tmaxxArchiveTypes(owner)).filter(t=>t.code==='PRA');
  if(types.length!==1)throw new AppError('T-MAXX Pre-alert belge türü doğrulanamadı.',409);
  await db().prepare('INSERT INTO prealert_targets(owner,reference,snapshot,type_id,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(owner,reference) DO UPDATE SET snapshot=excluded.snapshot,type_id=excluded.type_id,updated_at=excluded.updated_at').bind(owner,ref,JSON.stringify(snapshot),types[0].id,now()).run();
  return {...snapshot,prealertTypeId:types[0].id,cached:false};
 }catch(error){
  if(error instanceof AppError&&error.status<500)throw error;
  const cached=await db().prepare('SELECT snapshot,type_id FROM prealert_targets WHERE owner=? AND reference=?').bind(owner,ref).first<{snapshot:string;type_id:number}>();
  if(!cached)throw error;
  const snapshot=JSON.parse(cached.snapshot) as Awaited<ReturnType<typeof readTmaxxPosition>>;
  return {...snapshot,prealertTypeId:cached.type_id,cached:true};
 }
}
export async function createPrealert(owner:string,form:FormData){
 const ref=positionReference.safeParse(form.get('reference')),files=form.getAll('file'),file=files[0];
 if(!ref.success)throw new AppError('T-MAXX pozisyonunu seçin.',422);
 if(files.length!==1||!(file instanceof File)||!file.size||file.size>MAX_DOCUMENT_BYTES)throw new AppError('En fazla 10 MB boyutunda bir PDF seçin.',422);
 const bytes=await file.arrayBuffer(),filename=safeFilename(file.name);
 try{if(documentMime(new Uint8Array(bytes),filename)!=='application/pdf')throw Error();}catch{throw new AppError('Pre-alert için geçerli bir PDF yükleyin.',422);}
 const hash=await digest(bytes),existing=await db().prepare('SELECT id FROM prealert_uploads WHERE owner=? AND position_reference=? AND hash=?').bind(owner,ref.data,hash).first<{id:string}>();
 if(existing)return {id:existing.id,duplicate:true};
 const snapshot=await lookupPrealertPosition(owner,ref.data);if(snapshot.position.locked)throw new AppError('Pozisyon kilitli.',409);
 const id=crypto.randomUUID(),key='prealert/'+owner+'/'+id;
 await runtime().BUCKET.put(key,bytes,{httpMetadata:{contentType:'application/pdf'}});
 // An atomic unique claim prevents two concurrent clicks from creating two remote documents.
 const inserted=await db().prepare('INSERT OR IGNORE INTO prealert_uploads(id,owner,position_id,position_reference,filename,size,hash,object_key,type_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,owner,snapshot.position.id,ref.data,filename,file.size,hash,key,snapshot.prealertTypeId,now(),now()).run();
 if(!inserted.meta.changes){await runtime().BUCKET.delete(key);const duplicate=await db().prepare('SELECT id FROM prealert_uploads WHERE owner=? AND position_id=? AND hash=?').bind(owner,snapshot.position.id,hash).first<{id:string}>();if(!duplicate)throw new AppError('Kayıt durumu değişti.',409);return {id:duplicate.id,duplicate:true};}
 return {id,duplicate:false};
}
type SyncOptions={beforeWrite?:()=>Promise<void>;readOnly?:boolean};
type ArchiveProgress={stage:string;httpStatus?:number;transport?:TmaxxTransportProgress};
async function step<T>(id:string,name:string,send:(progress:ArchiveProgress)=>Promise<T>,options:SyncOptions):Promise<T>{
 const row=await db().prepare('SELECT status,result FROM prealert_upload_steps WHERE document_id=? AND step=?').bind(id,name).first<{status:string;result:string|null}>();
 if(row?.status==='complete'&&row.result)return JSON.parse(row.result);
 if(options.readOnly)throw new AppError(uncertainMessage,409);
 await options.beforeWrite?.();
 if(row){
  // Only an explicit pre-write connection refusal may be retried after reconciliation and a new queue claim.
  // Timeouts, missing responses, old unknown results and link failures stay blocked.
  if(name!=='upload'||row.status!=='rejected'||!row.result||JSON.parse(row.result).failure?.retryable!==true)throw new AppError(uncertainMessage,409);
  const history=name+':rejected:'+await digest(row.result);
  await db().prepare("INSERT OR IGNORE INTO prealert_upload_steps(document_id,step,status,result) SELECT document_id,?,status,result FROM prealert_upload_steps WHERE document_id=? AND step=? AND status='rejected' AND result=?").bind(history,id,name,row.result).run();
  const claim=await db().prepare("UPDATE prealert_upload_steps SET status='sending',result=NULL WHERE document_id=? AND step=? AND status='rejected' AND result=?").bind(id,name,row.result).run();
  if(!claim.meta.changes)throw new AppError('Aktarım zaten başlatıldı.',409);
 }else{
  const claim=await db().prepare("INSERT OR IGNORE INTO prealert_upload_steps(document_id,step,status) VALUES(?,?,'sending')").bind(id,name).run();if(!claim.meta.changes)throw new AppError('Aktarım zaten başlatıldı.',409);
 }
 const started=Date.now(),progress:ArchiveProgress={stage:'prepare'};let receipt:T|undefined;
 try{
  receipt=await send(progress);progress.stage='persist-result';
  await db().prepare("UPDATE prealert_upload_steps SET status='complete',result=? WHERE document_id=? AND step=?").bind(JSON.stringify(receipt),id,name).run();return receipt;
 }catch(e){
  const status=name==='upload'&&retryableFailure(e)?'rejected':'unknown';
  // Keep the failed stage and byte counters, never credentials or file contents.
  // A received receipt is retained if saving it failed; this is still uncertain,
  // so it does not authorize another remote write.
  await db().prepare('UPDATE prealert_upload_steps SET status=?,result=? WHERE document_id=? AND step=?').bind(status,JSON.stringify({failure:failureDetails(e),at:now(),attemptId:crypto.randomUUID(),progress:{...progress,elapsedMs:Date.now()-started},...(receipt===undefined?{}:{receipt})}),id,name).run();throw e;
 }

}
export async function syncPrealert(id:string,owner:string,options:SyncOptions={}){
 const doc=await own(id,owner);if(doc.state==='synced')return {status:'synced',remoteId:doc.remote_id,matchedExisting:doc.message===matchedMessage};
 try{
 const snapshot=await readTmaxxPosition(owner,doc.position_reference);
 if(snapshot.position.id!==doc.position_id||snapshot.position.locked)throw new AppError('Pozisyon değişmiş veya kilitli.',409);
 if(!(await tmaxxArchiveTypes(owner)).some(t=>t.id===doc.type_id&&t.code==='PRA'))throw new AppError('Pre-alert belge türü değişmiş.',409);
 const {bytes}=await prealertFile(id,owner),contract=contracts().find(c=>c.id==='tmaxx');if(!contract)throw new AppError('T-MAXX bağlantısı bulunamadı.',503);
 let session=await platformSession(contract,owner);if(!session.userId||!session.archiveUser)session=await platformSession(contract,owner,true);if(!session.userId||session.archiveUser?.id!==session.userId)throw new AppError('T-MAXX kullanıcı kimliği doğrulanamadı.',502);
 const headers={Authorization:'Bearer '+session.token,Cookie:session.cookie},base='http://95.216.243.19:8090';
 const get=async(path:string)=>(await fetchJson(base+path,{method:'GET',headers})).data as Record<string,unknown>;
 // Match only position-level PRA documents. Filename alone never establishes identity.
 // Any read failure stops the upload: an unreadable candidate may be the same PDF.
 const candidates=snapshot.documents.filter(d=>d.entityId===doc.position_id&&d.size===doc.size&&/^PRA\s*-/.test(d.type));
 for(const candidate of candidates){
  const existing=await get('/api//document/doc/'+candidate.id);
  if(existing.entityid!==doc.position_id||(existing.type as {id?:number})?.id!==doc.type_id||existing.sourceType!=='SeaPosition'||existing.fileSize!==doc.size)throw new AppError('Mevcut arşiv belgesinin hedefi veya türü doğrulanamadı. Tekrar yükleme yapılmadı.',409);
  const remote=await readTmaxxArchiveFile(owner,doc.position_reference,candidate.id);
  if(await digest(remote.bytes.buffer.slice(remote.bytes.byteOffset,remote.bytes.byteOffset+remote.bytes.byteLength) as ArrayBuffer)===doc.hash){
   await db().prepare("UPDATE prealert_uploads SET state='synced',remote_id=?,message=?,updated_at=? WHERE id=? AND owner=?").bind(candidate.id,matchedMessage,now(),id,owner).run();
   return {status:'synced',remoteId:candidate.id,matchedExisting:true};
  }
 }
 const page=await get('/api//manage/xinerji/page/getByContext?context=seaPosition'),template=await get('/api//document/doc/new');if(!Number.isSafeInteger(page.id)||template.id)throw new AppError('Arşiv şablonu doğrulanamadı.',502);
 const types=await get('/api//document/def/docType/searchSimple?query='+encodeURIComponent(JSON.stringify({code:'PRA'})));
 const type=Array.isArray(types)?types.filter(t=>t.id===doc.type_id):[];
 const firmId=(template.firm as {id?:number})?.id;
 if(type.length!==1||!Number.isSafeInteger(firmId)||[page,session.archiveUser,type[0]].some(r=>(r.firm as {id?:number})?.id!==firmId)||!Number.isSafeInteger(page.version))throw new AppError('Arşiv türü, kullanıcı veya firma bilgileri doğrulanamadı.',502);
 // Match the native uploader's relations, including firm/version, without changing login settings.
 const entity={...template,entityid:doc.position_id,sourceType:'SeaPosition',page:{id:page.id,firm:page.firm,version:page.version,name:page.name},type:type[0],user:session.archiveUser,fileName:doc.filename,contentType:'application/pdf',fileSize:doc.size,description:`CBI pre-alert ${id} · ${doc.hash}`};
 const upload=await step(id,'upload',async progress=>{
  progress.stage='encode-file';
  const form=new FormData();form.append('file',new Blob([bytes],{type:'application/pdf'}),doc.filename);form.append('entity',JSON.stringify(entity));
  const encoded=new Request('http://localhost',{method:'POST',body:form}),body=await encoded.arrayBuffer();
  progress.stage='send-file';progress.transport={stage:'connect',bodyBytes:0,requestBytes:0,writtenBytes:0,responseBytes:0,elapsedMs:0};
  const r=await tmaxxRequest(base+'/api/uploader/upload',{method:'POST',headers:{...headers,'Content-Type':encoded.headers.get('content-type')!},body},progress.transport);
  progress.httpStatus=r.status;progress.stage='read-result';
  if(!r.ok){
   const detail=await r.text(),unavailable=/mongo|127\.0\.0\.1:27017|connection refused/i.test(detail),retryable=r.status===400&&/Timed out after \d+ ms while waiting to connect\./.test(detail)&&/MongoSocketOpenException/.test(detail)&&/java\.net\.ConnectException: Connection refused/.test(detail);
   throw Object.assign(new AppError(unavailable?archiveMessage(new Error(detail)):pendingMessage,502),{archiveFailure:{status:r.status,kind:unavailable?'archive-unavailable':/invalid cors/i.test(detail)?'origin-rejected':'http-rejected',...(retryable?{retryable:true}:{})}});
  }
  progress.stage='parse-result';let result:unknown;
  try{result=await r.json();}catch{throw Object.assign(new AppError(pendingMessage,502),{archiveFailure:{status:r.status,kind:'invalid-json'}});}
  progress.stage='validate-result';return z.object({res:z.object({uid:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)})}).parse(result).res;
 },options);
 const saved=await step(id,'link',async()=>{const result=(await fetchJson(base+'/api//document/doc',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({...entity,reference:upload.uid})})).data as Record<string,unknown>;if(!Number.isSafeInteger(result.id)||Number(result.id)<=0||result.entityid!==doc.position_id||result.reference!==upload.uid)throw new AppError('T-MAXX arşiv kaydı doğrulanamadı.',502);return {id:Number(result.id)};},options);
 const verified=await get('/api//document/doc/'+saved.id);
 if(verified.entityid!==doc.position_id||(verified.type as {id?:number})?.id!==doc.type_id||verified.reference!==upload.uid||verified.fileSize!==doc.size||verified.sourceType!=='SeaPosition'||(verified.page as {id?:number})?.id!==page.id)throw new AppError('Arşiv kaydı geri okunarak doğrulanamadı.',502);
 const remote=await readTmaxxArchiveFile(owner,doc.position_reference,saved.id);
 if(await digest(remote.bytes.buffer.slice(remote.bytes.byteOffset,remote.bytes.byteOffset+remote.bytes.byteLength) as ArrayBuffer)!==doc.hash)throw new AppError('T-MAXX PDF içeriği kaynakla eşleşmiyor.',502);
 await db().prepare("UPDATE prealert_uploads SET state='synced',remote_id=?,message=NULL,updated_at=? WHERE id=? AND owner=?").bind(saved.id,now(),id,owner).run();return {status:'synced',remoteId:saved.id};
 }catch(e){const retryable=retryableFailure(e),message=retryable?retryMessage:archiveMessage(e);await db().prepare("UPDATE prealert_uploads SET state=?,message=?,updated_at=? WHERE id=? AND owner=? AND state<>'synced'").bind(retryable?'retryable':'pending',message,now(),id,owner).run();return {status:'pending',message};}
}
