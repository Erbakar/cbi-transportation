'use client';
import {OperationToast} from '@/components/operation-toast';
import {useState} from 'react';
import {Button} from './ui/button';
export function BookingConfirmation({recordId,loads,onUploaded}:{recordId:string;loads:{goodId:number;reference:string;booking:string}[];onUploaded:()=>void}){
 const [file,setFile]=useState<File|null>(null),[target,setTarget]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const selected=loads.length===1?String(loads[0].goodId):target;
 async function upload(){if(!file||!selected)return;setBusy(true);setMessage('');try{const body=new FormData();body.append('file',file);body.append('goodId',selected);const r=await fetch(`/api/records/${recordId}/booking-confirmation`,{method:'POST',body});const data=await r.json() as {error?:string;message:string};if(!r.ok)throw Error(data.error||'Belge yüklenemedi.');setMessage(data.message);setFile(null);onUploaded();}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 if(!loads.length)return null;
 return <section className="container-card" aria-label="Booking Confirmation yükle"><h4>Booking Confirmation · Rezervasyon onayı</h4><p>Armatörden gelen onay PDF’sini ilgili yükün T-MAXX dijital arşivine ekleyin.</p>{loads.length===1?<p>Yük: <strong>{loads[0].reference}</strong>{loads[0].booking&&<> · Booking: <strong>{loads[0].booking}</strong></>}</p>:<label>İlgili yük<select value={target} disabled={busy} onChange={e=>setTarget(e.target.value)}><option value="">Yük seçin</option>{loads.map(l=><option key={l.goodId} value={l.goodId}>{l.reference} · {l.booking}</option>)}</select></label>}<label>Booking Confirmation PDF<input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={e=>setFile(e.target.files?.[0]||null)}/></label><p>Seçtiğiniz belgenin yukarıdaki yüke ait olduğunu kontrol edin. PDF · En fazla 10 MB.</p><Button disabled={busy||!file||!selected} onClick={upload}>{busy?'Yükleniyor…':'Belgeyi T-MAXX’e yükle'}</Button>{message&&<OperationToast tone="auto" message={message}/>}</section>;
}
