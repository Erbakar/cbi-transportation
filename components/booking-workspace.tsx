'use client';
import {OperationToast} from '@/components/operation-toast';
import {userMessage} from '@/lib/user-message';
import {useWorkspaceUser} from './workspace-session';
import {readDisplayCache,writeDisplayCache,displayCacheGeneration} from '@/lib/workspace-cache';
import {RecentPlatformDocuments} from './recent-platform-documents';
import {BookingTmaxxEditor} from './booking-tmaxx-editor';
import {BookingTmaxxLinkPanel} from './booking-tmaxx-link';
import {TmaxxPositionPanel} from './tmaxx-position-panel';
import {BookingPrealertStatus} from './booking-prealert-status';
/* Full-page links preserve the native guard for unsaved forms and attachments. */
/* eslint-disable @next/next/no-html-link-for-pages */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUnsavedWork } from '@/hooks/use-unsaved-work';
import { ArrowLeft, Plus, RefreshCw, Check, AlertCircle } from 'lucide-react';
import { assessBooking, bookingFields, supplementaryBookingFields, emptyBooking, type BookingDraft, type BookingItem } from '@/lib/operations/booking';
import '@/app/booking/booking.css';
import {BookingSchedule} from '@/components/booking-schedule';
import {BookingCommercial} from '@/components/booking-commercial';
import {lifecycleLabels} from '@/lib/operations/booking-phase2';
import {BookingDocuments} from '@/components/booking-documents';
const options = { equipmentType: ['20GP', '40GP', '40HC', '20RF', '40RF'], incoterm: ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'], freightPayment: ['prepaid', 'collect'] };
export function BookingWorkspace({ mode = 'list', bookingId }: { mode?: 'list' | 'create' | 'edit'; bookingId?: string }) {
    const {username}=useWorkspaceUser();
    const router = useRouter();
    const [includeTests,setIncludeTests]=useState(false);
    const [items, setItems] = useState<BookingItem[]>([]), [draft, setDraft] = useState<BookingDraft>({ ...emptyBooking });
    const [active, setActive] = useState<BookingItem | null>(null), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [query, setQuery] = useState(''), [dirty, setDirty] = useState(false), [authorized, setAuthorized] = useState(false);
    const [documentBusy,setDocumentBusy]=useState(false),[documentPending,setDocumentPending]=useState(false);
    const [commercialPending,setCommercialPending]=useState(false),[commercialBusy,setCommercialBusy]=useState(false),[evidenceKey,setEvidenceKey]=useState(0),[statuses,setStatuses]=useState<Record<string,string>>({});
    const [tmaxxRefresh,setTmaxxRefresh]=useState(0),[erpBusy,setErpBusy]=useState(false),[erpPending,setErpPending]=useState(false);
    const [documentFields, setDocumentFields] = useState<string[]>([]);
    const changedFields = active ? [...[...bookingFields, ...supplementaryBookingFields].map(([key]) => key), 'notes' as const].filter(key => draft[key] !== active.draft[key]) : [];
    function edit<K extends keyof BookingDraft>(key: K, value: BookingDraft[K]) {
        const next = { ...draft, [key]: value };
        setDraft(next);
        setDirty(!active || Object.keys(next).some(k => next[k as keyof BookingDraft] !== active.draft[k as keyof BookingDraft]));
        setMessage('');
    }
    const load = useCallback(async () => { const epoch=displayCacheGeneration(); setLoading(true); setError(''); if(mode==='list'){const cached=readDisplayCache<BookingItem[]>(username,'booking-list:'+includeTests);setItems(cached?.value??[]);} try {
        const r = await fetch('/api/bookings' + (bookingId ? '?id=' + encodeURIComponent(bookingId) : '?hideTests='+String(!includeTests)));
        if (r.status === 401) {
            setAuthorized(false);
            throw new Error('Booking devirlerini görmek için hesabınıza giriş yapın.');
        }
        const d = await r.json() as {
            error?: string;
            bookings: BookingItem[];
        };
        if (!r.ok)
            throw new Error(d.error);
        setAuthorized(true);
        setItems(d.bookings);if(mode==='list')writeDisplayCache(username,'booking-list:'+includeTests,d.bookings,epoch);
        const statusResponse=await fetch('/api/bookings/status');
        if(statusResponse.ok)setStatuses(((await statusResponse.json()) as {statuses:Record<string,string>}).statuses);
        if (bookingId) {
            const item = d.bookings.find(i => i.id === bookingId);
            if (!item) throw new Error('Devir kaydı bulunamadı.');
            setActive(item); setDraft(item.draft);
        }
    }
    catch (e) {
        setError(userMessage(e));
    }
    finally {
        setLoading(false);
    } }, [bookingId,includeTests,mode,username]);
    // Initial load synchronizes the screen with the authenticated server session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { void load(); }, [load]);
    useUnsavedWork(erpBusy || erpPending || dirty || documentPending || saving || documentBusy || commercialBusy || commercialPending || commercialBusy);
    const assessment = assessBooking(draft);
    async function save(e: React.FormEvent) { e.preventDefault(); setSaving(true); setError(''); setMessage(''); try {
        const r = await fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(active ? { id: active.id, revision: active.revision } : {}), draft }) });
        const data = await r.json() as {
            error?: string;
            booking: BookingItem;
        };
        if (!r.ok)
            throw new Error(data.error);
        setDocumentFields(previous => previous.filter(key => !changedFields.includes(key as typeof changedFields[number])));
        setActive(data.booking);
        setDraft(data.booking.draft);
        setItems(previous => [data.booking, ...previous.filter(i => i.id !== data.booking.id)]);
        setDirty(false);
        setMessage('Devir kaydedildi. T-MAXX’a aktarım yapılmadı.');
        if (!active) router.replace('/booking/' + data.booking.id);
    }
    catch (e) {
        setError(userMessage(e));
    }
    finally {
        setSaving(false);
    } }
    const filtered = items.filter(i => [i.draft.salesReference, i.draft.customer, i.draft.assignee].join(' ').toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr')));
    return <div className="handover">
    <main>
      {mode !== 'list' && <a className="module-back" href="/booking"><ArrowLeft size={16}/> Booking devirlerine dön</a>}
      <div className="handover-title"><div><p>DENİZYOLU İHRACAT · FCL</p><h1>{mode === 'list' ? 'Booking devri' : mode === 'create' ? 'Yeni booking devri' : active?.draft.salesReference || 'Booking ayrıntısı'}</h1><span>{mode === 'list' ? 'Satıştan operasyona aktarılan devirleri takip edin.' : 'Devir bilgilerini hazırlayın, belgeleri ekleyin ve kontrol edin.'}</span></div>{mode === 'list' && <a className="module-primary" href="/booking/new"><Plus size={16}/> Yeni booking devri oluştur</a>}</div>{mode === 'list' && <p><a className="module-secondary" href="/booking/inbox">Gelen belgeleri eşleştir →</a></p>}
      {error && <OperationToast tone="error" message={userMessage(error)}/>}
      <div className="handover-layout handover-single">
        {mode === 'list' && <><RecentPlatformDocuments/><TmaxxPositionPanel/></>}
        {mode === 'list' && <section className="handover-list" aria-label="Booking devirleri"><label><input type="checkbox" checked={includeTests} onChange={e=>setIncludeTests(e.target.checked)}/> Test dosyalarını göster</label>
          <div className="handover-section-title"><h2>Devir listesi <span>{authorized && !error ? items.length : '—'}</span></h2><button aria-label="Listeyi yenile" onClick={load} disabled={loading}><RefreshCw size={16}/></button></div>
          <label className="handover-search">Kayıtlarda ara<input type="search" placeholder="Referans, müşteri veya sorumlu" value={query} onChange={e => setQuery(e.target.value)}/></label>
          {loading && !items.length ? <p className="handover-empty" role="status">Kayıtlar yükleniyor…</p> : error && !items.length ? <p className="handover-empty">Kayıt listesi yüklenemedi. Listeyi yenileyerek tekrar deneyin.</p> : filtered.length === 0 ? <div className="module-empty"><p>{query ? 'Aramanızla eşleşen devir yok.' : 'Henüz booking devri yok.'}</p><span>{query ? 'Farklı bir referans, müşteri veya sorumlu ile arayın.' : 'Yeni booking devri oluşturarak ilk kaydınızı hazırlayın.'}</span>{!query && <a className="module-secondary" href="/booking/new"><Plus size={16}/> Yeni booking devri oluştur</a>}</div> : <div className="module-table-scroll"><table className="module-table"><thead><tr><th scope="col">Referans / müşteri</th><th scope="col">Rota</th><th scope="col">Sorumlu</th><th scope="col">Durum</th><th scope="col">Son güncelleme</th><th scope="col"><span className="sr-only">İşlemler</span></th></tr></thead><tbody>{filtered.map(item => <tr key={item.id}><td><a className="table-record-link" href={'/booking/' + item.id}>{item.draft.salesReference}</a><small>{item.draft.customer || 'Müşteri belirtilmedi'}</small></td><td>{item.draft.loadPort || '—'} → {item.draft.dischargePort || '—'}</td><td>{item.draft.assignee || 'Atanmadı'}</td><td><small>{lifecycleLabels[statuses[item.id]||'draft']}</small><span className={'handover-status ' + item.assessment.status}>{item.assessment.status === 'review' ? 'İnceleme bekliyor' : `${item.assessment.missing.length} eksik`}</span></td><td>{new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(item.updatedAt))}<small>Sürüm {item.revision}</small></td><td><a className="module-open" href={'/booking/' + item.id}>Aç →</a></td></tr>)}</tbody></table></div>}
          <p className="handover-list-note">Son güncellenen 200 booking devri gösterilir.</p>
        </section>}
        {mode !== 'list' && loading && <p className="module-loading" role="status">Devir bilgileri yükleniyor…</p>}
        {mode !== 'list' && !loading && authorized && (mode === 'create' || active) &&
        <section className="handover-editor" aria-label="Devir bilgileri"><div className="handover-section-title"><div><h2>{active ? active.draft.salesReference : 'Yeni booking devri'}</h2><p>{active ? `Kayıtlı sürüm ${active.revision}` : 'Taslak hazırlığı'}{dirty ? ' · Kaydedilmemiş değişiklikler' : ''}</p></div><span className="handover-pilot">Pilot</span></div>
          <form id="booking-edit-form" onSubmit={save}><p className="handover-edit-hint">Belgeden doldurulanlar dahil tüm alanları doğrudan düzenleyebilirsiniz. Düzeltmeleri tek seferde kaydedin.</p><fieldset disabled={!authorized || saving || documentBusy || commercialBusy || erpBusy || erpPending}><legend>Operasyon bilgileri</legend><div className="handover-fields">{bookingFields.map(([key, label]) => <label key={key} className={changedFields.includes(key) ? "handover-field-changed" : undefined} htmlFor={'booking-' + key}>{label}{key === 'salesReference' && <span> *</span>}{key in options ? <select id={'booking-' + key} value={draft[key]} onChange={e => { edit(key, e.target.value); }}><option value="">Seçin</option>{options[key as keyof typeof options].map(option => <option key={option} value={option}>{option === 'prepaid' ? 'Prepaid' : option === 'collect' ? 'Collect' : option}</option>)}</select> : <input id={'booking-' + key} type={key === 'equipmentCount' ? 'number' : 'text'} min={key === 'equipmentCount' ? 0 : undefined} max={key === 'equipmentCount' ? 999 : undefined} step={key === 'equipmentCount' ? 1 : undefined} maxLength={200} required={key === 'salesReference'} value={draft[key]} onChange={e => { edit(key, key === 'equipmentCount' ? Number(e.target.value) : e.target.value); }}/> }{changedFields.includes(key) ? <span className="handover-field-state">Düzenlendi <button type="button" onClick={e => { e.preventDefault(); if (active) edit(key, active.draft[key]); }}>Geri al</button></span> : documentFields.includes(key) ? <span className="handover-field-state">Belgeden dolduruldu · Düzenleyebilirsiniz</span> : null}</label>)}</div><details className="handover-supplementary" open><summary>Belgeden tamamlanan ek bilgiler <small>Bu aşamada zorunlu değil</small></summary><div className="handover-fields">{supplementaryBookingFields.map(([key, label]) => <label key={key} htmlFor={'booking-' + key} className={changedFields.includes(key) ? 'handover-field-changed' : undefined}>{label}{key.endsWith('Address') ? <textarea id={'booking-' + key} rows={3} maxLength={2000} value={draft[key]} onChange={e => edit(key, e.target.value)}/> : <input id={'booking-' + key} maxLength={200} value={draft[key]} onChange={e => edit(key, e.target.value)}/ >}{changedFields.includes(key) && <span className="handover-field-state">Düzenlendi <button type="button" onClick={e => { e.preventDefault(); if (active) edit(key, active.draft[key]); }}>Geri al</button></span>}</label>)}</div></details><label className="handover-notes" htmlFor="booking-notes">Operasyon notu<textarea id="booking-notes" rows={3} maxLength={2000} value={draft.notes} onChange={e => { edit('notes', e.target.value); }}/></label></fieldset>
            <div className="handover-check"><h3>{assessment.missing.length ? <AlertCircle size={16}/> : <Check size={16}/>} {assessment.missing.length ? 'Devir kontrolü' : 'Bilgiler incelemeye hazır'}</h3><p>{assessment.missing.length ? 'Eksik bilgilerle taslak kaydedebilirsiniz.' : 'Alanların doluluğu kontrol edildi. Kart eşleşmesi ve operasyon onayı ayrıca doğrulanmalıdır.'}</p>{assessment.missing.length > 0 && <ul>{assessment.missing.map(f => <li key={f.key}><a href={'#booking-' + f.key}>{f.label}</a></li>)}</ul>}</div>
            <div className="handover-save handover-edit-actions"><p><span role="status">{changedFields.length > 0 ? `${changedFields.length} alan düzenlendi. ` : ''}</span>Bu kayıt booking teyidi değildir.<br />Platformlara otomatik gönderilmez.</p><button type="submit" disabled={!authorized || saving || documentBusy || commercialBusy || erpBusy || erpPending || (!dirty && !!active)}>{saving ? 'Kaydediliyor…' : active ? 'Düzeltmeleri kaydet' : 'Devri kaydet'}</button></div>{message && <OperationToast tone="auto" message={message}/>}
          </form>
          {active && <BookingTmaxxEditor bookingId={active.id} disabled={dirty||saving||documentBusy||commercialBusy||commercialPending||documentPending} onBusyChange={setErpBusy} onPendingChange={setErpPending} onSaved={()=>setTmaxxRefresh(v=>v+1)}/>}
          {active && <BookingTmaxxLinkPanel key={tmaxxRefresh} bookingId={active.id} revision={active.revision} disabled={dirty||saving||documentBusy||commercialBusy||erpBusy||erpPending} onLinked={()=>setTmaxxRefresh(v=>v+1)}/>}
          {active && <><section className="schedule-panel"><header><div><h2>Nakliye ve saha operasyonu</h2><p>Rezervasyon notası, araç ve konteyner hareketleri, saha olayları ve gönderim kayıtları.</p></div><a href={'/booking/'+active.id+'/field'}>Nakliye ve sahayı aç →</a></header></section>
          <section className="schedule-panel"><header><div><h2>Konşimento veri kontrol merkezi</h2><p>Booking, belge ve pozisyon verilerini yan yana inceleyin; farkları ve eksik kaynakları görün.</p></div><a href={'/booking/'+active.id+'/control'}>Veri kontrolünü aç →</a></header></section>
          <section className="schedule-panel"><header><div><h2>Belge, taslak ve onay yönetimi</h2><p>Sürüm geçmişi, değişen alanlar, kanıtlı onay ve tek güncel final belge.</p></div><a href={'/booking/'+active.id+'/documents'}>Belge yönetimini aç →</a></header></section>
          <section className="schedule-panel"><header><div><h2>Pre-alert hazırlığı</h2><BookingPrealertStatus bookingId={active.id}/><p>Final evraklar, operasyon özeti, alıcılar ve kayıtlı gönderim geçmişi.</p></div><a href={'/booking/'+active.id+'/prealert'}>Pre-alert hazırlığını aç →</a></header></section>
          <section className="schedule-panel"><header><div><h2>Dosya finansı</h2><p>Teklif, gerçekleşen gider, müşteri geliri ve dosya kârlılığı.</p></div><a href={'/booking/'+active.id+'/finance'}>Finans dosyasını aç →</a></header></section>
          <section className="schedule-panel"><header><div><h2>VGM ve ağırlık kontrolü</h2><p>Tartım belgesi, konteyner eşleşmesi, yük + dara hesabı ve onaylı VGM kaydı.</p></div><a href={'/booking/'+active.id+'/vgm'}>VGM kontrolünü aç →</a></header></section>
          <BookingSchedule key={active.id} bookingId={active.id} refreshKey={evidenceKey} disabled={dirty || documentBusy || saving || commercialBusy}/></>}
          {active && <BookingCommercial bookingId={active.id} refreshKey={evidenceKey} disabled={dirty || documentBusy || saving} onBusyChange={setCommercialBusy} onPendingChange={setCommercialPending}/>}
          {active ? <BookingDocuments key={active.id} tmaxxRefresh={tmaxxRefresh} bookingId={active.id} booking={active} dirty={dirty || commercialBusy} onApplied={item=>{setDocumentFields(previous=>Array.from(new Set([...previous, ...bookingFields.filter(([key])=>item.draft[key] !== active.draft[key]).map(([key])=>key)])));setActive(item);setDraft(item.draft);setItems(previous=>[item,...previous.filter(i=>i.id!==item.id)]);setDirty(false)}} onBusyChange={value=>{setDocumentBusy(value);if(!value)setEvidenceKey(k=>k+1);}} onPendingChange={setDocumentPending}/> : <p className="handover-empty">Belge eklemek için önce devir kaydını kaydedin.</p>}
        </section>}
      </div>
    </main>
  </div>;
}
