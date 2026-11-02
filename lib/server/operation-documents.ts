import { AppError, db, digest, runtime } from './runtime';
import { documentMetadata, documentMime, MAX_DOCUMENT_BYTES, safeFilename, type DocumentType, type OperationDocument } from '../operations/documents';
export type DocumentRow = {
    id: string;
    booking_id: string;
    owner: string;
    series_id: string;
    version: number;
    replaces_id: string | null;
    type: DocumentType;
    filename: string;
    mime: string;
    size: number;
    hash: string;
    object_key: string;
    source_reference: string;
    created_at: string;
};
export async function ownBooking(id: string, owner: string) {
    const found = await db().prepare('SELECT id FROM booking_handovers WHERE id=? AND owner=?').bind(id, owner).first();
    if (!found)
        throw new AppError('Devir kaydı bulunamadı.', 404);
}
export function documentView(row: DocumentRow, current: boolean): OperationDocument { return { id: row.id, bookingId: row.booking_id, seriesId: row.series_id, version: row.version, replacesId: row.replaces_id, type: row.type, filename: row.filename, size: row.size, sourceReference: row.source_reference, createdAt: row.created_at, uploadedBy: row.owner, isCurrent: current }; }
export async function listDocuments(bookingId: string, owner: string) {
    await ownBooking(bookingId, owner);
    const { results } = await db().prepare('SELECT * FROM operation_documents WHERE booking_id=? AND owner=? ORDER BY created_at DESC,version DESC').bind(bookingId, owner).all<DocumentRow>();
    const superseded = new Set(results.map(r => r.replaces_id));
    return results.map(row => documentView(row, !superseded.has(row.id)));
}
export async function documentForm(req: Request) {
    const reader = req.body?.getReader();
    if (!reader)
        throw new AppError('Dosya gerekli.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        size += value.byteLength;
        if (size > MAX_DOCUMENT_BYTES + 65536) {
            await reader.cancel();
            throw new AppError('Belge en fazla 10 MB olabilir.', 413);
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
    }
    try {
        return await new Response(bytes, { headers: { 'Content-Type': req.headers.get('content-type') || '' } }).formData();
    }
    catch {
        throw new AppError('Dosya yükleme biçimi geçersiz.');
    }
}
export async function addDocument(bookingId: string, owner: string, form: FormData) {
    await ownBooking(bookingId, owner);
    const parsed = documentMetadata.safeParse({ type: form.get('type'), sourceReference: form.get('sourceReference'), ...(form.get('replacesId') ? { replacesId: form.get('replacesId') } : {}) });
    if (!parsed.success)
        throw new AppError(parsed.error.issues[0]?.message || 'Belge bilgileri geçersiz.');
    const files = form.getAll('file');
    const file = files[0];
    if (files.length !== 1 || !(file instanceof File) || file.size === 0)
        throw new AppError('Bir belge seçin.');
    if (file.size > MAX_DOCUMENT_BYTES)
        throw new AppError('Belge en fazla 10 MB olabilir.', 413);
    const bytes = await file.arrayBuffer(), hash = await digest(bytes), filename = safeFilename(file.name);
    let mime: string;
    try {
        mime = documentMime(new Uint8Array(bytes), filename);
    }
    catch (e) {
        throw new AppError((e as Error).message);
    }
    const { type, sourceReference, replacesId } = parsed.data;
    let previous: DocumentRow | null = null;
    if (replacesId) {
        previous = await db().prepare('SELECT * FROM operation_documents WHERE id=? AND booking_id=? AND owner=?').bind(replacesId, bookingId, owner).first<DocumentRow>();
        if (!previous)
            throw new AppError('Önceki belge bulunamadı.', 404);
        // Type may change from confirmation to revision or draft to final; original classification remains recorded.
    }
    const duplicate = await db().prepare('SELECT id FROM operation_documents WHERE booking_id=? AND owner=? AND hash=?').bind(bookingId, owner, hash).first<{
        id: string;
    }>();
    if (duplicate)
        return { duplicate: true, documentId: duplicate.id };
    if (previous && await db().prepare('SELECT id FROM operation_documents WHERE replaces_id=?').bind(previous.id).first())
        throw new AppError('Belgenin daha yeni sürümü var. Listeyi yenileyin.', 409);
    const bucket = runtime().BUCKET;
    if (!bucket)
        throw new AppError('Dosya deposu yapılandırılmadı.', 503);
    const id = crypto.randomUUID(), seriesId = previous?.series_id || id, version = (previous?.version || 0) + 1, now = new Date().toISOString();
    const key = `operation-documents/${bookingId}/${id}`;
    await bucket.put(key, bytes, { httpMetadata: { contentType: mime } });
    try {
        await db().prepare('INSERT INTO operation_documents(id,booking_id,owner,series_id,version,replaces_id,type,filename,mime,size,hash,object_key,source_reference,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id, bookingId, owner, seriesId, version, previous?.id || null, type, filename, mime, file.size, hash, key, sourceReference, now).run();
    }
    catch (error) {
        // A lost response can follow a successful commit. Never delete a committed source object.
        const committed = await db().prepare('SELECT id FROM operation_documents WHERE id=?').bind(id).first();
        if (committed)
            return { duplicate: false, documentId: id };
        await bucket.delete(key);
        const winner = await db().prepare('SELECT id FROM operation_documents WHERE booking_id=? AND owner=? AND hash=?').bind(bookingId, owner, hash).first<{
            id: string;
        }>();
        if (winner)
            return { duplicate: true, documentId: winner.id };
        if (previous && await db().prepare('SELECT id FROM operation_documents WHERE replaces_id=?').bind(previous.id).first())
            throw new AppError('Yeni sürüm başka bir işlemde kaydedildi. Listeyi yenileyin.', 409);
        throw error;
    }
    return { duplicate: false, documentId: id };
}
