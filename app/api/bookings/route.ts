import { z } from 'zod';
import { requireUser } from '@/lib/server/auth';
import { AppError, db, errorResponse, json, sameOrigin } from '@/lib/server/runtime';
import { bookingSchema, assessBooking, referenceKey } from '@/lib/operations/booking';
type Row = {
    id: string;
    revision: number;
    data: string;
    created_at: string;
    updated_at: string;
};
function view(row: Row) { const draft = bookingSchema.parse(JSON.parse(row.data)); return { id: row.id, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at, draft, assessment: assessBooking(draft) }; }
const inputSchema = z.object({ id: z.string().uuid().optional(), revision: z.number().int().positive().optional(), draft: bookingSchema }).strict();
export async function GET(req: Request) {
    try {
        const owner = await requireUser(req);
        const id = new URL(req.url).searchParams.get('id');
        if (id) {
            if (!z.string().uuid().safeParse(id).success) throw new AppError('Devir kimliği geçersiz.', 400);
            const row = await db().prepare('SELECT id,revision,data,created_at,updated_at FROM booking_handovers WHERE id=? AND owner=?').bind(id, owner).first<Row>();
            if (!row) throw new AppError('Devir kaydı bulunamadı.', 404);
            return json({ bookings: [view(row)] });
        }
        const hideTests=new URL(req.url).searchParams.get('hideTests')==='true';
        const { results } = await db().prepare(`SELECT b.id,b.revision,b.data,b.created_at,b.updated_at FROM booking_handovers b WHERE b.owner=? ${hideTests?"AND NOT EXISTS (SELECT 1 FROM booking_reporting p WHERE p.booking_id=b.id AND p.owner=b.owner AND json_extract(p.data,'$.test')=1)":''} ORDER BY b.updated_at DESC LIMIT 200`).bind(owner).all<Row>();
        return json({ bookings: results.map(view) });
    }
    catch (e) {
        return errorResponse(e);
    }
}
export async function POST(req: Request) {
    try {
        sameOrigin(req);
        const owner = await requireUser(req);
        // Bound streamed bodies too; Content-Length alone is insufficient.
        const reader = req.body?.getReader();
        if (!reader)
            throw new AppError('Devir bilgileri gerekli.');
        let size = 0;
        const chunks: Uint8Array[] = [];
        while (true) {
            const part = await reader.read();
            if (part.done)
                break;
            size += part.value.byteLength;
            if (size > 16384) {
                await reader.cancel();
                throw new AppError('Devir bilgileri çok uzun.', 413);
            }
            chunks.push(part.value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.length;
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(new TextDecoder().decode(bytes));
        }
        catch {
            throw new AppError('Geçerli devir bilgileri gönderin.');
        }
        const input = inputSchema.safeParse(parsed);
        if (!input.success)
            throw new AppError(input.error.issues[0]?.message || 'Devir bilgilerini kontrol edin.');
        const { id: existingId, revision, draft } = input.data;
        if (Boolean(existingId) !== Boolean(revision))
            throw new AppError('Kayıt ve sürüm bilgisi birlikte gerekli.');
        const key = referenceKey(draft.salesReference), id = existingId || crypto.randomUUID(), now = new Date().toISOString(), data = JSON.stringify(draft);
        const duplicate = await db().prepare('SELECT id FROM booking_handovers WHERE owner=? AND reference_key=? AND id<>?').bind(owner, key, id).first();
        if (duplicate)
            throw new AppError('Bu satış referansı zaten kayıtlı. Mevcut devri açın.', 409);
        const nextRevision = existingId ? revision! + 1 : 1;
        const write = existingId
            ? db().prepare('UPDATE booking_handovers SET reference_key=?,data=?,revision=revision+1,updated_at=? WHERE id=? AND owner=? AND revision=?').bind(key, data, now, id, owner, revision!)
            : db().prepare('INSERT INTO booking_handovers(id,owner,reference_key,revision,data,created_at,updated_at) VALUES(?,?,?,1,?,?,?) ON CONFLICT(owner,reference_key) DO NOTHING').bind(id, owner, key, data, now, now);
        const results = await db().batch([write, db().prepare('INSERT INTO booking_handover_events(id,booking_id,owner,revision,action,snapshot,created_at) SELECT ?,?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(), id, owner, nextRevision, existingId ? 'updated' : 'created', data, now)]);
        if (!results[0].meta.changes)
            throw new AppError('Kayıt değişmiş veya referans zaten kullanılıyor. Listeyi yenileyin.', 409);
        const row = await db().prepare('SELECT id,revision,data,created_at,updated_at FROM booking_handovers WHERE id=? AND owner=?').bind(id, owner).first<Row>();
        if (!row)
            throw new AppError('Kayıt yeniden okunamadı.', 500);
        return json({ booking: view(row) }, existingId ? 200 : 201);
    }
    catch (e) {
        return errorResponse(e);
    }
}
