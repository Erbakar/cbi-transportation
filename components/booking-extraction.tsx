'use client';
import {OperationToast} from '@/components/operation-toast';
import {userMessage} from '@/lib/user-message';
import type { DocumentAssessment } from '@/lib/operations/document-policy';
import type { BookingRevisionReport } from '@/lib/operations/booking-revision';
import { useState } from 'react';
import { bookingFields, supplementaryBookingFields, type BookingItem } from '@/lib/operations/booking';
import { type ExtractionResult, type ExtractableField } from '@/lib/operations/booking-extraction';
import { documentTypes, type OperationDocument } from '@/lib/operations/documents';
export function BookingExtractionReview({ document, booking, dirty, onApplied, onBusyChange }: {
    document: OperationDocument;
    booking: BookingItem;
    dirty: boolean;
    onApplied: (booking: BookingItem) => void;
    onBusyChange: (busy: boolean) => void;
}) {
    const [result, setResult] = useState<ExtractionResult | null>(null), [selected, setSelected] = useState<ExtractableField[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
    const [assessment, setAssessment] = useState<(DocumentAssessment & {
        bookingRevision: number;
        evidenceRevision: number;
        revisionReport: BookingRevisionReport;
    }) | null>(null), [attested, setAttested] = useState(false), [reason, setReason] = useState('');
    const [showAll, setShowAll] = useState(false);
    const url = `/api/bookings/${booking.id}/documents/${document.id}/extraction`;
    async function read(refresh = false) {
        setBusy(true);
        onBusyChange(true);
        setError('');
        setMessage('');
        try {
            const response = await fetch(url + (refresh ? '?refresh=1' : ''), { method: 'POST' });
            const data = await response.json() as {
                extraction: ExtractionResult;
                assessment: DocumentAssessment & {
                    bookingRevision: number;
                    evidenceRevision: number;
                    revisionReport: BookingRevisionReport;
                };
                error?: string;
            };
            if (!response.ok)
                throw new Error(data.error || 'Belge okunamadı.');
            setResult(data.extraction);
            setAssessment(data.assessment);
            setAttested(false);
            setReason('');
            setSelected([]);
            const keys = data.assessment.fields.filter(f => f.action === 'fill_draft').map(f => f.key);
            if (keys.length && !dirty && data.assessment.bookingRevision === booking.revision) {
                const saved = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'draft', extractionId: data.extraction.id, revision: booking.revision, fields: keys, sourceVerifiedFields: [], reason: '', evidenceRevision: data.assessment.evidenceRevision, policyVersion: data.assessment.policyVersion }) });
                const applied = await saved.json() as { booking: BookingItem; error?: string };
                if (!saved.ok) throw new Error(applied.error || 'Otomatik doldurma tamamlanamadı.');
                onApplied(applied.booking);
                setAssessment(null);
                setMessage(`${keys.length} alan kaynak bilgisiyle taslağa otomatik dolduruldu. Bu bilgiler henüz doğrulanmış sayılmaz.`);
                const refreshed = await fetch(url);
                const latest = await refreshed.json() as { assessment: typeof data.assessment; error?: string };
                if (!refreshed.ok) throw new Error(latest.error || 'Taslak kaydedildi; değerlendirmeyi yeniden açın.');
                setAssessment(latest.assessment);
            }
        }
        catch (e) {
            setError(userMessage(e));
        }
        finally {
            setBusy(false);
            onBusyChange(false);
        }
    }
    async function apply() {
        if (!result)
            return;
        setBusy(true);
        onBusyChange(true);
        setError('');
        setMessage('');
        try {
            const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ extractionId: result.id, revision: booking.revision, fields: selected, sourceVerifiedFields: attested ? selected : [], reason, evidenceRevision: assessment?.evidenceRevision, policyVersion: assessment?.policyVersion }) });
            const data = await response.json() as {
                booking: BookingItem;
                error?: string;
            };
            if (!response.ok)
                throw new Error(data.error || 'Alanlar uygulanamadı.');
            onApplied(data.booking);
            setSelected([]);
            setAttested(false);
            setAssessment(null);
            setMessage('Seçilen alanlar kaydedildi. Kaynak ve kullanıcı kararı işlem geçmişine eklendi.');
        }
        catch (e) {
            setError(userMessage(e));
        }
        finally {
            setBusy(false);
            onBusyChange(false);
        }
    }
    return <section className="booking-reading" aria-label="Belgeden alınan bilgiler"><h3>{document.filename}</h3><a href="#booking-edit-form">Doldurulan alanları gör ve düzenle</a><p>Kaynaklı ve çelişkisiz bilgiler boş taslak alanlarına otomatik doldurulur. Mevcut değerler korunur; uyuşmazlıkları aşağıdan çözebilirsiniz.</p><button type="button" disabled={busy || dirty} onClick={() => read()}>{busy ? 'İşlem sürüyor…' : result ? 'Kayıtlı sonucu aç' : 'Belgeyi oku ve taslağı doldur'}</button>{result && <button type="button" disabled={busy || dirty} onClick={() => read(true)}>Belgeyi yeniden oku</button>}<p><small>Yeniden okuma önceki başarılı sonucu arşivler. Okuma başarısız olursa önceki sonuç korunur.</small></p>{error && <OperationToast tone="error" message={userMessage(error)}/>}{message && <OperationToast tone="auto" message={message}/>}
 {assessment && <div className="document-assessment"><h3>Alan kapsamı · {assessment.workflow.scope}</h3><p>{assessment.workflow.filled}/{assessment.workflow.total} alan dolu · {assessment.workflow.review.length} alan inceleme bekliyor.</p><p>Bu aşamada {assessment.workflow.extractable} alan belgeden okunabiliyor. Doluluk, doğrulanmış veri oranı değildir.</p>{assessment.workflow.missing.length > 0 && <p>Tamamlanacak alanlar: {assessment.workflow.missing.map(f => f.label).join(', ')}.</p>}</div>}
 {assessment && <details><summary>Belge kontrol ayrıntıları</summary><div className="document-assessment" aria-label="Belge kontrol değerlendirmesi"><div><h3>Kontrol puanı: {assessment.controlScore} / 100</h3><span>{assessment.blockers.length ? 'Aktarım engellendi' : 'Taslak ve doğrulama ayrı izleniyor'}</span></div><p>{assessment.scoreMeaning} {assessment.capReason}</p><p>Alan doluluğu: {assessment.coverage.present}/{assessment.coverage.total} · Belgenin gerçekliği / düzenleyici kimliği: doğrulanmadı.</p><ul>{assessment.checks.map(c => <li key={c.key}>{c.label}: {c.earned}/{c.max}</li>)}</ul>{assessment.blockers.map(b => <p className="handover-error" key={b}>{b}</p>)}<small>Kural sürümü: {assessment.policyVersion}</small></div></details>}
 {result && <><p>Algılanan tür: <strong>{documentTypes[result.result.documentType]}</strong>{result.result.documentType !== document.type ? ' · Seçilen belge türünden farklı; kontrol edin.' : ''}</p><p>Güven oranı modelin tahminidir. Sayfa ve alıntı doğruluğu otomatik olarak doğrulanmış değildir.</p>{result.result.issues.length > 0 && <ul>{result.result.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>}
 {assessment?.revisionReport && ['booking_confirmation', 'booking_revision'].includes(result.result.documentType) && <section aria-label="Booking revizyon farkları"><h3>Önceki sürümle karşılaştırma</h3><p>Tarih ve cut-off değerleri belgede yazıldığı biçimde gösterilir. Bulunamayan bilgi silinmiş kabul edilmez; bu rapor booking değerlerini değiştirmez.</p>{assessment.revisionReport.status === 'no_previous' ? <p>Önceki sürüm bağlantısı yok. Belgeyi eklerken hangi sürümün yerine geldiğini seçin.</p> : assessment.revisionReport.status === 'previous_unread' ? <p>Karşılaştırma için önceki belgeyi de okuyun, ardından bu sonucu yeniden açın.</p> : assessment.revisionReport.status === 'unsupported' ? <p>Önceki ve yeni belgelerin teyit / revizyon türlerini kontrol edin.</p> : <><a href={`/api/bookings/${booking.id}/documents/${assessment.revisionReport.previousDocumentId}`} download>Önceki kaynak belgeyi indir</a>{assessment.revisionReport.changes.length === 0 ? <p>Okunan alanlarda fark bulunmadı. Bu, tüm belgenin aynı olduğunu kanıtlamaz.</p> : <div className="booking-document-table"><table><thead><tr><th>Alan</th><th>Önceki belge</th><th>Yeni belge</th><th>Durum</th></tr></thead><tbody>{assessment.revisionReport.changes.map(c => <tr key={c.key}><td>{c.label}</td><td>{c.before?.value || 'Bulunamadı'}{c.before && <small>{c.before.source} · Sayfa {c.before.page}</small>}</td><td>{c.after?.value || 'Bulunamadı'}{c.after && <small>{c.after.source} · Sayfa {c.after.page}</small>}</td><td>{c.state === 'changed' ? 'Değişti · inceleyin' : c.state === 'added' ? 'Yeni bilgi' : 'Yeni belgede bulunamadı'}</td></tr>)}</tbody></table></div>}</>}</section>}
 <label><input style={{ width: 16, minHeight: 16 }} type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)}/> Doldurulanlar dahil tüm alanları göster</label><div className="booking-document-table"><table><thead><tr><th>Seç</th><th>Alan / mevcut değer</th><th>Önerilen değer</th><th>Belgedeki kaynak</th></tr></thead><tbody>{result.result.fields.filter(f => showAll || !assessment || ['review', 'blocked', 'missing'].includes(assessment.fields.find(x => x.key === f.key)?.action || '')).map(f => <tr key={f.key}><td><input style={{ width: 16, minHeight: 16 }} type="checkbox" aria-label={([...bookingFields, ...supplementaryBookingFields].find(([key]) => key === f.key)?.[1] || f.key) + ' alanını seç'} checked={selected.includes(f.key)} disabled={busy || !f.value || !document.isCurrent || !assessment || assessment.fields.find(x => x.key === f.key)?.state !== 'review'} onChange={e => { setSelected(e.target.checked ? [...selected, f.key] : selected.filter(k => k !== f.key)); setAttested(false); }}/></td><td>{[...bookingFields, ...supplementaryBookingFields].find(([key]) => key === f.key)?.[1]}<small>{booking.draft[f.key] || 'Boş'}</small></td><td>{f.value || 'Bulunamadı'}<small>{assessment?.fields.find(x => x.key === f.key)?.action === 'keep' ? 'Mevcut değer korundu' : 'İnceleme bekliyor'} · {Math.round(f.confidence * 100)}% model tahmini</small>{assessment?.fields.find(x => x.key === f.key)?.reasons.map(r => <small key={r}>{r}</small>)}{assessment?.fields.find(x => x.key === f.key)?.peerConflicts.map(p => <small key={p.documentId}>Diğer belge: <a href={`/api/bookings/${booking.id}/documents/${p.documentId}`} download>{documentTypes[p.documentType as keyof typeof documentTypes] || p.documentType}</a> · {p.value}</small>)}</td><td>{f.source || '—'}{f.page && <small>Sayfa {f.page}</small>}</td></tr>)}</tbody></table></div>
 {selected.length > 0 && <div className="document-verification"><label><input type="checkbox" checked={attested} disabled={busy || !selected.length || !assessment} onChange={e => setAttested(e.target.checked)}/> Seçtiğim alanların değerlerini, alıntılarını ve sayfalarını orijinal belgede kontrol ettim; belgenin bu booking’e ait olduğunu teyit ettim.</label><label htmlFor="source-review-reason">Kontrol gerekçesi <small>Fark, tür uyuşmazlığı, belge uyarısı veya düşük güven varsa zorunlu.</small><textarea id="source-review-reason" value={reason} maxLength={1000} rows={3} onChange={e => setReason(e.target.value)} disabled={busy}/></label></div>}
 <div className="handover-save"><p>{dirty ? 'Önce formdaki değişiklikleri kaydedin.' : !document.isCurrent ? 'Eski sürümden alan aktarılamaz.' : 'Seçilen alanlar mevcut değerlerin yerine geçer. Booking teyidi veya platform gönderimi yapılmaz.'}</p><button type="button" disabled={busy || dirty || !document.isCurrent || !selected.length || !attested || !assessment || assessment.blockers.length > 0 || assessment.bookingRevision !== booking.revision || ((!assessment.typeMatch || assessment.issues.length > 0 || assessment.fields.some(f => selected.includes(f.key) && (f.conflict || f.peerConflicts.length > 0 || f.modelConfidence < .8))) && reason.trim().length < 15)} onClick={apply}>Seçilen alanları onayla ve kaydet</button></div></>}
 </section>;
}
