import { tmaxxCostMappings } from './booking-cost-mapping';
import { isQuoteSummary } from '../operations/quote-costs';
import { AppError, db, digest, runtime } from './runtime';
import { ownBooking, type DocumentRow } from './operation-documents';
import { extractBookingFile, extractionDocument, getExtraction, assessExtraction } from './booking-extraction';
import { bookingExtractionSchema, type BookingExtraction } from '../operations/booking-extraction';
import { bookingSchema } from '../operations/booking';
import { bookingLifecycle, costDecisionSchema, costTotal, matchBooking } from '../operations/booking-phase2';
import { documentMime, safeFilename, MAX_DOCUMENT_BYTES } from '../operations/documents';
type InboxRow = {
    id: string;
    owner: string;
    filename: string;
    mime: string;
    size: number;
    hash: string;
    object_key: string;
    source_reference: string;
    created_at: string;
    status: string;
    lease_until: number;
    extraction_id: string | null;
    result: string | null;
    model: string | null;
    booking_id: string | null;
    document_id: string | null;
};
const snapshotSQL = "SELECT json_group_array(json_array(id,revision,evidence_revision)) snapshot FROM (SELECT id,revision,evidence_revision FROM booking_handovers WHERE owner=? ORDER BY id)";
async function matches(owner: string, result: BookingExtraction) {
    const snapshot = (await db().prepare(snapshotSQL).bind(owner).first<{
        snapshot: string;
    }>())!.snapshot;
    const { results: rows } = await db().prepare('SELECT id,data FROM booking_handovers WHERE owner=?').bind(owner).all<{
        id: string;
        data: string;
    }>();
    const { results: evidence } = await db().prepare("SELECT d.booking_id,e.result FROM operation_documents d JOIN booking_document_extractions e ON e.document_id=d.id WHERE d.owner=? AND e.status='ready' AND NOT EXISTS(SELECT 1 FROM operation_documents n WHERE n.replaces_id=d.id)").bind(owner).all<{
        booking_id: string;
        result: string;
    }>();
    return { ...matchBooking(result, rows.map(r => ({ id: r.id, draft: bookingSchema.parse(JSON.parse(r.data)), evidence: evidence.filter(e => e.booking_id === r.id).map(e => bookingExtractionSchema.parse(JSON.parse(e.result))) }))), snapshot };
}
export async function inboxList(owner: string) {
    const { results } = await db().prepare('SELECT * FROM booking_inbox WHERE owner=? ORDER BY created_at DESC LIMIT 100').bind(owner).all<InboxRow>();
    return Promise.all(results.map(async (r) => ({ id: r.id, filename: r.filename, status: r.status, createdAt: r.created_at, bookingId: r.booking_id, documentId: r.document_id, extraction: r.result ? bookingExtractionSchema.parse(JSON.parse(r.result)) : null, match: r.result && r.status !== 'attached' ? await matches(owner, bookingExtractionSchema.parse(JSON.parse(r.result))) : null })));
}
export async function uploadInbox(owner: string, form: FormData) {
    const file = form.get('file'), source = String(form.get('sourceReference') || '').trim();
    if (!(file instanceof File) || form.getAll('file').length !== 1 || !file.size || file.size > MAX_DOCUMENT_BYTES || !source || source.length > 500)
        throw new AppError('En fazla 10 MB belge ve kaynak açıklaması gerekli.');
    const bytes = await file.arrayBuffer(), hash = await digest(bytes), filename = safeFilename(file.name), mime = documentMime(new Uint8Array(bytes), filename);
    const existing = await db().prepare('SELECT id FROM booking_inbox WHERE owner=? AND hash=?').bind(owner, hash).first<{
        id: string;
    }>();
    if (existing)
        return existing.id;
    const id = crypto.randomUUID(), key = `booking-inbox/${id}`;
    await runtime().BUCKET.put(key, bytes, { httpMetadata: { contentType: mime } });
    try {
        await db().prepare('INSERT INTO booking_inbox(id,owner,filename,mime,size,hash,object_key,source_reference,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id, owner, filename, mime, file.size, hash, key, source, new Date().toISOString()).run();
    }
    catch (e) {
        const committed = await db().prepare('SELECT id FROM booking_inbox WHERE owner=? AND hash=?').bind(owner, hash).first<{
            id: string;
        }>();
        if (committed?.id === id)
            return id;
        await runtime().BUCKET.delete(key);
        if (committed)
            return committed.id;
        throw e;
    }
    return id;
}
async function ownInbox(id: string, owner: string) { const row = await db().prepare('SELECT * FROM booking_inbox WHERE id=? AND owner=?').bind(id, owner).first<InboxRow>(); if (!row)
    throw new AppError('Gelen belge bulunamadı.', 404); return row; }
export async function readInbox(id: string, owner: string) {
    const row = await ownInbox(id, owner);
    if (row.status === 'attached')
        return;
    if (!row.result) {
        const acquired = await db().prepare("UPDATE booking_inbox SET status='reading',lease_until=?,extraction_id=? WHERE id=? AND owner=? AND (status='pending' OR (status='reading' AND lease_until<?))").bind(Date.now() + 300000, crypto.randomUUID(), id, owner, Date.now()).run();
        if (!acquired.meta.changes)
            throw new AppError('Belge halen okunuyor.', 409);
        const current = await ownInbox(id, owner), model = runtime().GEMINI_MODEL || 'gemini-3.1-flash-lite';
        try {
            const result = await extractBookingFile(row, model);
            const saved = await db().prepare("UPDATE booking_inbox SET status='ready',result=?,model=?,lease_until=0 WHERE id=? AND owner=? AND extraction_id=? AND status='reading'").bind(JSON.stringify(result), model, id, owner, current.extraction_id).run();
            if (!saved.meta.changes)
                throw new AppError('Okuma oturumu değişti.', 409);
        }
        catch (e) {
            await db().prepare("UPDATE booking_inbox SET status='pending',lease_until=0 WHERE id=? AND owner=? AND extraction_id=? AND status='reading'").bind(id, owner, current.extraction_id).run();
            throw e;
        }
    }
    const ready = await ownInbox(id, owner), result = bookingExtractionSchema.parse(JSON.parse(ready.result!)), match = await matches(owner, result);
    if (match.automaticId && result.documentType === 'booking_confirmation')
        await attachInbox(id, owner, match.automaticId, 'automatic', '', null);
    // A revision needs an explicit predecessor so unrelated document series cannot be silently superseded.
}
export async function attachInbox(id: string, owner: string, bookingId: string, mode: 'automatic' | 'manual', reason: string, replacesId: string | null) {
    const row = await ownInbox(id, owner);
    await ownBooking(bookingId, owner);
    if (row.status === 'attached') {
        if (row.booking_id !== bookingId)
            throw new AppError('Belge başka devre bağlanmış.', 409);
        return;
    }
    if (row.status !== 'ready' || !row.result)
        throw new AppError('Önce belgeyi okuyun.', 409);
    const result = bookingExtractionSchema.parse(JSON.parse(row.result));
    if (!['booking_confirmation', 'booking_revision', 'booking_request', 'quote'].includes(result.documentType))
        throw new AppError('Bu belge booking süreci için uygun değil.', 422);
    const object = await runtime().BUCKET.get(row.object_key);
    if (!object || await digest(await object.arrayBuffer()) !== row.hash)
        throw new AppError('Kaynak belgenin bütünlüğü doğrulanamadı.', 409);
    const match = await matches(owner, result);
    if (mode === 'automatic' && (match.automaticId !== bookingId || result.documentType === 'booking_revision'))
        throw new AppError('Otomatik eşleşme kesin değil; kaynağı kontrol ederek devir seçin.', 409);
    if (mode === 'manual' && reason.trim().length < 15)
        throw new AppError('Belge ve devir ilişkisini kontrol edip gerekçenizi yazın.');
    let previous: DocumentRow | null = null;
    if (replacesId) {
        previous = await extractionDocument(bookingId, replacesId, owner);
        if (!['booking_confirmation', 'booking_revision'].includes(previous.type))
            throw new AppError('Revizyon için önceki teyit veya revizyonu seçin.');
        if (await db().prepare('SELECT id FROM operation_documents WHERE replaces_id=?').bind(replacesId).first())
            throw new AppError('Önceki belge artık güncel değil.', 409);
    }
    if (result.documentType === 'booking_revision' && !previous)
        throw new AppError('Revizyonun yerine geçtiği belgeyi seçin.');
    const duplicate = await db().prepare('SELECT id FROM operation_documents WHERE booking_id=? AND owner=? AND hash=?').bind(bookingId, owner, row.hash).first<{
        id: string;
    }>();
    if (duplicate) {
        await db().prepare("UPDATE booking_inbox SET status='attached',booking_id=?,document_id=?,decision=? WHERE id=? AND owner=? AND status='ready'").bind(bookingId, duplicate.id, JSON.stringify({ mode, reason, duplicate: true }), id, owner).run();
        return;
    }
    const docId = crypto.randomUUID(), now = new Date().toISOString();
    const decision = JSON.stringify({ mode, reason, candidates: match.candidates, extractionId: row.extraction_id, at: now });
    const saved = await db().batch([
        db().prepare(`INSERT INTO operation_documents(id,booking_id,owner,series_id,version,replaces_id,type,filename,mime,size,hash,object_key,source_reference,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM booking_inbox WHERE id=? AND owner=? AND status='ready' AND extraction_id=?) AND (${snapshotSQL})=?`).bind(docId, bookingId, owner, previous?.series_id || docId, (previous?.version || 0) + 1, previous?.id || null, result.documentType, row.filename, row.mime, row.size, row.hash, row.object_key, row.source_reference, now, id, owner, row.extraction_id, owner, match.snapshot),
        db().prepare("INSERT INTO booking_document_extractions(document_id,id,status,lease_until,result,model,created_at) SELECT ?,?,'ready',0,?,?,? WHERE changes()=1").bind(docId, row.extraction_id, row.result, row.model, now),
        db().prepare("UPDATE booking_inbox SET status='attached',booking_id=?,document_id=?,decision=? WHERE id=? AND owner=? AND changes()=1").bind(bookingId, docId, decision, id, owner),
    ]);
    if (!saved[0].meta.changes)
        throw new AppError('Devir veya belge bilgileri değişti; eşleştirmeyi yeniden açın.', 409);
}
export async function phase2Workspace(bookingId: string, owner: string) {
    await ownBooking(bookingId, owner);
    const { results } = await db().prepare("SELECT d.id,d.type,d.filename,e.id extraction_id,e.result,e.created_at, NOT EXISTS(SELECT 1 FROM operation_documents n WHERE n.replaces_id=d.id) current FROM operation_documents d LEFT JOIN booking_document_extractions e ON e.document_id=d.id AND e.status='ready' WHERE d.booking_id=? AND d.owner=? ORDER BY d.created_at DESC").bind(bookingId, owner).all<{
        id: string;
        type: string;
        filename: string;
        extraction_id: string | null;
        result: string | null;
        current: number;
    }>();
    const docs = results.map(d => ({ ...d, current: !!d.current, result: d.result ? bookingExtractionSchema.parse(JSON.parse(d.result)) : null }));
    const sheet = await db().prepare('SELECT revision,data,updated_at,document_id,extraction_id FROM booking_cost_sheets WHERE booking_id=? AND owner=?').bind(bookingId, owner).first<{
        revision: number;
        data: string;
        updated_at: string;
        document_id: string;
        extraction_id: string;
    }>();
    const row = await db().prepare('SELECT evidence_revision FROM booking_handovers WHERE id=? AND owner=?').bind(bookingId, owner).first<{
        evidence_revision: number;
    }>();
    const { results: history } = await db().prepare('SELECT h.id,h.document_id,h.model,h.created_at FROM booking_extraction_history h JOIN operation_documents d ON d.id=h.document_id WHERE d.booking_id=? AND d.owner=? ORDER BY h.created_at DESC').bind(bookingId, owner).all();
    return { lifecycle: bookingLifecycle(docs), evidenceRevision: row!.evidence_revision, documents: docs, history, costs: sheet ? { revision: sheet.revision, data: JSON.parse(sheet.data), updatedAt: sheet.updated_at, stale: !docs.some(d => d.id === sheet.document_id && d.current && d.extraction_id === sheet.extraction_id) } : null };
}
export async function saveCosts(bookingId: string, owner: string, raw: unknown) {
    const parsed = costDecisionSchema.safeParse(raw);
    if (!parsed.success)
        throw new AppError(parsed.error.issues[0]?.message || 'Maliyet bilgileri geçersiz.');
    const input = parsed.data;
    const doc = await extractionDocument(bookingId, input.documentId, owner), ex = await getExtraction(doc);
    if (!ex || ex.id !== input.extractionId)
        throw new AppError('Okuma sonucu değişti.', 409);
    const a = await assessExtraction(doc, ex);
    if (a.blockers.length || a.evidenceRevision !== input.evidenceRevision)
        throw new AppError('Kaynak belge değişti veya bütünlüğü doğrulanamadı.', 409);
    if (doc.type !== 'quote' || ex.result.documentType !== 'quote' || !ex.result.commercial)
        throw new AppError('Kaynaklı teklif maliyetleri bulunamadı.', 422);
    const mappingCatalog = input.lines.some(l=>l.tariffCode) ? await tmaxxCostMappings(owner) : null;
    const lines = input.lines.map(l => { const source = ex.result.commercial!.lines[l.index]; if (!source)
        throw new AppError('Maliyet satırı bulunamadı.'); if (isQuoteSummary(source.description))
        throw new AppError('Ara toplam ek maliyet olarak kaydedilemez. Teklifi yeniden okuyun.'); if (source.amount === null || source.currency === null)
        throw new AppError('Tutarı veya para birimi belirsiz satır maliyete eklenemez.'); const mapping = l.tariffCode ? mappingCatalog?.options.find(m=>m.id===l.tariffCode) : null;
        if (l.tariffCode && (!mapping || mapping.name !== l.tariffName || !l.tariffVerified)) throw new AppError('T-MAXX masraf kalemi değişti veya doğrulanamadı. Listeyi yenileyin.', 409);
        return { ...source, index: l.index, quantity: l.quantity, quotedQuantity: source.quantity, total: costTotal(source.amount, l.quantity), tariffCode: l.tariffCode, tariffName: l.tariffName, tariffVerified: !!mapping, tmaxxMapping: mapping ? { targetField: 'invoiceItemType', id: Number(mapping.id), name: mapping.name, firmName: mapping.firmName, checkedAt: mappingCatalog!.checkedAt } : null }; });
    const now = new Date().toISOString(), revision = input.revision + 1;
    const data = JSON.stringify({ documentId: doc.id, extractionId: ex.id, documentHash: doc.hash, lines, terms: ex.result.commercial, verification: { owner, reason: input.reason, at: now }, platformStatus: 'not_sent' });
    const guard = 'EXISTS(SELECT 1 FROM booking_handovers WHERE id=? AND owner=? AND evidence_revision=?)';
    const write = input.revision === 0 ? db().prepare(`INSERT INTO booking_cost_sheets(booking_id,owner,revision,document_id,extraction_id,data,updated_at) SELECT ?,?,1,?,?,?,? WHERE ${guard} ON CONFLICT(booking_id) DO NOTHING`).bind(bookingId, owner, doc.id, ex.id, data, now, bookingId, owner, input.evidenceRevision) : db().prepare(`UPDATE booking_cost_sheets SET revision=revision+1,document_id=?,extraction_id=?,data=?,updated_at=? WHERE booking_id=? AND owner=? AND revision=? AND ${guard}`).bind(doc.id, ex.id, data, now, bookingId, owner, input.revision, bookingId, owner, input.evidenceRevision);
    const saved = await db().batch([write, db().prepare('INSERT INTO booking_cost_events(id,booking_id,owner,revision,snapshot,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(), bookingId, owner, revision, data, now)]);
    if (!saved[0].meta.changes)
        throw new AppError('Maliyet veya kaynak değişmiş. Güncel kaydı yeniden açın.', 409);
    return phase2Workspace(bookingId, owner);
}
export async function downloadInbox(id: string, owner: string) {
    const row = await ownInbox(id, owner), object = await runtime().BUCKET.get(row.object_key);
    if (!object)
        throw new AppError('Kaynak dosya bulunamadı.', 404);
    const bytes = await object.arrayBuffer();
    if (await digest(bytes) !== row.hash)
        throw new AppError('Kaynak dosya bütünlüğü doğrulanamadı.', 409);
    return new Response(bytes, { headers: { 'Content-Type': row.mime, 'Content-Disposition': `attachment; filename="document"; filename*=UTF-8''${encodeURIComponent(row.filename).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16))}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
