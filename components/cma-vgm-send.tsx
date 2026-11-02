'use client';
import {OperationToast} from '@/components/operation-toast';
import {userMessage} from '@/lib/user-message';
import {useCallback,useEffect,useState} from 'react';
import {useUnsavedWork} from '@/hooks/use-unsaved-work';
import type {cmaJobs} from '@/lib/server/cma-vgm-jobs';
import type {vgmWorkspace} from '@/lib/server/vgm';
type Status=Awaited<ReturnType<typeof cmaJobs>>;
const labels={queued:'Ön kontrol bekliyor',preparing:'CMA kontrol ediliyor',prepared:'Gönderim onayı bekliyor',submit_queued:'Gönderim sırada',submitting:'Gönderiliyor',submitted:'CMA’ya gönderildi',blocked:'Kontrol gerekiyor',unknown:'Sonuç belirsiz · Tekrar gönderilmez'};
export function CmaVgmSend({bookingId,workspace,disabled}:{bookingId:string;workspace:Awaited<ReturnType<typeof vgmWorkspace>>;disabled:boolean}){
 const [data,setData]=useState<Status|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [approvalId,setApproval]=useState(''),[carrierBooking,setBooking]=useState(''),[signature,setSignature]=useState(''),[method,setMethod]=useState(''),[certificate,setCertificate]=useState(''),[confirmed,setConfirmed]=useState(false),[sendId,setSendId]=useState('');
 const path='/api/bookings/'+bookingId+'/vgm/cma';
 useUnsavedWork(busy||!!carrierBooking||!!signature||!!sendId);
 const load=useCallback(async()=>{try{const r=await fetch(path,{cache:'no-store'}),d=await r.json() as Status&{error?:string};if(!r.ok)throw Error(d.error||'Gönderim durumu yüklenemedi.');setData(d);setError('');}catch(e){setError(userMessage(e));}},[path]);
 // Synchronize the authenticated job list; updates occur after the network response.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(()=>{void load();const t=setInterval(()=>{if(document.visibilityState==='visible')void load();},15000);return()=>clearInterval(t);},[load]);
 async function act(method:'POST'|'PUT',body:object){setBusy(true);setError('');try{const r=await fetch(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),d=await r.json() as Status&{error?:string};if(!r.ok)throw Error(d.error||'İşlem tamamlanamadı.');setData(d);setSendId('');if(method==='POST'){setBooking('');setSignature('');setCertificate('');setConfirmed(false);setApproval('');setMethod('');}}catch(e){setError(userMessage(e));}finally{setBusy(false);}}
 const approvals=workspace.approvals.filter((a,i)=>!a.revoked_at&&!a.stale&&!workspace.approvals.slice(0,i).some(n=>n.container_number===a.container_number));
 return <section className="schedule-panel"><h2>CMA CGM’ye VGM gönderimi</h2><p>Onaylı konteyneri seçin, armatör booking numarasını ve imza bilgilerini kontrol edin. Şirket hesabıyla bağlantı ve form kontrolü arka planda yapılır.</p>
 <p>{data?.agentOnline?'Arka plan bağlantısı hazır.':'Arka plan bağlantısı bekleniyor. Şirket bilgisayarında Chrome ve güncel CBI bağlantı eklentisi açık olmalı.'} {data&&!data.enabled?'Otomatik gönderim kabul kontrolleri tamamlanana kadar kapalıdır; ön kontrol yapılabilir.':''}</p>
 {error&&<OperationToast tone="error" message={userMessage(error)}/>}
 <form onSubmit={e=>{e.preventDefault();void act('POST',{approvalId,carrierBooking,signature,method,certificate,confirmed});}}><fieldset disabled={busy||disabled} style={{border:0,padding:0}}><div className="schedule-fields">
 <label>Onaylı konteyner<select required value={approvalId} onChange={e=>{setApproval(e.target.value);setConfirmed(false);}}><option value="">Konteyner seçin</option>{approvals.map(a=><option key={a.id} value={a.id}>{a.container_number} · {a.snapshot.values.vgmKg} kg</option>)}</select></label>
 <label>Armatör booking numarası<input required maxLength={30} value={carrierBooking} onChange={e=>{setBooking(e.target.value);setConfirmed(false);}} placeholder="Ör. ISB…"/></label>
 <label>İmzalayan yetkili kişi<input required maxLength={50} value={signature} onChange={e=>{setSignature(e.target.value);setConfirmed(false);}}/></label>
 <label>Tartım yöntemi<select required value={method} onChange={e=>{setMethod(e.target.value);setConfirmed(false);}}><option value="">Yöntem seçin</option><option value="SM1">SM1</option><option value="SM2">SM2</option></select></label>
 <label>Sertifika numarası · varsa<input maxLength={50} value={certificate} onChange={e=>{setCertificate(e.target.value);setConfirmed(false);}}/></label></div>
 <label><input required type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> Booking, konteyner, tartım yöntemi ve imzalayan bilgilerini kaynak belgeyle kontrol ettim.</label>
 <button disabled={!confirmed||!data?.agentOnline||!data?.credentialsSaved||!approvals.length}>CMA’da gönderim ön kontrolü yap</button></fieldset></form>
 {data?.jobs.map(job=><article key={job.id} className="field-container"><h3>{job.payload.booking} · {job.payload.container}</h3><p>{job.payload.vgmKg} kg · {job.payload.method} · {job.payload.signature}</p><strong>{labels[job.state]}</strong><p>{userMessage(job.result)}</p>{job.state==='prepared'&&data.enabled&&<><label><input type="checkbox" checked={sendId===job.id} disabled={busy||disabled} onChange={e=>setSendId(e.target.checked?job.id:'')}/> Bu VGM’yi CMA CGM’ye göndermeyi onaylıyorum.</label><button disabled={busy||disabled||!data.agentOnline||sendId!==job.id} onClick={()=>void act('PUT',{id:job.id,confirmed:true})}>VGM’yi CMA CGM’ye gönder</button></>}</article>)}
 </section>;
}
