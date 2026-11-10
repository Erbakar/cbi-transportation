import {normalizeTmaxxReference} from '@/lib/tmaxx-reference';
import {emptyManual} from '@/lib/manual';
import {AppError,db,digest,runtime} from '@/lib/server/runtime';
import {detectFile,owned,type Row} from '@/lib/server/records';
import {allTargets} from '@/lib/server/platforms';
import {findSameDocumentSet} from '@/lib/server/record-upload';

export type NewSource={name:string;bytes:ArrayBuffer;role:'instruction'|'mbl-parties';mime?:string};
/**
 * Creates a record, or a new revision of `recordId` with the complete document set.
 * keepManual keeps operator edits on a new revision (e-mail replies add documents);
 * the upload screen replaces the set and starts from empty manual values.
 */
export async function createRecord(owner:string,{sources:input,reference:rawReference='',recordId,keepManual=false}:{sources:NewSource[];reference?:string;recordId?:string;keepManual?:boolean}):Promise<{row:Row;duplicate:boolean}>{
 let heldId='',lease=0;
 try{
  const reference=normalizeTmaxxReference(rawReference);
  if(reference.length>200||/[\x00-\x1f]/.test(reference))throw new AppError('Geçerli T-MAXX referans numarasını girin.');
  if(!input.length||input.length>5||input.some(s=>!s.bytes.byteLength))throw new AppError('Aynı işlem için 1–5 belge seçin.');
  if(!input.some(s=>s.role==='instruction'))throw new AppError('Her belgenin kullanımını seçin; en az bir ana talimat gerekli.');
  const sources=await Promise.all(input.map(async s=>{if(s.bytes.byteLength>10*1024*1024)throw new AppError('Her belge en fazla 10 MB olabilir.',413);return {file:{name:s.name},role:s.role,bytes:s.bytes,mime:s.mime||detectFile(new Uint8Array(s.bytes),s.name),hash:await digest(s.bytes)};}));
  if(sources.reduce((n,s)=>n+s.bytes.byteLength,0)>30*1024*1024)throw new AppError('Belgelerin toplamı en fazla 30 MB olabilir.',413);
  if(new Set(sources.map(s=>s.hash)).size!==sources.length)throw new AppError('Aynı belgeyi yalnızca bir kez seçin.');
  const hash=sources.length===1&&sources[0].role==='instruction'?sources[0].hash:await digest(JSON.stringify(sources.map(s=>sources.every(x=>x.role==='instruction')?s.hash:s.hash+':'+s.role).sort()));
  const file={name:sources.map(s=>s.file.name).join(' + ')};const mime=sources[0].mime;
  const existing=await db().prepare('SELECT * FROM records WHERE owner=? AND hash=?').bind(owner,hash).first<Row>()||(!recordId?await findSameDocumentSet(owner,sources.map(s=>s.hash)):null);
  if(existing&&reference&&normalizeTmaxxReference(JSON.parse(existing.manual||'{}').tmaxxReference||'')!==reference)throw new AppError('Bu belgeler başka bir referansla zaten kayıtlı. Mevcut kaydı kontrol edin.',409);
  if(existing)return {row:existing,duplicate:true};
  const id=recordId||crypto.randomUUID();let previous:Row|null=null;
  if(recordId){
   previous=await owned(id,owner);
   const uncertain=await db().prepare("SELECT step FROM platform_steps WHERE record_id=? AND status IN ('sending','unknown') LIMIT 1").bind(id).first();
   if(uncertain)throw new AppError('Önceki platform isteğinin sonucu doğrulanmalı.',409);
   lease=Date.now()+180000;
   const acquired=await db().prepare('UPDATE records SET lock_until=? WHERE id=? AND owner=? AND lock_until<=?').bind(lease,id,owner,Date.now()).run();
   if(!acquired.meta.changes)throw new AppError('Talimat halen işleniyor.',409);heldId=id;
   const check=await db().prepare("SELECT id FROM deliveries WHERE record_id=? AND status IN ('created','sending','unknown')").bind(id).first();
   if(check)throw new AppError('Aktarılmış veya işlenmekte olan talimat değiştirilemez.',409);
  }
  const now=new Date().toISOString(),revision=(previous?.revision||0)+1;const objectKey=`${owner}/${id}/${revision}-${hash}`;
  if(!runtime().BUCKET)throw new AppError('Dosya deposu henüz yapılandırılmadı.',503);
  const stored:string[]=[];
  try{for(const [index,source] of sources.entries()){const key=index===0?objectKey:`${owner}/${id}/${revision}-${source.hash}`;await runtime().BUCKET.put(key,source.bytes,{httpMetadata:{contentType:source.mime}});stored.push(key);}}
  catch(e){await Promise.all(stored.map(key=>runtime().BUCKET.delete(key)));throw e;}
  try{
   const previousManual=previous?.manual?JSON.parse(previous.manual):null;
   // A reference arriving later (e.g. in an e-mail reply) fills an empty one; it never replaces a set reference.
   const manual=keepManual&&previousManual?{...previousManual,tmaxxReference:previousManual.tmaxxReference||reference}:{...emptyManual,tmaxxReference:reference||previousManual?.tmaxxReference||''};
   const mutations=[];
   if(previous)mutations.push(db().prepare("UPDATE records SET filename=?,hash=?,object_key=?,mime=?,updated_at=?,revision=?,status='uploaded',fields=NULL,issues=NULL,extraction=NULL,manual=NULL WHERE id=? AND owner=? AND lock_until=?").bind(file.name,hash,objectKey,mime,now,revision,id,owner,lease));
   else mutations.push(db().prepare('INSERT INTO records (id,owner,filename,hash,object_key,mime,created_at,updated_at,revision,status) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id,owner,file.name,hash,objectKey,mime,now,now,revision,'uploaded'));
   mutations.push(db().prepare('UPDATE records SET manual=? WHERE id=? AND owner=?').bind(JSON.stringify(manual),id,owner));
   mutations.push(db().prepare('INSERT INTO revisions (id,record_id,revision,filename,hash,object_key,created_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,revision,file.name,hash,objectKey,now));
   for(const [index,source] of sources.entries())mutations.push(db().prepare('INSERT INTO record_documents (id,record_id,revision,filename,hash,object_key,mime,role) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,revision,source.file.name,source.hash,stored[index],source.mime,source.role));
   for(const t of allTargets())mutations.push(db().prepare("INSERT INTO deliveries (id,record_id,platform,kind,status,idempotency_key,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(record_id,platform) DO UPDATE SET status='waiting',reference=NULL,message=NULL,payload=NULL,business_key=NULL,idempotency_key=excluded.idempotency_key,updated_at=excluded.updated_at").bind(crypto.randomUUID(),id,t.id,t.kind,'waiting',`${id}:${revision}:${t.id}`,now));
   await db().batch(mutations);
  }catch(e){await Promise.all(stored.map(key=>runtime().BUCKET.delete(key)));throw e;}
  return {row:await owned(id,owner),duplicate:false};
 }finally{
  if(heldId)await db().prepare('UPDATE records SET lock_until=0 WHERE id=? AND owner=? AND lock_until=?').bind(heldId,owner,lease).run();
 }
}
