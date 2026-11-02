'use client';
import {OperationToast} from '@/components/operation-toast';
import {userMessage} from '@/lib/user-message';
import {BookingExtractionReview} from './booking-extraction';
import type {BookingItem} from '@/lib/operations/booking';
import { useEffect, useRef, useState } from 'react';
import { documentTypes, MAX_DOCUMENT_BYTES, type DocumentType, type OperationDocument } from '@/lib/operations/documents';
export function BookingDocuments({ bookingId, onBusyChange, onPendingChange, booking, dirty, onApplied, tmaxxRefresh=0 }: {
    bookingId: string;
    tmaxxRefresh?:number;
    booking:BookingItem; dirty:boolean; onApplied:(booking:BookingItem)=>void;
    onBusyChange: (busy: boolean) => void;
    onPendingChange: (pending: boolean) => void;
}) {
    const [documents, setDocuments] = useState<OperationDocument[]>([]), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
    const [type, setType] = useState<DocumentType>('other'), [source, setSource] = useState(''), [replaces, setReplaces] = useState(''), [file, setFile] = useState<File | null>(null);
    const [reading,setReading]=useState<OperationDocument|null>(null);
    const [erp,setErp]=useState<{linked:boolean;types:{id:number;code:string;name:string}[];jobs:{document_id:string;remote_id:number|null;verified_at:string|null;type_id:number;uncertain?:number}[]}|null>(null),[erpError,setErpError]=useState(''),[erpType,setErpType]=useState('');
    const loadErp=async()=>{const r=await fetch(`/api/bookings/${bookingId}/tmaxx`);const d=await r.json() as {error?:string;link:unknown;types:{id:number;code:string;name:string}[];jobs:{document_id:string;remote_id:number|null;verified_at:string|null;type_id:number;uncertain?:number}[]};if(!r.ok)throw new Error(d.error||'T-MAXX bağlantısı kontrol edilemedi.');setErp({linked:!!d.link,types:d.types,jobs:d.jobs});setErpError('');};
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(()=>{let current=true;setErp(null);fetch(`/api/bookings/${bookingId}/tmaxx`).then(async r=>{const d=await r.json() as {error?:string;link:unknown;types:{id:number;code:string;name:string}[];jobs:{document_id:string;remote_id:number|null;verified_at:string|null;type_id:number;uncertain?:number}[]};if(!r.ok)throw new Error(d.error);if(current){setErp({linked:!!d.link,types:d.types,jobs:d.jobs});setErpError('');}}).catch(e=>{if(current)setErpError(e.message);});return()=>{current=false;};},[bookingId,tmaxxRefresh]);
    const input = useRef<HTMLInputElement>(null);
    useEffect(() => { const controller = new AbortController(); fetch(`/api/bookings/${bookingId}/documents`, { signal: controller.signal }).then(async (r) => { const data = await r.json() as {
        documents: OperationDocument[];
        error?: string;
    }; if (!r.ok)
        throw new Error(data.error || 'Belgeler alınamadı.'); setDocuments(data.documents); }).catch(e => { if (!controller.signal.aborted)
        setError(userMessage(e)); }).finally(() => { if (!controller.signal.aborted)
        setLoading(false); }); return () => controller.abort(); }, [bookingId]);
    async function recover(document:OperationDocument){setBusy(true);onBusyChange(true);setError('');setMessage('');try{const r=await fetch(`/api/bookings/${bookingId}/tmaxx`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({documentId:document.id})}),d=await r.json() as {error?:string};if(!r.ok)throw new Error(d.error);setMessage('T-MAXX arşivindeki belge içeriği doğrulandı; yeniden gönderim yapılmadı.');}catch(e){setError(userMessage(e));}finally{await loadErp().catch(e=>setErpError(e.message));setBusy(false);onBusyChange(false);}}
    async function sendExisting(document:OperationDocument){
        const typeId=erp?.jobs.find(j=>j.document_id===document.id)?.type_id||Number(erpType);if(!typeId)return;
        setBusy(true);onBusyChange(true);setError('');setMessage('');
        try{const r=await fetch(`/api/bookings/${bookingId}/tmaxx`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({documentId:document.id,typeId})});const d=await r.json() as {error?:string};if(!r.ok)throw new Error(d.error);setMessage('Belgenin T-MAXX arşiv kaydı doğrulandı.');}catch(e){setError(userMessage(e));}finally{await loadErp().catch(e=>setErpError(e.message));setBusy(false);onBusyChange(false);}
    }
    async function upload(e: React.FormEvent) {
        e.preventDefault();
        if (!file)
            return;
        setError('');
        setMessage('');
        if (file.size > MAX_DOCUMENT_BYTES) {
            setError('Belge en fazla 10 MB olabilir.');
            return;
        }
        setBusy(true);
        onBusyChange(true);
        try {
            const body = new FormData();
            body.set('file', file);
            body.set('type', type);
            if(erp?.linked)body.set('tmaxxTypeId',erpType);
            body.set('sourceReference', source);
            if (replaces)
                body.set('replacesId', replaces);
            const response = await fetch(`/api/bookings/${bookingId}/documents`, { method: 'POST', body });
            const result = await response.json() as {
                error?: string;
                duplicate: boolean;
                documentId: string;
                tmaxx?:{status:string;message?:string;remoteId?:number};
            };
            if (!response.ok)
                throw new Error(result.error || 'Belge kaydedilemedi.');
            setFile(null);
            onPendingChange(false);
            setReplaces('');
            if (input.current)
                input.current.value = '';
            setMessage(result.tmaxx?.status==='synced'?'Belge T-MAXX arşivine kaydedildi ve doğrulandı.':result.tmaxx?.status==='pending'?'Belge saklandı; T-MAXX kaydı doğrulanamadı. '+result.tmaxx.message:result.duplicate?'Bu dosya daha önce eklenmiş. Mevcut belge korundu.':'Belge uygulama arşivine eklendi; T-MAXX dosya bağlantısı yok.');
            await loadErp();
            const refreshed = await fetch(`/api/bookings/${bookingId}/documents`);
            const data = await refreshed.json() as {
                documents: OperationDocument[];
                error?: string;
            };
            if (!refreshed.ok)
                throw new Error(data.error || 'Belge kaydedildi; liste yenilenemedi. Sayfayı yenileyin.');
            setDocuments(data.documents);
        }
        catch (e) {
            setError(userMessage(e));
        }
        finally {
            setBusy(false);
            onBusyChange(false);
        }
    }
    return <section className="booking-documents" aria-label="Operasyon belgeleri">
 <div className="handover-section-title"><div><h2>Operasyon belgeleri</h2><p>Kaynak dosyalar ve sürüm geçmişi</p></div><span>{documents.length} belge</span></div>
 <div className="booking-document-body">
 {error && <OperationToast tone="error" message={userMessage(error)}/>}{message && <OperationToast tone="auto" message={message}/>}
 {erpError&&<><OperationToast tone="error" message={erpError}/><button type="button" onClick={()=>loadErp().catch(e=>setErpError(e.message))}>Yeniden kontrol et</button></>}
 {erp?.linked&&<label>T-MAXX arşiv belge türü<select value={erpType} disabled={busy} onChange={e=>setErpType(e.target.value)}><option value="">T-MAXX türünü seçin</option>{erp.types.map(t=><option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}</select><small>Yüklediğiniz belgenin T-MAXX’teki karşılığını seçin; yerel belge sınıfıyla aynı olmak zorunda değildir.</small></label>}
 <form onSubmit={upload}><fieldset disabled={busy || loading}><legend>Belge ekle</legend>
 <div className="handover-fields"><label htmlFor="document-type">Belge türü<select id="document-type" value={type} onChange={e => setType(e.target.value as DocumentType)}>{Object.entries(documentTypes).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
 <label htmlFor="document-replaces">Sürüm ilişkisi<select id="document-replaces" value={replaces} onChange={e => { setReplaces(e.target.value); const old = documents.find(d => d.id === e.target.value); if (old)
        setType(old.type); }}><option value="">Bağımsız yeni belge</option>{documents.filter(d => d.isCurrent).map(d => <option value={d.id} key={d.id}>{d.filename} · v{d.version} yerine</option>)}</select></label></div>
 <label className="handover-notes" htmlFor="document-source">Kaynak açıklaması<input id="document-source" required maxLength={500} placeholder="Örn. taşıyıcı teyit e-postası, tarih ve konu" value={source} onChange={e => setSource(e.target.value)}/></label>
 <label className="handover-notes" htmlFor="document-file">Dosya · PDF, PNG veya JPEG · En fazla 10 MB<input ref={input} id="document-file" type="file" accept=".pdf,.png,.jpg,.jpeg" required onChange={e => { const selected = e.target.files?.[0] || null; setFile(selected); onPendingChange(!!selected); }}/></label>
 <div className="handover-save"><p>Belge türü sizin seçiminizdir; operasyon onayı anlamına gelmez.<br />Yeni sürüm eski dosyayı değiştirmez.</p><button type="submit" disabled={busy || loading || !file || !erp || (!!erp.linked&&!erpType)}>{busy ? 'Yükleniyor…' : erp?.linked?'Belgeyi T-MAXX’e kaydet':'Belgeyi ekle'}</button></div>
 </fieldset></form>
 {loading ? <p role="status">Belgeler yükleniyor…</p> : documents.length === 0 ? <p className="handover-empty">Bu devre henüz belge eklenmedi.</p> : <div className="booking-document-table"><table><caption>Belge arşivi · tüm sürümler</caption><thead><tr><th>Belge</th><th>Tür / sürüm</th><th>Kaynak</th><th>Yükleme</th></tr></thead><tbody>{documents.map(d => <tr key={d.id}><td><a href={`/api/bookings/${bookingId}/documents/${d.id}`} download>{d.filename}</a><small>{(d.size / 1024).toFixed(1)} KB</small>{erp?.linked&&<small>{erp.jobs.find(j=>j.document_id===d.id)?.verified_at?'T-MAXX kaydı doğrulandı':erp.jobs.find(j=>j.document_id===d.id)?.uncertain?'T-MAXX sonucu belirsiz; tekrar gönderim kapalı':'T-MAXX aktarımı doğrulanmadı'}</small>}{erp?.linked&&!erp.jobs.find(j=>j.document_id===d.id)?.verified_at&&<button type="button" disabled={busy||dirty||!!erp.jobs.find(j=>j.document_id===d.id)?.uncertain||(!erpType&&!erp.jobs.find(j=>j.document_id===d.id))} onClick={()=>sendExisting(d)}>T-MAXX arşivine kaydet / kontrol et</button>}{erp?.jobs.some(j=>j.document_id===d.id&&!j.verified_at)&&<button type="button" disabled={busy||dirty} onClick={()=>recover(d)}>Yeniden göndermeden arşivi kontrol et</button>}{['quote','booking_request','booking_confirmation','booking_revision'].includes(d.type)&&<button type="button" disabled={busy} onClick={()=>setReading(d)}>Bilgileri incele</button>}</td><td>{documentTypes[d.type]}<small>v{d.version} · {d.isCurrent ? 'Güncel sürüm' : 'Önceki sürüm — gönderimde kullanmayın'}</small></td><td>{d.sourceReference}</td><td>{new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(d.createdAt))}<small>{d.uploadedBy}</small></td></tr>)}</tbody></table></div>}
 {reading&&<BookingExtractionReview key={reading.id} document={documents.find(d=>d.id===reading.id)||reading} booking={booking} dirty={dirty} onApplied={onApplied} onBusyChange={value=>{setBusy(value);onBusyChange(value)}}/>}
 </div></section>;
}
