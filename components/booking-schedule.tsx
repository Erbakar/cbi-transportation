'use client';
import {OperationToast} from '@/components/operation-toast';
import {userMessage} from '@/lib/user-message';
import {TmaxxOperations} from './tmaxx-operations';
import { useCallback, useEffect, useState } from 'react';
import { useUnsavedWork } from '@/hooks/use-unsaved-work';
import { eventLabels, eventKinds, taskStates, taskAlerts, type TaskInput, type ScheduleTask } from '@/lib/operations/schedule';
import type { scheduleWorkspace } from '@/lib/server/operation-schedule';
import '@/app/operations/operations.css';
type Workspace = Awaited<ReturnType<typeof scheduleWorkspace>>;
const blank = (): TaskInput => ({ kind: 'other', label: 'Yeni görev', location: '', date: '', time: '', zone: 'Europe/Istanbul', assignee: '', status: 'pending', remindHours: 24, urgentHours: 4, requiredDocument: '', note: '' });
function DateFields({ value, onChange }: {
    value: Pick<TaskInput, 'date' | 'time' | 'zone' | 'assignee' | 'remindHours' | 'urgentHours'>;
    onChange: (patch: Partial<TaskInput>) => void;
}) { return <div className="schedule-fields"><label>Tarih<input type="date" value={value.date} onChange={e => onChange({ date: e.target.value })}/></label><label>Saat · varsa<input type="time" value={value.time} onChange={e => onChange({ time: e.target.value })}/></label><label>Saat dilimi<input list="schedule-zones" value={value.zone} placeholder="Ör. Europe/Istanbul" onChange={e => onChange({ zone: e.target.value })}/></label><label>Sorumlu<input value={value.assignee} maxLength={120} onChange={e => onChange({ assignee: e.target.value })}/></label><label>İlk uyarı · saat önce<input type="number" min={1} max={720} value={value.remindHours} onChange={e => onChange({ remindHours: Number(e.target.value) })}/></label><label>Kritik uyarı · saat önce<input type="number" min={1} max={value.remindHours} value={value.urgentHours} onChange={e => onChange({ urgentHours: Number(e.target.value) })}/></label></div>; }
export function BookingSchedule({ bookingId, refreshKey, disabled = false }: {
    bookingId: string;
    refreshKey: number;
    disabled?: boolean;
}) {
    const [data, setData] = useState<Workspace | null>(null), [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [edit, setEdit] = useState<TaskInput | null>(null), [proposal, setProposal] = useState<Workspace['proposals'][number] | null>(null), [reason, setReason] = useState(''), [verified, setVerified] = useState(false), [now, setNow] = useState(() => Date.now());
    const pending = !!edit;
    useUnsavedWork(pending || busy);
    const load = useCallback(async () => { try {
        const r = await fetch(`/api/bookings/${bookingId}/schedule`);
        const d = await r.json() as Workspace & {
            error?: string;
        };
        if (!r.ok)
            throw new Error(d.error || 'Takvim yüklenemedi.');
        setData(d);
        setError('');
    }
    catch (e) {
        setError(userMessage(e));
    } }, [bookingId]);
    // Initial and post-save fetch synchronize with the authenticated server.
    useEffect(() => { if (!pending && !busy) {
        // Refresh external schedule data after booking evidence changes.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load(); } }, [load, refreshKey, pending, busy]);
    useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
    const start = (task?: ScheduleTask) => { setProposal(null); setVerified(false); setReason(''); setMessage(''); setEdit(task ? { id: task.id, kind: task.kind, label: task.label, location: task.location, date: task.date, time: task.time, zone: task.zone, assignee: task.assignee, status: task.status, remindHours: task.remindHours, urgentHours: task.urgentHours ?? 4, requiredDocument: task.requiredDocument, note: task.note } : { ...blank(), assignee: data?.assignee || '' }); };
    function fromSource(p: Workspace['proposals'][number]) { const old = data?.tasks.find(t => t.source?.seriesId === p.source.seriesId && t.source.key === p.kind); setProposal(p); setReason(''); setVerified(false); setMessage(''); setEdit({ ...blank(), kind: p.kind, label: eventLabels[p.kind], date: p.hint.date, time: p.hint.time, zone: p.hint.zone, assignee: old?.assignee || data?.assignee || '', remindHours: old?.remindHours || 24, urgentHours: old?.urgentHours ?? 4 }); }
    async function save(e: React.FormEvent) { e.preventDefault(); if (!data || !edit)
        return; setBusy(true); setError(''); try {
        const body = proposal ? { action: 'import', revision: data.revision, evidenceRevision: data.evidenceRevision, documentId: proposal.source.documentId, extractionId: proposal.source.extractionId, key: proposal.kind, date: edit.date, time: edit.time, zone: edit.zone, assignee: edit.assignee, remindHours: edit.remindHours, urgentHours: edit.urgentHours, verified, reason } : { action: 'task', revision: data.revision, evidenceRevision: data.evidenceRevision, task: edit, reason };
        const r = await fetch(`/api/bookings/${bookingId}/schedule`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const d = await r.json() as Workspace & {
            error?: string;
        };
        if (!r.ok)
            throw new Error(d.error || 'Kaydedilemedi.');
        setData(d);
        setEdit(null);
        setProposal(null);
        setMessage('Takvim kaydedildi; önceki sürüm geçmişte korundu.');
    }
    catch (e) {
        setError(userMessage(e));
    }
    finally {
        setBusy(false);
    } }
    return <section className="schedule-panel" aria-label="Operasyon takvimi"><TmaxxOperations bookingId={bookingId} disabled={disabled||pending||busy}/><header><div><p className="schedule-eyebrow">TARİHLER VE SORUMLULAR</p><h2>Operasyon takvimi</h2></div><a href="/operations">Tüm operasyonlar →</a></header><p>Tarihler kendi saat diliminde gösterilir. Uyarılar bu ekran açıkken dakikada bir güncellenir; e-posta gönderilmez.</p>
 <datalist id="schedule-zones">{['Europe/Istanbul', 'UTC', 'Europe/London', 'Europe/Amsterdam', 'Asia/Shanghai', 'America/Santiago', 'America/New_York'].map(z => <option key={z} value={z}/>)}</datalist>
 {error && <OperationToast tone="error" message={userMessage(error)}/>}{message && <OperationToast tone="auto" message={message}/>}
 {!data && !error && <p role="status">Takvim yükleniyor…</p>}
 {data && <><div className="schedule-actions"><button type="button" disabled={disabled || busy || pending} onClick={() => start()}>Yeni görev ekle</button><button type="button" disabled={busy || pending} onClick={() => void load()}>Yenile</button><span>Sürüm {data.revision}</span></div>
 {disabled && <p>Önce devir formundaki değişiklikleri kaydedin veya belge işleminin tamamlanmasını bekleyin.</p>}
 {data.warnings.map(w => <p key={w} className="schedule-error">{w} · kaynakları kontrol edin.</p>)}
 <div className="schedule-task-list">{data.tasks.length === 0 && <div className="schedule-empty">Henüz görev yok. Booking teyidindeki tarihleri aşağıdan takvime alın veya görev ekleyin.</div>}{data.tasks.map(t => <article className="schedule-task" key={t.id}><div><h3>{t.label}</h3><p>{t.date || 'Tarih bekleniyor'} {t.time || '· Saat belirtilmedi'} · {t.zone}{t.location && ` · ${t.location}`}</p><small>{t.assignee || 'Sorumlu atanmadı'} · {taskStates[t.status]} · {t.remindHours} ve {t.urgentHours ?? 4} saat önce uyarı</small><div className="schedule-badges">{taskAlerts(t, now, data.documents).map(a => <span key={a.code} className={a.severity}>{a.text}</span>)}</div>{t.source && <p className="schedule-source">Kaynak: <a href={`/api/bookings/${bookingId}/documents/${t.source.documentId}`}>{t.source.filename}</a> · s. {t.source.page} · {t.source.value}</p>}{t.note && <p>{t.note}</p>}</div><button type="button" disabled={disabled || busy || pending} onClick={() => start(t)}>Düzenle</button></article>)}</div>
 <details className="schedule-proposals" open={data.tasks.length === 0}><summary>Belgeden bulunan tarihler ({data.proposals.length})</summary><p>Yalnız güncel booking teyidi ve revizyonları gösterilir. Belgenin tarihi, saati ve saat dilimi kontrol edilerek takvime alınır. Çoklu aktarma durakları ayrı görevlerle eklenebilir.</p>{!data.proposals.length && <p>Güncel booking teyidini Belgeler bölümüne ekleyip okuyun. Eski okumalar yeni tarih alanları için yeniden okunabilir.</p>}{data.proposals.map(p => { const applied = data.tasks.find(t => t.source?.seriesId === p.source.seriesId && t.source.key === p.kind); return <article key={p.source.documentId + p.kind} className="schedule-proposal"><div><h3>{eventLabels[p.kind]}</h3><strong>{p.source.value}</strong><p>{p.source.filename} · s. {p.source.page} · Okuma güveni %{Math.round(p.source.confidence * 100)}</p><blockquote>{p.source.quote}</blockquote>{applied && <p>Mevcut görev: {applied.date} {applied.time} · {applied.zone} · {taskStates[applied.status]}</p>}{p.hint.warning && <p>{p.hint.warning}</p>}{p.issues.length > 0 && <details><summary>Belge kontrol notları</summary>{p.issues.map((s, i) => <p key={i}>{s}</p>)}</details>}</div><button type="button" disabled={disabled || busy || pending} onClick={() => fromSource(p)}>{applied ? 'Tarihi gözden geçir' : 'Takvime al'}</button></article>; })}</details>
 {edit && <form className="schedule-editor" onSubmit={save}><h3>{proposal ? 'Belge tarihini doğrula' : edit.id ? 'Görevi düzenle' : 'Yeni görev'}</h3>{proposal && <blockquote>{proposal.source.quote}<br />{proposal.source.filename} · s. {proposal.source.page}</blockquote>}<fieldset disabled={disabled || busy}>{!proposal && <div className="schedule-fields"><label>Görev türü<select value={edit.kind} disabled={!!edit.id && !!data.tasks.find(t => t.id === edit.id)?.source} onChange={e => setEdit({ ...edit, kind: e.target.value as TaskInput['kind'], label: eventLabels[e.target.value as TaskInput['kind']] })}>{eventKinds.map(k => <option key={k} value={k}>{eventLabels[k]}</option>)}</select></label><label>Görev adı<input required maxLength={150} value={edit.label} onChange={e => setEdit({ ...edit, label: e.target.value })}/></label><label>Yer / aktarma limanı<input maxLength={150} value={edit.location} onChange={e => setEdit({ ...edit, location: e.target.value })}/></label></div>}
 <DateFields value={edit} onChange={p => setEdit({ ...edit, ...p })}/>{!proposal && <><div className="schedule-fields"><label>Durum<select value={edit.status} onChange={e => setEdit({ ...edit, status: e.target.value as TaskInput['status'] })}>{Object.entries(taskStates).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><label>Beklenen belge<select value={edit.requiredDocument} onChange={e => setEdit({ ...edit, requiredDocument: e.target.value as TaskInput['requiredDocument'] })}>{[['', 'Belge beklenmiyor'], ['instruction', 'Müşteri talimatı'], ['vgm', 'VGM'], ['booking_confirmation', 'Booking teyidi'], ['other', 'Diğer']].map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></div><label>Görev notu<textarea maxLength={2000} value={edit.note} onChange={e => setEdit({ ...edit, note: e.target.value })}/></label></>}
 <label>Kaynak / değişiklik açıklaması<textarea required minLength={5} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} placeholder="Tarihin kaynağı veya düzeltme nedeni"/></label>{proposal && <label className="schedule-attest"><input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)}/>Tarih, saat, saat dilimi ve ilgili sevkiyatı kaynaktan kontrol ettim.</label>}<div className="schedule-actions"><button type="submit" disabled={!!proposal && !verified}>{busy ? 'Kaydediliyor…' : 'Takvimi kaydet'}</button><button type="button" onClick={() => { setEdit(null); setProposal(null); setError(''); }}>Vazgeç</button></div></fieldset></form>}
 <details className="schedule-history"><summary>Değişiklik geçmişi · son 50 sürüm</summary>{!data.history.length && <p>Henüz değişiklik yok.</p>}{data.history.map(h => <details key={h.revision}><summary>Sürüm {h.revision} · {new Date(h.created_at).toLocaleString('tr-TR')} · {h.reason}</summary><ul>{h.tasks.map(t => <li key={t.id}>{t.label}: {t.date || 'Tarihsiz'} {t.time} ({t.zone}) · {t.assignee || 'Atanmadı'} · {taskStates[t.status]}{t.source && ` · ${t.source.filename} s. ${t.source.page}`}</li>)}</ul></details>)}</details></>}
 </section>;
}
