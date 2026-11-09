'use client';
import { useCallback, useEffect, useState } from 'react';
import { Loader2, Paperclip, RefreshCw } from 'lucide-react';
import { OperationToast } from '@/components/operation-toast';
import { userMessage } from '@/lib/user-message';
import type { mailOverview, MailSyncResult } from '@/lib/server/mail-sync';
import '@/app/operations/operations.css';
import '@/app/mail/mail.css';
type Overview = Awaited<ReturnType<typeof mailOverview>>;
const time = (value: string | null | undefined) => value ? new Date(value).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const day = (value: string) => new Date(value + 'T12:00:00Z').toLocaleDateString('tr-TR', { weekday: 'short', day: '2-digit', month: 'short' });
export function MailWorkspace() {
  const [data, setData] = useState<Overview | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    try { const r = await fetch('/api/mail'); const d = await r.json() as Overview & { error?: string }; if (!r.ok) throw new Error(d.error || 'E-posta durumu yüklenemedi.'); setData(d); setError(''); }
    catch (e) { setError(userMessage(e)); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); const t = setInterval(() => void load(), 60000); return () => clearInterval(t); }, [load]);
  async function check() {
    setBusy(true); setNotice(''); setError('');
    try {
      const r = await fetch('/api/mail', { method: 'POST' }); const d = await r.json() as { result: MailSyncResult; overview: Overview; error?: string };
      if (!r.ok) throw new Error(d.error || 'Kontrol yapılamadı.'); setData(d.overview);
      const res = d.result;
      if (res.status === 'failed') setError(res.message || 'Kontrol yapılamadı.');
      else if (res.status === 'busy') setNotice('Otomatik kontrol şu anda çalışıyor. Birazdan liste güncellenecek.');
      else if (res.status === 'disabled') setNotice('E-posta bağlantısı henüz açılmadı.');
      else setNotice(res.imported ? `${res.imported} yeni e-posta kaydedildi${res.remaining ? ', kalanlar sıradaki kontrolde alınacak' : ''}.` : 'Yeni e-posta yok.');
    } catch (e) { setError(userMessage(e)); } finally { setBusy(false); }
  }
  const sync = data?.sync, today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
  const week = data?.days.slice(0, 7).reduce((n, d) => n + d.count, 0) ?? 0, max = Math.max(1, ...(data?.days.map(d => d.count) ?? []));
  return <main className="operations-page mail-page">
    <header className="operations-hero"><div><p className="schedule-eyebrow">E-POSTA · FAZ 1 · SESSİZ DENEME</p><h1>E-posta takibi</h1>
      <p>Otomasyon adresine gelen e-postalar sadece okunur ve ölçülür. Hiçbir e-posta gönderilmez, okundu olarak işaretlenmez, taşınmaz veya silinmez.</p>
      <div className="operations-pills"><span>{data?.address || 'Adres bekleniyor'}</span><span>Gelen kutusu</span><span>5 dakikada bir kontrol</span></div></div>
      <button className="mail-check" type="button" disabled={busy || !data?.enabled} onClick={() => void check()}>{busy ? <Loader2 className="spin" size={16}/> : <RefreshCw size={16}/>}Şimdi kontrol et</button>
    </header>
    {error && <OperationToast tone="error" message={error}/>}
    {notice && <OperationToast tone="success" message={notice}/>}
    {!data ? <p className="schedule-empty" role="status"><Loader2 className="spin" size={16}/> Yükleniyor…</p> : <>
      {!data.enabled && <p className="schedule-empty">E-posta bağlantısı henüz açılmadı. Bağlantı bilgileri sunucuya tanımlandığında kontrol otomatik başlar.</p>}
      <section className="mail-status" aria-label="Bağlantı durumu">
        <span className={'mail-dot ' + (sync?.status === 'complete' ? 'ok' : sync?.status === 'failed' ? 'bad' : '')} aria-hidden="true"/>
        <div><strong>{sync?.status === 'complete' ? 'Bağlantı çalışıyor' : sync?.status === 'failed' ? 'Bağlantı hatası' : 'Henüz kontrol edilmedi'}</strong>
          <small>Son başarılı kontrol: {time(sync?.lastSuccessAt)} · Son deneme: {time(sync?.lastAttemptAt)}{sync?.retryAt ? ' · Sonraki deneme: ' + time(sync.retryAt) : ''}</small>
          {sync?.message && <small className="mail-error">{sync.message}</small>}</div>
      </section>
      <div className="operation-stats">
        <div><span>Bugün gelen</span><strong>{data.days.find(d => d.day === today)?.count ?? 0}</strong></div>
        <div><span>Son 7 gün</span><strong>{week}</strong></div>
        <div><span>Farklı gönderen</span><strong>{data.totals.senders}</strong></div>
        <div><span>Toplam kayıt</span><strong>{data.totals.messages}</strong></div>
      </div>
      <section className="operations-day"><h2>Günlük e-posta sayısı</h2>
        {data.days.length ? <ul className="mail-days">{data.days.map(d => <li key={d.day}><span>{day(d.day)}</span><span className="mail-bar"><i style={{ width: (d.count / max * 100) + '%' }}/></span><strong>{d.count}</strong><small>{d.withAttachments} ekli</small></li>)}</ul> : <p className="schedule-empty">Son 14 günde e-posta yok.</p>}
      </section>
      <section className="operations-day"><h2>Son gelen e-postalar</h2>
        {data.recent.length ? <div className="mail-table" role="table" aria-label="Son gelen e-postalar">
          <div role="row" className="mail-head"><span role="columnheader">Geliş</span><span role="columnheader">Gönderen</span><span role="columnheader">Konu</span><span role="columnheader">Ek</span></div>
          {data.recent.map(m => <div role="row" key={m.uid}><span role="cell">{time(m.receivedAt)}</span><span role="cell" title={m.fromAddress}>{m.fromName || m.fromAddress || '—'}<small>{m.fromName ? m.fromAddress : ''}</small></span><span role="cell">{m.subject || '(konu yok)'}</span><span role="cell">{m.attachments ? <><Paperclip size={14}/> {m.attachments}</> : ''}</span></div>)}
        </div> : <p className="schedule-empty">Henüz kayıtlı e-posta yok.</p>}
        <p className="operations-note">Sadece gönderen, alıcı, konu, zaman ve ek sayısı kaydedilir. E-posta içeriği ve ekler bu aşamada saklanmaz.</p>
      </section>
    </>}
  </main>;
}
