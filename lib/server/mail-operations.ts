import {AppError,db,digest,runtime} from './runtime';
import {createPrealert} from './prealert-upload';
import {detectPrealertPosition} from './prealert-position';
import {enqueuePrealert} from './prealert-queue';
import {readVgmFile} from './vgm-extraction';
import {prepareCmaJob,submitCmaJob} from './cma-vgm-jobs';
import {normalizeMass} from '../operations/vgm';
import {containerValid} from '../domain';
import type {DocumentRow} from './operation-documents';

/**
 * Pre-alert (and later VGM) mail. The subject decides the kind; anything else stays on the
 * unchanged bill-of-lading flow. Pre-alert PDFs go through exactly the screen's path:
 * position found on the PDF (or given by the sender) -> createPrealert -> archive queue.
 */
export type OperationKind='prealert'|'vgm';
export function operationKind(subject:string):OperationKind|null{
 const s=subject.normalize('NFKD').replace(/[̀-ͯ]/g,'');
 if(/pre[\s_.-]?alert/i.test(s))return 'prealert';
 if(/(^|[^A-Z0-9])VGM([^A-Z0-9]|$)/i.test(s))return 'vgm';
 return null;
}

export type OpThread={id:string;tag:string;state:string;rounds:number;kind:string;items:string|null};
export type OpFile={name:string;bytes:ArrayBuffer;mime:string};
export type OpsContext={
 owner:string;subject:string;text:string;files:OpFile[];thread:OpThread|null;
 reference:(text:string)=>string;
 open:(kind:OperationKind)=>Promise<OpThread>;
 ask:(thread:OpThread,body:string)=>Promise<void>;
 notify:(thread:OpThread,body:string)=>Promise<void>;
 setThread:(id:string,state:string,note:string)=>Promise<void>;
};
type Outcome={state:string;note:string;threadId?:string};
type Item={name:string;upload?:string;reference?:string;duplicate?:boolean;pending?:string;error?:string};

const saveItems=(id:string,items:Item[])=>db().prepare('UPDATE mail_threads SET items=?,updated_at=? WHERE id=?').bind(JSON.stringify(items),new Date().toISOString(),id).run();
const pdfForm=(file:OpFile,reference?:string)=>{const form=new FormData();if(reference)form.set('reference',reference);form.set('file',new File([file.bytes],file.name,{type:'application/pdf'}));return form;};

export async function handleOperation(kind:OperationKind,ctx:OpsContext):Promise<Outcome>{
 if(kind==='prealert')return prealertMail(ctx);
 return vgmMail(ctx);
}

/** One PDF into the T-MAXX pre-alert archive, exactly as an upload on screen. */
async function uploadPrealert(owner:string,file:OpFile,reference:string,item:Item){
 try{
  const saved=await createPrealert(owner,pdfForm(file,reference));
  await enqueuePrealert(saved.id,owner);
  Object.assign(item,{upload:saved.id,reference,duplicate:saved.duplicate});delete item.pending;delete item.error;
 }catch(error){
  if(error instanceof AppError&&error.status>=500)throw error;
  item.error=error instanceof Error?error.message.slice(0,200):'Yüklenemedi.';
 }
}
async function positionOf(owner:string,file:OpFile){
 try{const r=await detectPrealertPosition(owner,pdfForm(file));return r.status==='matched'?r.snapshot.position.reference as string:'';}
 catch(error){if(error instanceof AppError&&error.status>=500)throw error;return '';}
}

