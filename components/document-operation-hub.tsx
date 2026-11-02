'use client';
import {OperationToast} from '@/components/operation-toast';
import {userMessage} from '@/lib/user-message';
import {useEffect,useRef,useState} from 'react';
import {Plus,RefreshCw,ArrowLeft,FileText,Scale,Trash2} from 'lucide-react';
import {useDisplayCache} from './use-display-cache';
import {useUnsavedWork} from '@/hooks/use-unsaved-work';
import type {cmaJobs} from '@/lib/server/cma-vgm-jobs';
import type {prealertList} from '@/lib/server/prealert-upload';
import type {TmaxxPositionSnapshot} from '@/lib/server/tmaxx-workspace';
import {DocumentOperationHistory} from './document-operation-history';
import '@/app/booking/booking.css';
import './document-operation-hub.css';
type VgmStatus=Awaited<ReturnType<typeof cmaJobs>>;
const labels={queued:'Ön kontrol bekliyor',preparing:'CMA kontrol ediliyor',prepared:'Gönderime hazır',submit_queued:'Gönderim sırada',submitting:'Gönderiliyor',submitted:'CMA’ya gönderildi',blocked:'Kontrol gerekiyor',unknown:'Sonuç belirsiz · Tekrar gönderilmez'};
async function request<T>(path:string,init?:RequestInit):Promise<T>{const r=await fetch(path,init),data=await r.json() as T&{error?:string};if(!r.ok)throw Error(data.error||'İşlem tamamlanamadı.');return data;}
export function DocumentOperationHub({kind,create=false}:{kind:'vgm'|'prealert';create?:boolean}){
 const title=kind==='vgm'?'VGM':'Pre-alert';
 return <div className="handover document-operation-hub"><main>
 {create&&<a className="module-back" href={'/'+kind}><ArrowLeft size={16}/>{title} kayıtlarına dön</a>}
 <div className="handover-title"><div><p>{kind==='vgm'?'CMA CGM · VGM BİLDİRİMİ':'T-MAXX · DİJİTAL ARŞİV'}</p><h1>{create?'Yeni '+title+' oluştur':title}</h1><span>{kind==='vgm'?'Konteynerin doğrulanmış brüt ağırlığını bildirin; gönderim durumunu takip edin.':'PDF belgenizi ilgili pozisyonun Pre-alert arşivine yükleyin.'}</span></div>{!create&&<a className="module-primary" href={'/'+kind+'/new'}><Plus size={17}/>Yeni {title} oluştur</a>}</div>
 {!create&&<DocumentOperationHistory kind={kind}/>}
 {kind==='vgm'?<VgmQuickWorkspace create={create}/>:<PrealertQuickWorkspace create={create}/>}
 </main></div>;
}
function VgmQuickWorkspace({create}:{create:boolean}){
 const {data,busy:loading,error:loadError,refresh}=useDisplayCache<VgmStatus>('standalone-vgm',signal=>request('/api/vgm',{signal}));
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[sendId,setSendId]=useState('');
 const [form,setForm]=useState({carrierBooking:'',container:'',vgmKg:'',signature:'',method:'',certificate:''}),[confirmed,setConfirmed]=useState(false);
 useUnsavedWork(busy||Object.values(form).some(Boolean));
 useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},15000);return()=>clearInterval(timer);},[refresh]);
 const change=(key:keyof typeof form,value:string)=>{setForm(old=>({...old,[key]:value}));setConfirmed(false);};
 async function retry(id:string){setBusy(true);setError('');try{await request('/api/vgm',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});setMessage('Mevcut kayıt yeniden kontrol ediliyor. Yeni kayıt veya gönderim oluşturulmadı.');await refresh();}catch(e){setError(userMessage(e));}finally{setBusy(false);}}
 async function remove(id:string){setBusy(true);setError('');try{await request('/api/vgm',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});setMessage('Gönderilmemiş kayıt listeden silindi. CMA kayıtları değiştirilmedi.');await refresh();}catch(e){setError(userMessage(e));}finally{setBusy(false);}}
 async function act(method:'POST'|'PUT',body:object,path='/api/vgm'){setBusy(true);setError('');setMessage('');try{await request(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(method==='POST'){setForm({carrierBooking:'',container:'',vgmKg:'',signature:'',method:'',certificate:''});setConfirmed(false);setMessage('VGM kaydedildi. Arka planda CMA form kontrolü yapılacak. Sonucu aşağıdan takip edebilirsiniz.');}else setMessage('Gönderim sıraya alındı. Sonuç CMA’dan doğrulanacak.');setSendId('');await refresh();}catch(e){setError(userMessage(e));}finally{setBusy(false);}}
 return <>
 {create&&<section className="quick-document-card"><div className="quick-card-heading"><Scale size={24}/><div><h2>VGM bilgileri</h2><p>Her kayıt bir konteyner içindir. Ağırlığı kilogram olarak girin.</p></div></div>
 <form onSubmit={e=>{e.preventDefault();void act('POST',{...form,confirmed});}}><fieldset disabled={busy}><div className="quick-fields">
 <label>Armatör booking numarası<input required maxLength={30} value={form.carrierBooking} onChange={e=>change('carrierBooking',e.target.value)} autoComplete="off" placeholder="Ör. ISB…"/></label>
 <label>Konteyner numarası<input required maxLength={11} value={form.container} onChange={e=>change('container',e.target.value.toUpperCase())} placeholder="4 harf ve 7 rakam" autoComplete="off"/></label>
 <label>VGM ağırlığı (kg)<input required inputMode="decimal" value={form.vgmKg} onChange={e=>change('vgmKg',e.target.value)} placeholder="Ör. 23110"/><small>Konteyner darası dahil toplam ağırlık. Ondalık için nokta kullanın.</small></label>
 <label>İmzalayan yetkili<input required maxLength={50} value={form.signature} onChange={e=>change('signature',e.target.value)} placeholder="Adı ve soyadı"/></label>
 </div><details className="quick-extra"><summary>Ek bilgiler · gerekiyorsa</summary><div className="quick-fields"><label>Tartım yöntemi<select value={form.method} onChange={e=>change('method',e.target.value)}><option value="">Belirtilmedi</option><option value="SM1">SM1 · Dolu konteyner tartımı</option><option value="SM2">SM2 · Bileşen ağırlıkları toplamı</option></select></label><label>Sertifika numarası<input maxLength={50} value={form.certificate} onChange={e=>change('certificate',e.target.value)}/></label></div></details>
 <label className="quick-confirm"><input required type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>VGM ağırlığını ve bu konteynere ait bilgileri kontrol ettim.</label>
 <button className="module-primary" disabled={busy||!confirmed}>{busy?'Kaydediliyor…':'VGM oluştur ve kontrol et'}</button>
 <p className="quick-help">Ön kontrolden sonra gönderimi bu sayfadan onaylayabilirsiniz. Armatör ek bilgi isterse kontrol sonucu burada gösterilir.</p>
 </fieldset></form></section>}
 {(error||loadError)&&<OperationToast tone="error" message={userMessage(error||loadError)}/>}{message&&<OperationToast tone="auto" message={message}/>}
 <section className="handover-list"><div className="handover-section-title"><div><h2>{create?'İşlem durumu':'Platformdan oluşturulan VGM kayıtları'}</h2><p>{data&&!data.enabled?'CMA otomatik gönderimi son bağlantı doğrulaması tamamlanana kadar kapalıdır. Kayıt ve ön kontrol yapılabilir.':'Ön kontrol ve gönderim sonuçlarını buradan takip edin.'}</p></div><button aria-label="VGM kayıtlarını yenile" disabled={loading} onClick={()=>void refresh()}><RefreshCw size={17}/></button></div>
 {data&&!data.agentOnline&&<p className="quick-help">CMA arka plan bağlantısı şu anda çevrimdışı. Kayıtlar bağlantı geldiğinde kontrol edilir. <a href="/connections">Bağlantı ayarları</a></p>}
 {loading&&!data&&<p role="status">Kayıtlar yükleniyor…</p>}
 {data?.jobs.map(job=><article className="quick-job" key={job.id}><div className="quick-job-info"><h3>{job.payload.booking} <span>· {job.payload.container}</span></h3><p>{job.payload.vgmKg} kg · {job.payload.signature}</p><strong>{labels[job.state]}</strong>{job.result&&<p>{userMessage(job.result)}</p>}</div>
 <div className="quick-job-actions">{!job.bookingId&&job.state==='blocked'&&<button className="quick-action" type="button" disabled={busy} onClick={()=>void retry(job.id)}><RefreshCw size={15} aria-hidden="true"/>Yeniden kontrol et</button>}{!job.bookingId&&['queued','blocked','prepared'].includes(job.state)&&<button className="quick-action quick-action-delete" type="button" disabled={busy} onClick={()=>void remove(job.id)}><Trash2 size={15} aria-hidden="true"/>Kaydı sil</button>}{job.state==='prepared'&&data.enabled&&<div><label className="quick-confirm"><input type="checkbox" checked={sendId===job.id} onChange={e=>setSendId(e.target.checked?job.id:'')}/>CMA CGM’ye göndermeyi onaylıyorum.</label><button className="module-primary" disabled={busy||!data.agentOnline||sendId!==job.id} onClick={()=>void act('PUT',{id:job.id,confirmed:true},job.bookingId?'/api/bookings/'+job.bookingId+'/vgm/cma':'/api/vgm')}>VGM gönder</button></div>}</div></article>)}
 {data&&!data.jobs.length&&<p className="handover-empty">Henüz platformdan oluşturulmuş VGM kaydı yok.{!create&&' Yeni VGM oluştur düğmesiyle başlayabilirsiniz.'}</p>}
 </section></>;
}
function PrealertQuickWorkspace({create}:{create:boolean}){
 const {data,busy:loading,error:loadError,refresh}=useDisplayCache<{documents:Awaited<ReturnType<typeof prealertList>>}>('standalone-prealert',signal=>request('/api/prealert',{signal}));
 const [reference,setReference]=useState(''),[position,setPosition]=useState<(TmaxxPositionSnapshot&{cached?:boolean})|null>(null),[file,setFile]=useState<File|null>(null),[fileKey,setFileKey]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [detecting,setDetecting]=useState(false),[positionMessage,setPositionMessage]=useState('');
 const [messageDocumentId,setMessageDocumentId]=useState('');
 const completedDocument=data?.documents.find(doc=>doc.id===messageDocumentId&&doc.state==='synced');
 const currentMessage=message&&completedDocument?userMessage(completedDocument.message||'PDF, T-MAXX Pre-alert arşivine kaydedildi ve geri okunarak doğrulandı.'):message;
 const selection=useRef(0),detection=useRef<AbortController|null>(null),manualPosition=useRef(false);
 useEffect(()=>()=>{selection.current++;detection.current?.abort();},[]);
 useUnsavedWork(busy||!!file);
 useEffect(()=>{if(!data?.documents.some(d=>d.state!=='synced'&&d.queue_state))return;const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},30000);return()=>clearInterval(timer);},[data,refresh]);
 function cancelDetection(){selection.current++;detection.current?.abort();detection.current=null;setDetecting(false);}
 async function selectFile(next:File|null){
  cancelDetection();const selected=selection.current;
  setFile(next);setError('');setMessage('');setMessageDocumentId('');setPositionMessage('');
  // Preserve the existing manual-first workflow only for the first file in a
  // selection. Replacing a file always clears its previous inferred target.
  if(next&&!file&&manualPosition.current&&position&&!position.position.locked){setPositionMessage('Elle seçilen pozisyon kullanılacak.');return;}
  manualPosition.current=false;setReference('');setPosition(null);
  if(!next)return;
  if(next.size>10*1024*1024||!next.size){setError('En fazla 10 MB boyutunda bir PDF seçin.');return;}
  const controller=new AbortController();detection.current=controller;setDetecting(true);
  try{
   const form=new FormData();form.set('file',next);
   const result=await request<{status:'matched'|'manual';snapshot?:TmaxxPositionSnapshot;message:string}>('/api/prealert/position',{method:'POST',body:form,signal:controller.signal});
   if(selected!==selection.current||controller.signal.aborted)return;
   if(result.status==='matched'&&result.snapshot){setPosition(result.snapshot);setReference(result.snapshot.position.reference);}
   setPositionMessage(result.message);
  }catch(e){if(selected===selection.current&&!controller.signal.aborted)setPositionMessage(userMessage(e)+' Pozisyon numarasını elle girerek devam edebilirsiniz.');}
  finally{if(selected===selection.current){setDetecting(false);detection.current=null;}}
 }
 async function lookup(){cancelDetection();manualPosition.current=false;setPositionMessage('');setBusy(true);setError('');setPosition(null);try{setPosition(await request('/api/prealert/position?reference='+encodeURIComponent(reference.trim())));manualPosition.current=true;}catch(e){setError(userMessage(e));}finally{setBusy(false);}}
 async function upload(){if(!file||!position||detecting||busy)return;setBusy(true);setError('');setMessage('');setMessageDocumentId('');try{const form=new FormData();form.set('reference',position.position.reference);form.set('file',file);const result=await request<{id:string;archive:{status:string;message?:string;matchedExisting?:boolean}}>('/api/prealert',{method:'POST',body:form});setMessageDocumentId(result.id);setMessage(result.archive.status==='synced'?(result.archive.matchedExisting?'PDF, T-MAXX’teki mevcut Pre-alert ile eşleştirildi. Yeniden yüklenmedi.':'PDF, T-MAXX Pre-alert arşivine kaydedildi ve geri okunarak doğrulandı.'):result.archive.message||'PDF kaydedildi. Otomatik aktarım bekleniyor.');setFile(null);setFileKey(k=>k+1);setPositionMessage('');manualPosition.current=false;await refresh();}catch(e){setError(userMessage(e));}finally{setBusy(false);}}
 async function check(id:string){setBusy(true);setError('');try{const result=await request<{archive:{status:string;message?:string;matchedExisting?:boolean}}>('/api/prealert',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});setMessageDocumentId(id);setMessage(result.archive.status==='synced'?'T-MAXX arşiv kaydı doğrulandı.':result.archive.message||'Aktarım doğrulanamadı.');await refresh();}catch(e){setError(userMessage(e));}finally{setBusy(false);}}
 return <>
 {create&&<section className="quick-document-card"><div className="quick-card-heading"><FileText size={24}/><div><h2>Pre-alert PDF yükle</h2><p>Önce PDF’yi seçin. Belgedeki konşimento bilgileriyle T-MAXX pozisyonu otomatik bulunur. Kaydetme onayından sonra aktarım sayfa kapalıyken de devam eder.</p></div></div>
 <label className="quick-upload">Pre-alert belgesi<input key={fileKey} type="file" accept=".pdf,application/pdf" disabled={busy} onChange={e=>void selectFile(e.target.files?.[0]??null)}/><small>Tek PDF · En fazla 10 MB</small></label>
 {detecting&&<p className="quick-help" role="status">PDF okunuyor, T-MAXX pozisyonu aranıyor…</p>}
 {positionMessage&&<OperationToast tone="auto" message={positionMessage}/>}
 <form onSubmit={e=>{e.preventDefault();void lookup();}} className="quick-position"><label>T-MAXX pozisyon numarası<input required disabled={busy} value={reference} onChange={e=>{cancelDetection();setReference(e.target.value);setPosition(null);setPositionMessage('');}} placeholder={detecting?'Belgeden bulunuyor…':'Otomatik bulunur; isterseniz elle girin'}/></label><button className="module-secondary" disabled={busy||!reference.trim()}>{busy?'İşleniyor…':'Pozisyonu bul'}</button></form>
 {position&&<div className="quick-position-result"><strong>{position.position.reference}</strong><p>{position.position.vessel} · {position.position.loadPort} → {position.position.dischargePort}</p>{position.cached&&<OperationToast tone="warning" message="T-MAXX’e şu anda bağlanılamıyor. Son doğrulanan pozisyon gösteriliyor. PDF’yi kaydedebilirsiniz; aktarım öncesinde pozisyon yeniden kontrol edilecek."/>}{position.position.locked&&<OperationToast tone="warning" message="Bu pozisyon kilitli; belge yüklenemez."/>}</div>}
 <form onSubmit={e=>{e.preventDefault();void upload();}}><fieldset disabled={busy||detecting||!position||position.position.locked}><button className="module-primary" disabled={!file||busy||detecting}>PDF kaydet ve otomatik aktar</button></fieldset></form>
 </section>}
 {(error||loadError)&&<OperationToast tone="error" message={userMessage(error||loadError)}/>}{currentMessage&&<OperationToast tone="auto" message={currentMessage}/>}
 <section className="handover-list"><div className="handover-section-title"><h2>Pre-alert belgeleriniz</h2><button disabled={loading} aria-label="Pre-alert kayıtlarını yenile" onClick={()=>void refresh()}><RefreshCw size={17}/></button></div>
 {loading&&!data&&<p role="status">Belgeler yükleniyor…</p>}
 <div className="module-table-scroll"><table className="module-table"><thead><tr><th>Belge / pozisyon</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>{data?.documents.map(doc=><tr key={doc.id}><td><strong>{doc.filename}</strong><small>{doc.position_reference}</small></td><td>{doc.state==='synced'?'T-MAXX arşivinde':doc.queue_state==='processing'?'Aktarılıyor':doc.queue_state==='review'?'Arşiv kaydı kontrol ediliyor':doc.queue_state?'Otomatik aktarım bekliyor':'Aktarım doğrulanmalı'}{(doc.queue_state||doc.message)&&<small>{userMessage(doc.queue_message||(doc.queue_state&&doc.state!=='synced'?'PDF güvenle kaydedildi. Aktarım otomatik kontrol ediliyor.':doc.message))}</small>}{doc.state!=='synced'&&!!doc.next_attempt_at&&<small>Planlanan kontrol: {new Date(Math.ceil(doc.next_attempt_at/300000)*300000).toLocaleString('tr-TR')}</small>}</td><td><a href={'/api/prealert/file?id='+doc.id} download>PDF indir</a>{doc.state!=='synced'&&<button disabled={busy} onClick={()=>void check(doc.id)}>Yeniden kontrol iste</button>}</td></tr>)}</tbody></table></div>
 {data&&!data.documents.length&&<p className="handover-empty">Henüz eklenmiş Pre-alert yok.{!create&&' Yeni Pre-alert oluştur düğmesiyle PDF yükleyebilirsiniz.'}</p>}
 </section></>;
}
