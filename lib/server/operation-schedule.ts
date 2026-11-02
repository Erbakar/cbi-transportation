import { AppError, db, digest, runtime } from './runtime';
import { ownBooking } from './operation-documents';
import { bookingExtractionSchema } from '../operations/booking-extraction';
import { eventLabels, scheduleActionSchema, taskInputSchema, dateHint, taskAlerts, chronologyWarnings, type EventKind, type ScheduleTask, type SourceProof } from '../operations/schedule';
type Doc = {
    id: string;
    type: string;
    filename: string;
    series_id: string;
    hash: string;
    object_key: string;
    extractionId: string | null;
    result: string | null;
    current: number;
};
type ScheduleRow = {
    revision: number;
    data: string;
    updated_at: string;
};
async function documents(id: string, owner: string) { return (await db().prepare("SELECT d.*,e.id extractionId,e.result, NOT EXISTS(SELECT 1 FROM operation_documents n WHERE n.replaces_id=d.id) current FROM operation_documents d LEFT JOIN booking_document_extractions e ON e.document_id=d.id AND e.status='ready' WHERE d.booking_id=? AND d.owner=? ORDER BY d.created_at DESC,d.id").bind(id, owner).all<Doc>()).results; }
function proposals(docs: Doc[]) {
    return docs.flatMap(doc => {
        if (!doc.current || !doc.result || !doc.extractionId || !['booking_confirmation', 'booking_revision'].includes(doc.type))
            return [];
        const ex = bookingExtractionSchema.parse(JSON.parse(doc.result));
        if (ex.documentType !== doc.type)
            return [];
        return Object.entries(ex.schedule || {}).flatMap(([key, e]) => e && key in eventLabels ? [{ kind: key as EventKind, source: { documentId: doc.id, extractionId: doc.extractionId!, seriesId: doc.series_id, key, filename: doc.filename, value: e.value, quote: e.source, page: e.page, confidence: e.confidence } satisfies SourceProof, hint: dateHint(e.value), issues: ex.issues }] : []);
    });
}
export async function scheduleWorkspace(id: string, owner: string) {
    await ownBooking(id, owner);
    const head = await db().prepare('SELECT evidence_revision,data FROM booking_handovers WHERE id=? AND owner=?').bind(id, owner).first<{
        evidence_revision: number;
        data: string;
    }>();
    const row = await db().prepare('SELECT revision,data,updated_at FROM booking_schedules WHERE booking_id=? AND owner=?').bind(id, owner).first<ScheduleRow>();
    const docs = await documents(id, owner), tasks: ScheduleTask[] = row ? JSON.parse(row.data) : [], current = docs.filter(d => d.current).map(d => ({ id: d.id, type: d.type, extractionId: d.extractionId }));
    const history = (await db().prepare('SELECT revision,action,reason,snapshot,created_at FROM booking_schedule_events WHERE booking_id=? AND owner=? ORDER BY revision DESC LIMIT 50').bind(id, owner).all<{
        revision: number;
        action: string;
        reason: string;
        snapshot: string;
        created_at: string;
    }>()).results.map(h => ({ ...h, tasks: JSON.parse(h.snapshot) as ScheduleTask[], snapshot: undefined }));
    return { revision: row?.revision || 0, evidenceRevision: head!.evidence_revision, reference: JSON.parse(head!.data).salesReference, assignee: JSON.parse(head!.data).assignee || '', tasks, proposals: proposals(docs), documents: current, history, warnings: chronologyWarnings(tasks), checkedAt: new Date().toISOString() };
}
export async function saveSchedule(id: string, owner: string, raw: unknown) {
    const parsed = scheduleActionSchema.safeParse(raw);
    if (!parsed.success)
        throw new AppError(parsed.error.issues[0]?.message || 'Takvim bilgileri geçersiz.');
    const input = parsed.data;
    const workspace = await scheduleWorkspace(id, owner);
    if (workspace.revision !== input.revision || workspace.evidenceRevision !== input.evidenceRevision)
        throw new AppError('Takvim veya belgeler değişti. Yenileyip tekrar kontrol edin.', 409);
    const tasks = workspace.tasks, now = new Date().toISOString();
    let task: ScheduleTask;
    if (input.action === 'task') {
        const existing = input.task.id ? tasks.find(t => t.id === input.task.id) : null;
        if (input.task.id && !existing)
            throw new AppError('Görev bulunamadı.', 404);
        if (existing?.source && input.task.kind !== existing.kind)
            throw new AppError('Belgeden gelen görevin türü değiştirilemez.');
        task = { ...input.task, id: existing?.id || crypto.randomUUID(), source: existing?.source || null, updatedAt: now, completedAt: input.task.status === 'done' ? (existing?.completedAt || now) : null };
    }
    else {
        const p = workspace.proposals.find(p => p.source.documentId === input.documentId && p.source.extractionId === input.extractionId && p.kind === input.key);
        if (!p)
            throw new AppError('Güncel tarih kaynağı bulunamadı.', 409);
        const doc = (await documents(id, owner)).find(d => d.id === input.documentId)!;
        const object = await runtime().BUCKET.get(doc.object_key);
        if (!object || await digest(await object.arrayBuffer()) !== doc.hash)
            throw new AppError('Kaynak belge bütünlüğü doğrulanamadı.', 409);
        const matches = tasks.filter(t => t.source?.seriesId === p.source.seriesId && t.source.key === p.kind);
        if (matches.length > 1)
            throw new AppError('Birden fazla görev eşleşti; görevleri kontrol edin.', 409);
        const existing = matches[0];
        if (existing && ['done', 'cancelled'].includes(existing.status))
            throw new AppError('Tamamlanmış veya iptal edilmiş görevi revize etmek için önce yeniden açın.', 409);
        const fields = taskInputSchema.safeParse({ kind: p.kind, label: eventLabels[p.kind], location: existing?.location || '', date: input.date, time: input.time, zone: input.zone, assignee: input.assignee, status: existing?.status || 'pending', remindHours: input.remindHours, urgentHours: input.urgentHours, requiredDocument: existing?.requiredDocument || (p.kind === 'siCutoff' ? 'instruction' : p.kind === 'vgmCutoff' ? 'vgm' : ''), note: existing?.note || '' });
        if (!fields.success)
            throw new AppError(fields.error.issues[0].message);
        task = { ...fields.data, id: existing?.id || crypto.randomUUID(), source: p.source, updatedAt: now, completedAt: null };
    }
    const next = tasks.some(t => t.id === task.id) ? tasks.map(t => t.id === task.id ? task : t) : [...tasks, task];
    if (next.length > 100)
        throw new AppError('Bir booking için en fazla 100 görev tutulabilir.');
    const data = JSON.stringify(next), guard = 'EXISTS(SELECT 1 FROM booking_handovers WHERE id=? AND owner=? AND evidence_revision=?)';
    const write = input.revision === 0 ? db().prepare(`INSERT INTO booking_schedules(booking_id,owner,revision,data,updated_at) SELECT ?,?,1,?,? WHERE ${guard} ON CONFLICT(booking_id) DO NOTHING`).bind(id, owner, data, now, id, owner, input.evidenceRevision) : db().prepare(`UPDATE booking_schedules SET revision=revision+1,data=?,updated_at=? WHERE booking_id=? AND owner=? AND revision=? AND ${guard}`).bind(data, now, id, owner, input.revision, id, owner, input.evidenceRevision);
    const result = await db().batch([write, db().prepare('INSERT INTO booking_schedule_events(id,booking_id,owner,revision,action,reason,snapshot,created_at) SELECT ?,?,?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(), id, owner, input.revision + 1, input.action, input.reason, data, now)]);
    if (!result[0].meta.changes)
        throw new AppError('Takvim veya belge eşzamanlı değişti. Güncel kaydı açın.', 409);
    return scheduleWorkspace(id, owner);
}
export async function operationCalendar(owner: string, hideTests=false) {
    const rows = (await db().prepare(`SELECT b.id,b.data booking,s.data,s.revision FROM booking_handovers b LEFT JOIN booking_schedules s ON s.booking_id=b.id AND s.owner=b.owner WHERE b.owner=? ${hideTests?"AND NOT EXISTS (SELECT 1 FROM booking_reporting p WHERE p.booking_id=b.id AND p.owner=b.owner AND json_extract(p.data,'$.test')=1)":''} ORDER BY b.updated_at DESC LIMIT 501`).bind(owner).all<{
        id: string;
        booking: string;
        data: string | null;
        revision: number | null;
    }>()).results;
    const docs = (await db().prepare("SELECT d.booking_id,d.id,d.type,e.id extractionId FROM operation_documents d LEFT JOIN booking_document_extractions e ON e.document_id=d.id AND e.status='ready' WHERE d.owner=? AND NOT EXISTS(SELECT 1 FROM operation_documents n WHERE n.replaces_id=d.id)").bind(owner).all<{
        booking_id: string;
        id: string;
        type: string;
        extractionId: string | null;
    }>()).results;
    const now = Date.now();
    return { checkedAt: new Date(now).toISOString(), truncated: rows.length > 500, bookings: rows.slice(0, 500).map(r => { const b = JSON.parse(r.booking), tasks: ScheduleTask[] = r.data ? JSON.parse(r.data) : []; return { id: r.id, reference: b.salesReference, customer: b.customer, tasks: tasks.map(t => ({ ...t, alerts: taskAlerts(t, now, docs.filter(d => d.booking_id === r.id)) })), warnings: chronologyWarnings(tasks) }; }) };
}
