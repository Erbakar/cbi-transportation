'use client';
import {OperationToast} from '@/components/operation-toast';
import {userMessage} from '@/lib/user-message';
import {useState, useEffect, useCallback, useRef} from 'react';
import {useUnsavedWork} from '@/hooks/use-unsaved-work';
import {validateArchiveFile, archiveTransferMessage} from '@/lib/operations/archive-upload';
import type {operationArchiveWorkspace, ArchivePurpose} from '@/lib/server/operation-archive';

type Workspace = Awaited<ReturnType<typeof operationArchiveWorkspace>>;
type Props = {bookingId: string; purpose: ArchivePurpose; disabled?: boolean};
export function OperationArchive(props: Props) {
    return <ArchivePanel key={props.bookingId + ':' + props.purpose} {...props}/>;
}

function ArchivePanel({bookingId, purpose, disabled = false}: Props) {
    const [data, setData] = useState<Workspace | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const [source, setSource] = useState('');
    const [busy, setBusy] = useState(false);
    const [checking, setChecking] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const input = useRef<HTMLInputElement>(null);
    const selection = useRef(0);
    const request = useRef(0);
    const sending = useRef(false);
    const path = '/api/bookings/' + bookingId + '/operation-archive';
    useUnsavedWork(!!file || busy || checking);

    const load = useCallback(async () => {
        const sequence = ++request.current;
        setLoading(true);
        try {
            const response = await fetch(path, {cache: 'no-store'});
            const result = await response.json() as Workspace & {error?: string};
            if (!response.ok) throw new Error(result.error || 'Arşiv yüklenemedi.');
            if (sequence === request.current) setData(result);
        } finally {
            if (sequence === request.current) setLoading(false);
        }
    }, [path]);
    useEffect(() => {
        const requests = request, selections = selection;
        // Initial read of persisted archive state; no automatic write or retry.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load().catch(e => setError(userMessage(e)));
        return () => {requests.current++; selections.current++;};
    }, [load]);

    async function selectFile(candidate?: File) {
        const sequence = ++selection.current;
        setFile(null);
        setError('');
        setMessage('');
        setChecking(!!candidate);
        if (!candidate) return;
        try {
            await validateArchiveFile(candidate);
            if (sequence === selection.current) setFile(candidate);
        } catch (e) {
            if (sequence === selection.current) {
                setError(userMessage(e));
                if (input.current) input.current.value = '';
            }
        } finally {
            if (sequence === selection.current) setChecking(false);
        }
    }

    async function send(documentId?: string, recover = false) {
        if (sending.current || disabled || checking || !data?.link) return;
        if (!documentId && (!file || !source.trim())) return;
        sending.current = true;
        setBusy(true);
        setError('');
        setMessage('');
        try {
            let body: FormData | string;
            const headers: Record<string, string> = {};
            if (documentId) {
                body = JSON.stringify({documentId, recover});
                headers['Content-Type'] = 'application/json';
            } else {
                await validateArchiveFile(file!);
                const form = new FormData();
                form.set('purpose', purpose);
                form.set('sourceReference', source);
                form.set('file', file!);
                body = form;
            }
            const response = await fetch(path, {method: documentId ? 'PUT' : 'POST', headers, body});
            const result = await response.json() as Parameters<typeof archiveTransferMessage>[0] & {error?: string};
            if (!response.ok) throw new Error(result.error || 'Arşiv aktarımı tamamlanamadı.');
            if (!documentId) {
                setFile(null);
                if (input.current) input.current.value = '';
            }
            setMessage(archiveTransferMessage(result));
        } catch (e) {
            setError(userMessage(e));
        } finally {
            // Even a failed response may have saved the file; read its state before retrying.
            try {await load();} catch {setError(previous => [previous, 'Belge listesi yenilenemedi. Yeniden göndermeden önce listeyi yenileyin.'].filter(Boolean).join(' ')); setData(null);}
            sending.current = false;
            setBusy(false);
        }
    }

    const title = purpose === 'hbl_approval' ? 'HBL müşteri onayı' : 'Pre-alert';
    const documents = data?.documents.filter(d => d.sourceReference.startsWith('[CBI arşiv:' + purpose + '] ')) ?? [];
    const current = documents.filter(d => d.isCurrent);
    const verified = current.filter(d => d.job?.verified_at).length;
    const uncertain = current.filter(d => !d.job?.verified_at && d.job?.uncertain).length;
    return <section className="schedule-panel" aria-busy={busy || loading}>
        <h2>{title} · T-MAXX arşiv aktarımı</h2>
        <p>{title} belgesini {purpose === 'prealert' ? 'pozisyonun' : 'yükün'} dijital arşivine kaydedin. Bu işlem e-posta göndermez veya konşimento durumunu değiştirmez.</p>
        {error && <OperationToast tone="error" message={userMessage(error)}/>}
        {message && <OperationToast tone="auto" message={message}/>}
        <button type="button" disabled={busy || loading} onClick={() => {setError(''); void load().catch(e => {setData(null); setError(userMessage(e));});}}>{loading ? 'Arşiv kontrol ediliyor…' : 'Arşiv durumunu yenile'}</button>
        {data?.link && <p>Hedef: {purpose === 'prealert' ? 'Deniz Pozisyon · ' + data.link.position_reference : 'Deniz Yük · ' + data.link.good_reference} · Belge türü: {purpose === 'prealert' ? 'PRA — Pre Alert' : 'DOM — Müşteri Draft Onay Maili'}</p>}
        {data && !data.link && <p>Önce booking dosyasını T-MAXX yüküne bağlayın.</p>}
        <form onSubmit={e => {e.preventDefault(); void send();}}>
            <fieldset disabled={busy || disabled || loading || !data?.link}>
                <legend>{title} belgesi yükle</legend>
                <label>Belge kaynağı<input required maxLength={400} value={source} onChange={e => setSource(e.target.value)} placeholder="Gönderen, tarih ve konu"/></label>
                <label>PDF, PNG veya JPEG · En fazla 10 MB<input ref={input} type="file" required accept=".pdf,.png,.jpg,.jpeg" onChange={e => void selectFile(e.target.files?.[0])}/></label>
                {checking && <p role="status">Dosya kontrol ediliyor…</p>}
                {file && <p>{file.name} · {(file.size / 1024 / 1024).toLocaleString('tr-TR', {maximumFractionDigits: 2})} MB</p>}
                <button disabled={!file || checking || !source.trim()}>{busy ? 'Aktarım kontrol ediliyor…' : 'T-MAXX arşivine kaydet'}</button>
            </fieldset>
        </form>
        {data && <p>Doğrulanan: {verified} · Bekleyen: {current.length - verified - uncertain} · Sonucu belirsiz: {uncertain}</p>}
        {data && !documents.length && <p>Henüz {title.toLocaleLowerCase('tr-TR')} belgesi yüklenmedi.</p>}
        {documents.map(d => <article key={d.id}>
            <a href={'/api/bookings/' + bookingId + '/documents/' + d.id}>{d.filename}</a>
            {d.job && <p>Kayıt hedefi: {d.job.target_kind === 'position' ? 'Pozisyon arşivi' : 'Yük arşivi'}{purpose === 'prealert' && d.job.target_kind !== 'position' ? ' · Önceki aktarım; otomatik taşınmaz.' : ''}</p>}
            <p>Sürüm {d.version} · {!d.isCurrent ? 'Eski sürüm' : d.job?.verified_at ? 'T-MAXX kaydı doğrulandı' : d.job?.uncertain ? 'Sonuç belirsiz; yeniden gönderim kapalı' : 'Aktarım bekliyor'}</p>
            {d.job?.verified_at && <p>Doğrulama: {new Date(d.job.verified_at).toLocaleString('tr-TR', {timeZone: 'Europe/Istanbul'})} · Türkiye saati</p>}
            {d.isCurrent && !d.job?.verified_at && <>
                <button disabled={busy || loading || disabled || !data?.link || !!d.job?.uncertain} onClick={() => void send(d.id)}>Aktarımı tamamla</button>
                {!!d.job && <button disabled={busy || loading || disabled || !data?.link} onClick={() => void send(d.id, true)}>Yeniden göndermeden doğrula</button>}
            </>}
        </article>)}
    </section>;
}
