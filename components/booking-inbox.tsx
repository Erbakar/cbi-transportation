'use client';
import {OperationToast} from '@/components/operation-toast';
import {userMessage} from '@/lib/user-message';
/* eslint-disable @next/next/no-html-link-for-pages */
import {InboxTmaxxTransfer,type InboxTmaxxState} from './booking-inbox-tmaxx';
import { useCallback, useEffect, useState } from 'react';
import { useUnsavedWork } from '@/hooks/use-unsaved-work';
import type { BookingExtraction } from '@/lib/operations/booking-extraction';
import type { MatchCandidate } from '@/lib/operations/booking-phase2';
import type { BookingItem } from '@/lib/operations/booking';
import type { OperationDocument } from '@/lib/operations/documents';
import { documentTypes } from '@/lib/operations/documents';
import '@/app/booking/booking.css';
type Item = {
    id: string;
    filename: string;
    status: string;
    bookingId: string | null;
    documentId: string | null;
    extraction: BookingExtraction | null;
    tmaxx:InboxTmaxxState|null;
    match: null | {
        candidates: MatchCandidate[];
        automaticId: string | null;
    };
};
export function BookingInbox() {
    const [items, setItems] = useState<Item[]>([]), [bookings, setBookings] = useState<BookingItem[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [file, setFile] = useState<File | null>(null), [source, setSource] = useState(''), [selected, setSelected] = useState(''), [target, setTarget] = useState(''), [reason, setReason] = useState(''), [previous, setPrevious] = useState(''), [docs, setDocs] = useState<OperationDocument[]>([]), [reference, setReference] = useState('');
    const [message,setMessage]=useState('');
    useUnsavedWork(busy || !!file || !!reason);
    const load = useCallback(async () => { const r = await fetch('/api/bookings/inbox'), d = await r.json() as {
        items: Item[];
        error?: string;
    }; if (!r.ok)
        throw new Error(d.error); setItems(d.items); }, []);
    // Initial load reads authenticated server state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { void load().catch(e => setError(userMessage(e))); fetch('/api/bookings').then(async (r) => { const d = await r.json() as {
        bookings: BookingItem[];
        error?: string;
    }; if (!r.ok)
        throw new Error(d.error); setBookings(d.bookings); }).catch(e => setError(userMessage(e))); }, [load]);
    async function act(body: object) { setBusy(true); setError('');setMessage(''); try {
        const r = await fetch('/api/bookings/inbox', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), d = await r.json() as {
            items: Item[];
            transfer?:{status:string;recovered?:boolean};
            error?: string;
        };
        if (!r.ok)
            throw new Error(d.error);
        setItems(d.items);
        if(d.transfer?.status==='synced')setMessage(d.transfer.recovered?'Arşivdeki belge içeriği doğrulandı. Belge yeniden gönderilmedi.':'Belge T-MAXX arşivine kaydedildi ve doğrulandı.');
        setReason('');
        setSelected('');
    }
    catch (e) {
        setError(userMessage(e));
        await load().catch(() => { });
    }
    finally {
        setBusy(false);
    } }
    async function upload(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); if (!file)
        return; const form = e.currentTarget; setBusy(true); setError(''); try {
        const body = new FormData();
        body.set('file', file);
        body.set('sourceReference', source);
        const r = await fetch('/api/bookings/inbox', { method: 'POST', body }), d = await r.json() as {
            id: string;
            error?: string;
        };
        if (!r.ok)
            throw new Error(d.error);
        setFile(null);
        setSource('');
        form.reset();
        await load();
        await act({ action: 'read', id: d.id });
    }
    catch (e) {
        setError(userMessage(e));
    }
    finally {
        setBusy(false);
    } }
    async function pick(id: string) { setTarget(id); setPrevious(''); setDocs([]); if (!id)
        return; setBusy(true); try {
        const r = await fetch(`/api/bookings/${id}/documents`), d = await r.json() as {
            documents: OperationDocument[];
            error?: string;
        };
        if (!r.ok)
            throw new Error(d.error);
        setDocs(d.documents);
    }
    catch (e) {
        setError(userMessage(e));
    }
    finally {
        setBusy(false);
    } }
    async function lookup() { setBusy(true); setError(''); try {
        const r = await fetch('/api/bookings/lookup?reference=' + encodeURIComponent(reference)), d = await r.json() as {
            booking: BookingItem;
            error?: string;
        };
        if (!r.ok)
            throw new Error(d.error);
        setBookings(prev => [d.booking, ...prev.filter(b => b.id !== d.booking.id)]);
        await pick(d.booking.id);
    }
    catch (e) {
        setError(userMessage(e));
    }
    finally {
        setBusy(false);
    } }
    const item = items.find(i => i.id === selected);
    return <div className="handover"><main><a href="/booking" className="module-back">← Booking devirleri</a><div className="handover-title"><div><p>BOOKING BELGELERİ</p><h1>Gelen belgeler</h1><span>Belgeyi yükleyin; ilgili devirle eşleştirin.</span></div></div>{error && <OperationToast tone="error" message={userMessage(error)}/>}{message&&<OperationToast tone="auto" message={message}/>}<section className="booking-documents"><div className="booking-document-body"><form onSubmit={upload}><fieldset disabled={busy}><legend>Yeni belge</legend><label>Kaynak açıklaması<input required maxLength={500} value={source} onChange={e => setSource(e.target.value)}/></label><label>PDF, PNG veya JPEG · En fazla 10 MB<input type="file" accept=".pdf,.png,.jpg,.jpeg" required onChange={e => setFile(e.target.files?.[0] || null)}/></label><button disabled={!file || busy}>Yükle, oku ve eşleştir</button></fieldset></form><p>Kesin referansla eşleşen teyit devre bağlanır. Revizyonlarda önceki belgeyi siz seçersiniz. Devre bağlanması T-MAXX aktarımı değildir; hedef yükü ve T-MAXX belge türünü kontrol ederek aktarın.</p><button type="button" disabled={busy} onClick={()=>{setBusy(true);load().catch(e=>setError(userMessage(e))).finally(()=>setBusy(false));}}>Listeyi yenile</button><div className="booking-document-table"><table><thead><tr><th>Belge</th><th>Durum</th><th>Eşleşme</th><th>T-MAXX arşivi</th><th>İşlem</th></tr></thead><tbody>{items.map(i => <tr key={i.id}><td><a href={`/api/bookings/inbox?id=${i.id}`} download>{i.filename}</a><small>{i.extraction ? documentTypes[i.extraction.documentType] : ''}</small></td><td>{i.status === 'attached' ? 'Devre bağlandı' : i.status === 'ready' ? 'Eşleştirme bekliyor' : i.status === 'reading' ? 'Okunuyor' : 'Okuma bekliyor'}</td><td>{i.match?.candidates.map(c => <small key={c.id}>{c.reference} · {c.reasons.join(', ')}{c.conflicts.length ? ' · Uyuşmazlık: ' + c.conflicts.join(', ') : ''}</small>)}</td><td>{i.tmaxx&&i.bookingId?<InboxTmaxxTransfer state={i.tmaxx} bookingId={i.bookingId} busy={busy||!!selected} onAction={(action,typeId)=>act({action,id:i.id,...(typeId?{typeId}:{})})}/>:<small>Önce booking dosyasıyla eşleştirin.</small>}</td><td>{i.bookingId ? <a href={'/booking/' + i.bookingId}>Devri aç →</a> : i.extraction ? <button disabled={busy} onClick={() => { setSelected(i.id); setTarget(''); setDocs([]); setReason(''); }}>Eşleştir</button> : <button disabled={busy} onClick={() => act({ action: 'read', id: i.id })}>Oku / yeniden dene</button>}</td></tr>)}</tbody></table></div>{!items.length && <p>Henüz gelen belge yok.</p>}
 {item && <fieldset disabled={busy}><legend>{item.filename} · Kaynak kontrolü</legend><p>Referansları ve bu belgenin seçtiğiniz devre ait olduğunu kontrol edin.</p>{Object.entries(item.extraction?.references || {}).map(([key, v]) => v && <p key={key}>{key}: <strong>{v.value}</strong><small> · {v.source} · s. {v.page}</small></p>)}{item.extraction?.issues.map((v, i) => <p key={i}>{v}</p>)}<label>Booking devri<select value={target} onChange={e => pick(e.target.value)}><option value="">Devir seçin</option>{Array.from(new Map([...bookings.map(b => ({ id: b.id, reference: b.draft.salesReference })), ...(item.match?.candidates || [])].map(b => [b.id, b])).values()).map(b => <option key={b.id} value={b.id}>{b.reference}</option>)}</select></label><label>Listede olmayan eski devir için tam satış referansı<input value={reference} onChange={e => setReference(e.target.value)}/></label><button type="button" onClick={lookup} disabled={!reference.trim()}>Referansla bul</button>{item.extraction?.documentType === 'booking_revision' && <label>Yerine geçtiği belge<select value={previous} onChange={e => setPrevious(e.target.value)}><option value="">Önceki belgeyi seçin</option>{docs.filter(d => d.isCurrent && ['booking_confirmation', 'booking_revision'].includes(d.type)).map(d => <option value={d.id} key={d.id}>{d.filename} · v{d.version}</option>)}</select></label>}<label>Kontrol gerekçesi<textarea maxLength={1000} value={reason} onChange={e => setReason(e.target.value)}/></label><button disabled={!target || reason.trim().length < 15 || (item.extraction?.documentType === 'booking_revision' && !previous)} onClick={() => act({ action: 'attach', id: item.id, bookingId: target, reason, replacesId: previous || null })}>Kontrol ettim, devre bağla</button><button onClick={() => { setSelected(''); setReason(''); }}>Vazgeç</button></fieldset>}</div></section></main></div>;
}