async function prealertMail(ctx:OpsContext):Promise<Outcome>{
 const given=ctx.reference(ctx.subject+'\n'+ctx.text);
 if(ctx.thread){
  // A reply can only give the position for files we could not place.
  const thread=ctx.thread,items=JSON.parse(thread.items||'[]') as Item[],open=items.filter(i=>i.pending&&!i.upload);
  if(!open.length)return {state:'ignored',note:'Pre-alert konuşmasında bekleyen belge yok.',threadId:thread.id};
  if(!given){await ctx.setThread(thread.id,'staff','Yanıtta T-MAXX pozisyon referansı yok; operasyon ekibi pozisyonu seçmeli.');return {state:'done',note:'Pozisyon verilmedi; operasyon ekibine devredildi.',threadId:thread.id};}
  for(const item of open){const object=await runtime().BUCKET.get(item.pending!);if(!object){item.error='Bekleyen PDF bulunamadı.';continue;}await uploadPrealert(ctx.owner,{name:item.name,bytes:await object.arrayBuffer(),mime:'application/pdf'},given,item);}
  await saveItems(thread.id,items);
  return finish(ctx,thread,items);
 }
 const pdfs=ctx.files.filter(f=>f.mime==='application/pdf');
 if(!pdfs.length)return {state:'ignored',note:'Pre-alert e-postasında PDF yok.'};
 const thread=await ctx.open('prealert'),items:Item[]=[];
 for(const [index,file] of pdfs.slice(0,10).entries()){
  const item:Item={name:file.name},reference=given||await positionOf(ctx.owner,file);
  if(reference)await uploadPrealert(ctx.owner,file,reference,item);
  else{const key=`mail/prealert/${thread.id}/${index}`;await runtime().BUCKET.put(key,file.bytes,{httpMetadata:{contentType:'application/pdf'}});item.pending=key;}
  items.push(item);
 }
 await saveItems(thread.id,items);
 return finish(ctx,thread,items);
}

async function finish(ctx:OpsContext,thread:OpThread,items:Item[]):Promise<Outcome>{
 const pending=items.filter(i=>i.pending&&!i.upload),failed=items.filter(i=>i.error&&!i.upload&&!i.pending);
 if(pending.length&&thread.rounds===0){
  await ctx.ask(thread,askBody(thread.tag,pending.map(i=>i.name)));
  return {state:'done',note:`${pending.length} belge için pozisyon soruldu.`,threadId:thread.id};
 }
 if(pending.length||failed.length){
  await ctx.setThread(thread.id,'staff',('Pre-alert otomatik yüklenemedi: '+[...pending.map(i=>i.name+' (pozisyon yok)'),...failed.map(i=>i.name+' ('+i.error+')')].join(' · ')).slice(0,380));
  return {state:'done',note:'Pre-alert operasyon ekibine devredildi.',threadId:thread.id};
 }
 await ctx.setThread(thread.id,'processing','Pre-alert T-MAXX arşivine aktarılıyor.');
 return {state:'done',note:`${items.length} pre-alert T-MAXX aktarım sırasına alındı.`,threadId:thread.id};
}

/** Called every intake run: tells the sender once all PDFs are in the T-MAXX archive. */
export async function confirmPrealerts(notify:(thread:OpThread,body:string)=>Promise<void>,setThread:OpsContext['setThread']){
 const {results}=await db().prepare("SELECT * FROM mail_threads WHERE kind='prealert' AND state='processing' ORDER BY updated_at LIMIT 5").all<OpThread>();
 for(const thread of results){
  const items=(JSON.parse(thread.items||'[]') as Item[]).filter(i=>i.upload);
  if(!items.length)continue;
  const rows=(await db().prepare(`SELECT d.id,d.state,d.position_reference,q.state AS queue FROM prealert_uploads d LEFT JOIN prealert_queue q ON q.document_id=d.id WHERE d.id IN (${items.map(()=>'?').join(',')})`).bind(...items.map(i=>i.upload!)).all<{id:string;state:string;position_reference:string;queue:string|null}>()).results;
  if(rows.length!==items.length||rows.some(r=>r.queue==='review')){await setThread(thread.id,'staff','Pre-alert aktarımının sonucu doğrulanamadı; Pre-alert ekranından kontrol edin.');continue;}
  if(rows.every(r=>r.state==='synced'))await notify(thread,doneBody(thread.tag,items.map(i=>({name:i.name,reference:rows.find(r=>r.id===i.upload)!.position_reference}))));
 }
}

