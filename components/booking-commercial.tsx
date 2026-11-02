'use client';
import {OperationToast} from '@/components/operation-toast';
import {userMessage} from '@/lib/user-message';
import type {CostMapping} from '@/lib/operations/tmaxx-cost-mapping';
import { useCallback, useEffect, useState } from 'react';
import { isQuoteSummary } from '@/lib/operations/quote-costs';
import { lifecycleLabels, costTotal } from '@/lib/operations/booking-phase2';
import type { BookingExtraction } from '@/lib/operations/booking-extraction';
type CostLine = NonNullable<BookingExtraction['commercial']>['lines'][number] & {
    index: number;
    total: string | null;
    tariffCode: string;
    tariffName: string;
    tariffVerified: boolean;
};
type State = {
    lifecycle: string;
    evidenceRevision: number;
    documents: {
        id: string;
        filename: string;
        type: string;
        current: boolean;
        extraction_id: string | null;
        result: BookingExtraction | null;
    }[];
    history: {
        id: string;
        document_id: string;
        created_at: string;
        model: string;
    }[];
    costs: null | {
        revision: number;
        stale: boolean;
        updatedAt: string;
        data: {
            documentId: string;
            extractionId: string;
            lines: CostLine[];
            terms: NonNullable<BookingExtraction['commercial']>;
            verification: {
                reason: string;
            };
        };
    };
};
export function BookingCommercial({ bookingId, refreshKey, disabled, onBusyChange, onPendingChange }: {
    bookingId: string;
    refreshKey: number;
    disabled: boolean;
    onBusyChange: (v: boolean) => void;
    onPendingChange: (v: boolean) => void;
}) {
    const [state, setState] = useState<State | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [source, setSource] = useState(''), [verified, setVerified] = useState(false), [reason, setReason] = useState(''), [message, setMessage] = useState('');
    const [lines, setLines] = useState<{
        index: number;
        quantity: string | null;
        tariffCode: string;
        tariffName: string;
        tariffVerified: boolean;
    }[]>([]);
    const [mappings,setMappings]=useState<CostMapping[]>([]),[mappingMessage,setMappingMessage]=useState('');
    async function loadMappings(){setBusy(true);onBusyChange(true);setMappingMessage('');try{const r=await fetch('/api/bookings/cost-mappings'),d=await r.json() as {options:CostMapping[];error?:string};if(!r.ok)throw new Error(d.error);setMappings(d.options);setMappingMessage(`${d.options.length} masraf kalemi T-MAXX’tan okundu.`);}catch(e){setMappingMessage((e as Error).message);}finally{setBusy(false);onBusyChange(false);}}
    const load = useCallback(async () => { try {
        const r = await fetch(`/api/bookings/${bookingId}/phase2`), d = await r.json() as State & {
            error?: string;
        };
        if (!r.ok)
            throw new Error(d.error);
        setState(d);
    }
    catch (e) {
        setError(userMessage(e));
    } }, [bookingId]);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { void load(); }, [load, refreshKey]);
    const doc = state?.documents.find(d => d.id === source), commercial = doc?.result?.commercial;
    function choose(id: string) { setSource(id); const saved=state?.costs?.data; const doc=state?.documents.find(d=>d.id===id); const reuse=saved?.documentId===id&&saved?.extractionId===doc?.extraction_id; setLines(reuse?saved!.lines.map(({index,quantity,tariffCode,tariffName,tariffVerified})=>({index,quantity,tariffCode,tariffName,tariffVerified})):[]); setVerified(false); setReason(''); onPendingChange(false); }
    function update(index: number, patch: Partial<typeof lines[number]>) { setLines(prev => prev.map(l => l.index === index ? { ...l, ...patch } : l)); setVerified(false); onPendingChange(true); }
    async function save() { if (!state || !doc)
        return; setBusy(true); onBusyChange(true); setError(''); setMessage(''); try {
        const r = await fetch(`/api/bookings/${bookingId}/phase2`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: state.costs?.revision || 0, documentId: source, extractionId: doc.extraction_id, evidenceRevision: state.evidenceRevision, verified, reason, lines }) }), d = await r.json() as State & {
            error?: string;
        };
        if (!r.ok)
            throw new Error(d.error);
        setState(d);
        choose('');
        setMessage('Beklenen maliyetler kaynaklarıyla kaydedildi.');
    }
    catch (e) {
        setError(userMessage(e));
    }
    finally {
        setBusy(false);
        onBusyChange(false);
    } }
    return <section className="booking-documents" aria-label="Booking durumu ve maliyetler"><div className="handover-section-title"><div><h2>Durum ve beklenen maliyetler</h2><p>{state ? lifecycleLabels[state.lifecycle] : 'Yükleniyor…'}</p></div><button type="button" disabled={busy || lines.length > 0} onClick={load}>Yenile</button></div><div className="booking-document-body"><p>Durum, okunan güncel belgelere dayanır. Teyit veya revizyonun alınması operasyon onayı anlamına gelmez.</p>{error && <OperationToast tone="error" message={userMessage(error)}/>}{message && <OperationToast tone="auto" message={message}/>}
 {state?.costs && <><h3>Kayıtlı beklenen maliyetler · Sürüm {state.costs.revision}</h3>{state.costs.stale && <OperationToast tone="warning" message="Kaynak teklif veya okuma sonucu değişmiş. Kayıtlı maliyetleri yeni kaynakla karşılaştırıp yeniden kaydedin."/>}<div className="booking-document-table"><table><thead><tr><th>Kalem</th><th>Birim tutar</th><th>Miktar / esas</th><th>Toplam</th><th>T-MAXX masraf kalemi</th></tr></thead><tbody>{state.costs.data.lines.map(l => <tr key={l.index}><td>{l.description}<small>{l.source} · s. {l.page}</small></td><td>{l.amount} {l.currency}</td><td>{l.quantity ?? 'Belirsiz'} · {l.basisText || l.basis}</td><td>{l.total ?? 'Hesaplanmadı'} {l.currency}</td><td>{l.tariffVerified ? `${l.tariffCode} · ${l.tariffName}` : 'Eşleme bekliyor'}</td></tr>)}</tbody></table></div><p>Kontrol notu: {state.costs.data.verification.reason}</p><p>T-MAXX aktarımı yapılmadı. Para birimleri ayrı tutulur; vergi veya kur varsayımı yapılmaz.</p></>}
 <fieldset disabled={busy || disabled}><legend>Tekliften maliyet oluştur</legend><label>Kaynak teklif<select disabled={lines.length > 0} value={source} onChange={e => choose(e.target.value)}><option value="">Okunmuş güncel teklif seçin</option>{state?.documents.filter(d => d.current && d.type === 'quote' && d.result?.documentType === 'quote').map(d => <option value={d.id} key={d.id}>{d.filename}</option>)}</select></label>
 {doc && !commercial && <p>Bu eski okuma maliyet bilgisi içermiyor. Belgeyi aşağıdaki arşivden yeniden okuyun.</p>}
 {commercial && <><button type="button" onClick={loadMappings}>T-MAXX masraf kalemlerini getir</button>{mappingMessage&&<OperationToast tone="auto" message={mappingMessage}/>}<p>Seçim yalnız masraf türünü eşler. Tarife fiyatı, tedarikçi, vergi veya geçerlilik koşulları otomatik uygulanmaz.</p><a href={`/api/bookings/${bookingId}/documents/${source}`} download>Kaynak teklifi indir</a>{commercial.lines.length === 0 && <p>Teklifte okunabilir fiyat kalemi bulunamadı.</p>}<div className="booking-document-table"><table><thead><tr><th>Seç / kalem</th><th>Tutar ve kaynak</th><th>Miktar</th><th>T-MAXX masraf kalemi</th></tr></thead><tbody>{commercial.lines.map((l, index) => { const selected = lines.find(x => x.index === index); return <tr key={index}><td><label><input type="checkbox" checked={!!selected} disabled={l.amount === null || l.currency === null || isQuoteSummary(l.description)} onChange={e => { const next = e.target.checked ? [...lines, { index, quantity: l.quantity, tariffCode: '', tariffName: '', tariffVerified: false }] : lines.filter(x => x.index !== index); setLines(next); setVerified(false); onPendingChange(next.length > 0); }}/>{l.description}</label><small>{l.basisText || l.basis}{isQuoteSummary(l.description) ? ' · Ara toplam; ek maliyet değildir' : ''}</small></td><td>{l.amount ?? 'Belirsiz'} {l.currency ?? 'Para birimi belirsiz'}<small>{l.source} · s. {l.page}</small></td><td>{selected && <><input aria-label={`${l.description} miktar`} inputMode="decimal" pattern="[0-9]+([.][0-9]{1,4})?" value={selected.quantity ?? ''} onChange={e => update(index, { quantity: e.target.value || null })}/><small>{selected.quantity && /^\d+(\.\d{1,4})?$/.test(selected.quantity) ? costTotal(l.amount, selected.quantity) : 'Hesaplanmadı'} {l.currency}</small></>}</td><td>{selected && <><select aria-label={`${l.description} T-MAXX masraf kalemi`} value={selected.tariffCode} onChange={e=>{const option=mappings.find(m=>m.id===e.target.value);update(index,{tariffCode:option?.id||'',tariffName:option?.name||'',tariffVerified:!!option});}}><option value="">Eşleme seçilmedi</option>{selected.tariffCode&&!mappings.some(m=>m.id===selected.tariffCode)&&<option value={selected.tariffCode}>{selected.tariffName} · {selected.tariffCode} (kayıtlı)</option>}{mappings.map(m=><option value={m.id} key={m.id}>{m.name} · {m.firmName} · {m.id}</option>)}</select></>}</td></tr>; })}</tbody></table></div>
 {(['validity', 'freeTime', 'exclusions', 'conditions'] as const).map((key, i) => <div key={key}><h4>{['Geçerlilik', 'Serbest süreler', 'Hariç tutulanlar', 'Diğer koşullar'][i]}</h4>{commercial[key].length ? commercial[key].map((t, n) => <p key={n}>{t.source}<small> · Kaynak sayfa {t.page}</small></p>) : <p>Belgede bulunamadı.</p>}</div>)}
 <p>Yukarıdaki koşullar belgeden alınan kaynak alıntılarıdır. Teklifin geçerliliğini ve tam koşullarını kaynak dosyadan ayrıca teyit edin.</p><p>Yalnız bu sevkiyata uygulanacak kalemleri seçin. Miktarı ve fiyatın alış maliyeti olduğunu kontrol edin; dahil olan ücretleri ikinci kez eklemeyin.</p><label>Kontrol gerekçesi<textarea value={reason} maxLength={1000} onChange={e => { setReason(e.target.value); onPendingChange(true); }}/></label><label><input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)}/> Seçilen kalemleri, miktarları ve para birimlerini orijinal tekliften kontrol ettim; bu kayıt beklenen maliyet taslağıdır.</label><div className="handover-save"><button type="button" disabled={!lines.length || !verified || reason.trim().length < 15} onClick={save}>{busy ? 'Kaydediliyor…' : state?.costs ? 'Maliyetleri yeni sürüm olarak kaydet' : 'Beklenen maliyetleri kaydet'}</button><button type="button" onClick={() => choose('')}>Vazgeç</button></div></>}
 </fieldset>{!!state?.history.length && <details><summary>Önceki okuma kayıtları ({state.history.length})</summary>{state.history.map(h => <p key={h.id}><a href={`/api/bookings/${bookingId}/documents/${h.document_id}/extraction?historyId=${h.id}`} download>{state.documents.find(d => d.id === h.document_id)?.filename} · {h.created_at} · {h.model}</a></p>)}</details>}</div></section>;
}
