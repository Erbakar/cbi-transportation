'use client';
import {OperationToast} from '@/components/operation-toast';
import {userMessage} from '@/lib/user-message';
import {useWorkspaceUser} from './workspace-session';
import {readDisplayCache,writeDisplayCache,displayCacheGeneration} from '@/lib/workspace-cache';
import {TmaxxOperations} from './tmaxx-operations';
import {RecentPlatformDocuments} from './recent-platform-documents';
/* eslint-disable @next/next/no-html-link-for-pages */
import { useCallback, useEffect, useState } from 'react';
import { taskStates } from '@/lib/operations/schedule';
import type { operationCalendar } from '@/lib/server/operation-schedule';
import '@/app/operations/operations.css';
type Calendar = Awaited<ReturnType<typeof operationCalendar>>;
export function OperationsCalendar() {
    const {username}=useWorkspaceUser();
    const [view,setView]=useState('history'),[showTests,setShowTests]=useState(false);
    const [data, setData] = useState<Calendar | null>(null), [error, setError] = useState(''), [query, setQuery] = useState(''), [month, setMonth] = useState(''), [filter, setFilter] = useState('open'), [assignee, setAssignee] = useState('');
    const load = useCallback(async () => { const epoch=displayCacheGeneration();const cached=readDisplayCache<Calendar>(username,'tasks:'+showTests);setData(cached?.value??null);try {
        const r = await fetch('/api/operations?hideTests='+!showTests);
        const d = await r.json() as Calendar & {
            error?: string;
        };
        if (!r.ok)
            throw new Error(d.error || 'Takvim yüklenemedi.');
        writeDisplayCache(username,'tasks:'+showTests,d,epoch);setData(d);
        setError('');
    }
    catch (e) {
        setError(userMessage(e));
    } }, [showTests,username]);
    // Load current server state and refresh visible alerts once per minute.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { if(view!=='tasks')return; void load(); const t = setInterval(() => void load(), 60000); return () => clearInterval(t); }, [load,view]);
    const all = data?.bookings.flatMap(b => b.tasks.map(t => ({ ...t, bookingId: b.id, reference: b.reference, customer: b.customer }))) || [];
    const open = all.filter(t => !['done', 'cancelled'].includes(t.status)), late = open.filter(t => t.alerts.some(a => a.code === 'overdue')), soon = open.filter(t => t.alerts.some(a => a.code === 'upcoming'));
    const rows = all.filter(t => (filter === 'all' || filter === 'alerts' && t.alerts.length || filter === 'open' && !['done', 'cancelled'].includes(t.status) || filter === 'done' && t.status === 'done') && (!month || t.date.startsWith(month)) && (!assignee || t.assignee === assignee) && [t.reference, t.customer, t.label, t.location, t.assignee].join(' ').toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr'))).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.time.localeCompare(b.time) || a.reference.localeCompare(b.reference));
    const days = [...new Set(rows.map(t => t.date || 'Tarihi beklenenler'))];
    return <main className="operations-page"><header className="operations-hero"><div><p className="schedule-eyebrow">OPERASYON TAKİBİ</p><h1>Operasyon takvimi</h1><p>Platform hareketleri, son teslim tarihleri ve ekibinizin görevleri.</p><div className="operations-pills"><span>Son 30 gün</span><span>Türkiye saati</span><span>24 ve 4 saatlik uyarılar</span></div></div><a className="operations-primary" href="/booking">Booking dosyalarını aç →</a></header>
 <nav className="operations-views" aria-label="Operasyon görünümü">{[{id:'history',title:'Platform hareketleri',description:'Belgeler, pre-alert, INTTRA ve VGM'},{id:'deadlines',title:'Son teslim tarihleri',description:'Bağlı T-MAXX dosyalarının canlı takvimi'},{id:'tasks',title:'Görev planlama',description:'Sorumlular, uyarılar ve yapılacak işler'}].map(v=><button key={v.id} aria-pressed={view===v.id} onClick={()=>setView(v.id)}><strong>{v.title}</strong><span>{v.description}</span></button>)}</nav>
 <div className="operations-history" hidden={view!=='history'}><RecentPlatformDocuments/></div>
 {view!=='history'&&<label className="operations-test-toggle"><input type="checkbox" checked={showTests} onChange={e=>setShowTests(e.target.checked)}/>Test dosyalarını göster</label>}
 {view==='deadlines'&&<><div className="operations-context"><h2>Kaynağından gelen operasyon tarihleri</h2><p>Bu takvim T-MAXX yüküne bağlanmış booking dosyalarını kapsar. Gelecek teslimler ve gecikmiş işler görünür kalır; son 30 günlük belge filtresi bu tarihleri gizlemez.</p></div><TmaxxOperations hideTests={!showTests}/></>}
 {view==='tasks'&&<section aria-label="Görev planlama"><div className="operations-task-heading"><div><h2>Ekibin görevleri</h2><p>Yerel görev planıdır. T-MAXX’e kaydedilen tarihler “Son teslim tarihleri” bölümündedir.</p></div><button onClick={()=>void load()}>Görevleri yenile</button></div><p className="operations-note">Tarihler görevin saat dilimindedir. Uyarılar ekran açıkken dakikada bir yenilenir; e-posta gönderilmez.</p>{data&&<small>Son kontrol: {new Date(data.checkedAt).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})}</small>}{error&&<OperationToast tone="error" message={userMessage(error)+" İşlem yapmadan önce listeyi yenileyin."}/>}{!data&&!error&&<p role="status">Görevler yükleniyor…</p>}
 <div className="operation-stats"><div>Açık görev<strong>{data?open.length:"—"}</strong></div><div>Süresi geçen<strong>{data?late.length:"—"}</strong></div><div>Yaklaşan<strong>{data?soon.length:"—"}</strong></div><div>Sorumlu bekleyen<strong>{data?open.filter(t => !t.assignee).length:"—"}</strong></div></div>
 <div className="operations-filters"><label>Görev veya booking ara<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Referans, müşteri veya görev"/></label><label>Ay · boşsa tümü<input type="month" value={month} onChange={e => setMonth(e.target.value)}/></label><label>Durum<select value={filter} onChange={e => setFilter(e.target.value)}><option value="open">Açık görevler</option><option value="alerts">Uyarı bulunanlar</option><option value="all">Tüm görevler</option><option value="done">Tamamlananlar</option></select></label><label>Sorumlu<select value={assignee} onChange={e => setAssignee(e.target.value)}><option value="">Tümü</option>{[...new Set(all.map(t => t.assignee).filter(Boolean))].sort().map(s => <option key={s}>{s}</option>)}</select></label></div>
 {data?.truncated && <OperationToast tone="warning" message="Son güncellenen 500 booking gösteriliyor. Daha eski kayıtları booking listesinden açın."/>}
 {data?.bookings.filter(b => b.warnings.length).map(b => <p className="schedule-error" key={b.id}><a href={`/booking/${b.id}`}>{b.reference}</a>: {b.warnings.join(' · ')}</p>)}
 {data && rows.length === 0 && <div className="schedule-empty"><h2>{all.length ? 'Bu filtrelere uygun görev yok.' : 'Takviminiz hazır; ilk görevi ekleyin.'}</h2><p>Booking kaydını açıp teyit belgesindeki tarihleri takvime alın veya sorumlu atayarak görev oluşturun.</p><a href="/booking">Booking devirlerini aç →</a></div>}
 {days.map(day => <section className="operations-day" key={day}><h2>{day === 'Tarihi beklenenler' ? day : new Date(day + 'T12:00:00Z').toLocaleDateString('tr-TR', { dateStyle: 'full', timeZone: 'UTC' })}</h2>{rows.filter(t => (t.date || 'Tarihi beklenenler') === day).map(t => <article key={t.bookingId + t.id}><div><strong>{t.time || 'Gün boyunca'}</strong><small>{t.zone}</small></div><div><h3>{t.label}</h3><a href={`/booking/${t.bookingId}`}>{t.reference}</a><small>{t.customer}{t.location && ` · ${t.location}`}</small><div className="schedule-badges">{t.alerts.map(a => <span key={a.code} className={a.severity}>{a.text}</span>)}</div></div><div>{t.assignee || 'Sorumlu atanmadı'}<small>{taskStates[t.status]}</small><a href={`/booking/${t.bookingId}`}>Görevi aç →</a></div></article>)}</section>)}
 {data && data.bookings.some(b => !b.tasks.length) && <details className="schedule-history"><summary>Takvim hazırlanmamış booking kayıtları ({data.bookings.filter(b => !b.tasks.length).length})</summary><ul>{data.bookings.filter(b => !b.tasks.length).map(b => <li key={b.id}><a href={`/booking/${b.id}`}>{b.reference}</a> · {b.customer}</li>)}</ul></details>}
 </section>}
 </main>;
}