/**
 * VGM mail (CMA CGM only, the one carrier with an automatic VGM path). The PDF is read like
 * on screen, the carrier booking comes from the subject/text (or a reply), and one CMA job per
 * container is prepared; confirmVgms submits prepared jobs and reports the carrier's result.
 */
type VgmRow={container:string;vgmKg:string;signature:string;job?:string;error?:string};
type VgmItems={booking:string;carrier:string;rows:VgmRow[];issue?:string};
export function bookingOf(text:string){
 const m=text.toUpperCase().match(/BOOKING\s*(?:NO|NUMBER|NR|NUMARASI)?\s*[:.#-]?\s*([A-Z0-9][A-Z0-9-]{5,29})/);
 return m&&/\d/.test(m[1])?m[1]:'';
}
async function readVgm(owner:string,thread:OpThread,file:OpFile,index:number):Promise<{rows:VgmRow[];issue?:string}>{
 const key=`mail/vgm/${thread.id}/${index}`,hash=await digest(file.bytes);
 await runtime().BUCKET.put(key,file.bytes,{httpMetadata:{contentType:'application/pdf'}});
 let reading;try{reading=await readVgmFile({object_key:key,hash,mime:'application/pdf',owner} as unknown as DocumentRow);}
 catch(error){if(error instanceof AppError&&error.status>=500)throw error;return {rows:[],issue:file.name+': '+(error instanceof Error?error.message:'okunamadı')};}
 if(reading.documentType!=='vgm'||!reading.rows.length)return {rows:[],issue:file.name+': VGM belgesi olarak okunamadı.'};
 const sure=(f:{value:string|null;confidence:number})=>f.value&&f.confidence>=.95?f.value.trim():'';
 const rows:VgmRow[]=[];
 for(const r of reading.rows){
  const container=sure(r.containerNumber).replace(/[\s-]/g,'').toUpperCase(),vgmKg=r.vgm.confidence>=.95?normalizeMass(r.vgm.value,r.vgm.unit):'';
  const signature=(sure(r.person)||sure(r.company)).slice(0,50);
  if(!containerValid(container)||!vgmKg||Number(vgmKg)<=0||!signature)return {rows:[],issue:`${file.name}: konteyner, VGM ağırlığı veya yetkili kişi kesin okunamadı.`};
  rows.push({container,vgmKg,signature});
 }
 return {rows};
}
async function prepareVgm(ctx:OpsContext,thread:OpThread,items:VgmItems):Promise<Outcome>{
 for(const row of items.rows){
  if(row.job)continue;
  try{
   const result=await prepareCmaJob(null,ctx.owner,{carrierBooking:items.booking,container:row.container,vgmKg:row.vgmKg,signature:row.signature,method:'',certificate:'',confirmed:true});
   row.job=result.jobs.find(j=>'booking' in j.payload&&j.payload.booking===items.booking&&j.payload.container===row.container&&j.state!=='blocked')?.id;
   if(!row.job)row.error='CMA kaydı oluşturulamadı.';
  }catch(error){if(error instanceof AppError&&error.status>=500)throw error;row.error=error instanceof Error?error.message.slice(0,200):'CMA kaydı oluşturulamadı.';}
 }
 await saveItems(thread.id,items as unknown as Item[]);
 const failed=items.rows.filter(r=>!r.job);
 if(failed.length){await ctx.setThread(thread.id,'staff',('VGM otomatik hazırlanamadı: '+failed.map(r=>r.container+' ('+(r.error||'')+')').join(' · ')).slice(0,380));return {state:'done',note:'VGM operasyon ekibine devredildi.',threadId:thread.id};}
 await ctx.setThread(thread.id,'processing',`VGM CMA CGM'e gönderilmek üzere hazırlanıyor (${items.booking}).`);
 return {state:'done',note:`${items.rows.length} konteyner için CMA VGM işi hazırlandı.`,threadId:thread.id};
}
async function vgmMail(ctx:OpsContext):Promise<Outcome>{
 const words=ctx.subject+'\n'+ctx.text;
 if(ctx.thread){
  const thread=ctx.thread,items=JSON.parse(thread.items||'{}') as VgmItems;
  if(thread.state!=='waiting_customer'||!items.rows?.length)return {state:'ignored',note:'VGM konuşmasında bekleyen bilgi yok.',threadId:thread.id};
  const booking=bookingOf(words);
  if(!booking){await ctx.setThread(thread.id,'staff','Yanıtta booking numarası yok; operasyon ekibi VGM\'yi işlemeli.');return {state:'done',note:'Booking verilmedi; operasyon ekibine devredildi.',threadId:thread.id};}
  items.booking=booking;
  return prepareVgm(ctx,thread,items);
 }
 const pdfs=ctx.files.filter(f=>f.mime==='application/pdf');
 if(!pdfs.length)return {state:'ignored',note:'VGM e-postasında PDF yok.'};
 const thread=await ctx.open('vgm');
 // Only CMA CGM has an automatic VGM path; any other carrier is handled by staff.
 if(!/\bCMA\b/i.test(words)){await ctx.setThread(thread.id,'staff','VGM yalnızca CMA CGM için otomatik gönderilebiliyor; konu veya metinde CMA yok. Operasyon ekibi işlemeli.');return {state:'done',note:'CMA dışı VGM; operasyon ekibine devredildi.',threadId:thread.id};}
 const items:VgmItems={booking:bookingOf(words),carrier:'cma-cgm',rows:[]};
 for(const [index,file] of pdfs.slice(0,5).entries()){const r=await readVgm(ctx.owner,thread,file,index);if(r.issue){items.issue=r.issue;break;}items.rows.push(...r.rows);}
 if(items.issue||!items.rows.length){await saveItems(thread.id,items as unknown as Item[]);await ctx.setThread(thread.id,'staff',('VGM okunamadı: '+(items.issue||'konteyner yok')).slice(0,380));return {state:'done',note:'VGM okunamadı; operasyon ekibine devredildi.',threadId:thread.id};}
 if(!items.booking){
  await saveItems(thread.id,items as unknown as Item[]);
  await ctx.ask(thread,vgmAskBody(thread.tag,items.rows.map(r=>r.container)));
  return {state:'done',note:'CMA booking numarası soruldu.',threadId:thread.id};
 }
 return prepareVgm(ctx,thread,items);
}

/** Called every intake run: submits prepared CMA jobs (the sender chose fully automatic) and reports. */
export async function confirmVgms(owner:string,notify:(thread:OpThread,body:string)=>Promise<void>,setThread:OpsContext['setThread']){
 const {results}=await db().prepare("SELECT * FROM mail_threads WHERE kind='vgm' AND state='processing' ORDER BY updated_at LIMIT 5").all<OpThread>();
 for(const thread of results){
  const items=JSON.parse(thread.items||'{}') as VgmItems,ids=(items.rows||[]).map(r=>r.job).filter(Boolean) as string[];
  if(!ids.length)continue;
  const jobs=(await db().prepare(`SELECT id,state,send_authorized,result FROM cma_vgm_jobs WHERE id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all<{id:string;state:string;send_authorized:number;result:string|null}>()).results;
  if(jobs.length!==ids.length){await setThread(thread.id,'staff','CMA VGM kaydı bulunamadı; VGM ekranından kontrol edin.');continue;}
  const bad=jobs.filter(j=>j.state==='blocked'||j.state==='unknown');
  if(bad.length){await setThread(thread.id,'staff',('CMA VGM gönderilemedi veya sonucu belirsiz: '+bad.map(j=>j.result||j.state).join(' · ')).slice(0,380));continue;}
  for(const j of jobs.filter(j=>j.state==='prepared'&&!j.send_authorized)){
   try{await submitCmaJob(null,owner,j.id);}catch(error){await setThread(thread.id,'staff',('CMA VGM gönderimi başlatılamadı: '+(error instanceof Error?error.message:'')).slice(0,380));}
  }
  if(jobs.every(j=>j.state==='submitted'))await notify(thread,vgmDoneBody(thread.tag,items.booking,items.rows));
 }
}

const sign='Bu e-posta otomatik olarak hazırlanmıştır.\n\nSaygılarımızla,\nCBI Transportation';
const signEn='This e-mail was generated automatically.\n\nKind regards,\nCBI Transportation';
function askBody(tag:string,names:string[]){
 return `Sayın İlgili,\n\n${tag} referanslı pre-alert e-postanız için teşekkür ederiz. Aşağıdaki belgelerin hangi T-MAXX pozisyonuna ait olduğunu belgeden tespit edemedik:\n\n${names.map((n,i)=>`${i+1}. ${n}`).join('\n')}\n\nLütfen bu e-postayı yanıtlayarak T-MAXX pozisyon referansını (örn. S.E.26.11.00123) yazınız; belgeler bu pozisyonun Pre-alert arşivine eklenecektir.\n\n${sign}\n\n----------\n\nDear Sir or Madam,\n\nThank you for your pre-alert e-mail ${tag}. We could not determine the T-MAXX position of the following documents:\n\n${names.map((n,i)=>`${i+1}. ${n}`).join('\n')}\n\nPlease reply with the T-MAXX position reference (e.g. S.E.26.11.00123); the documents will then be added to its pre-alert archive.\n\n${signEn}`;
}
function doneBody(tag:string,list:{name:string;reference:string}[]){
 return `Sayın İlgili,\n\n${tag} referanslı pre-alert belgeleriniz T-MAXX Pre-alert arşivine eklenmiştir:\n\n${list.map(l=>`- ${l.name} → ${l.reference}`).join('\n')}\n\n${sign}\n\n----------\n\nDear Sir or Madam,\n\nYour pre-alert documents (${tag}) have been added to the T-MAXX pre-alert archive:\n\n${list.map(l=>`- ${l.name} → ${l.reference}`).join('\n')}\n\n${signEn}`;
}
function vgmAskBody(tag:string,containers:string[]){
 return `Sayın İlgili,\n\n${tag} referanslı VGM e-postanız için teşekkür ederiz. VGM'yi CMA CGM'e iletebilmemiz için aşağıdaki konteyner(ler)in CMA booking numarası gerekli:\n\n${containers.map((c,i)=>`${i+1}. ${c}`).join('\n')}\n\nLütfen bu e-postayı yanıtlayarak booking numarasını yazınız (örn. Booking: ISB2086617).\n\n${sign}\n\n----------\n\nDear Sir or Madam,\n\nThank you for your VGM e-mail ${tag}. To file the VGM with CMA CGM we need the carrier booking number of:\n\n${containers.map((c,i)=>`${i+1}. ${c}`).join('\n')}\n\nPlease reply with the booking number (e.g. Booking: ISB2086617).\n\n${signEn}`;
}
function vgmDoneBody(tag:string,booking:string,rows:VgmRow[]){
 const list=rows.map(r=>`- ${r.container}: ${r.vgmKg} kg`).join('\n');
 return `Sayın İlgili,\n\n${tag} referanslı VGM bildiriminiz CMA CGM'e iletilmiştir (booking ${booking}):\n\n${list}\n\n${sign}\n\n----------\n\nDear Sir or Madam,\n\nYour VGM (${tag}) has been filed with CMA CGM (booking ${booking}):\n\n${list}\n\n${signEn}`;
}
