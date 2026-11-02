import { requireUser } from '@/lib/server/auth';
import { AppError, db, errorResponse, json } from '@/lib/server/runtime';
import { assessBooking, bookingSchema, referenceKey } from '@/lib/operations/booking';
export async function GET(req: Request) { try {
    const owner = await requireUser(req), ref = new URL(req.url).searchParams.get('reference') || '';
    if (!ref.trim() || ref.length > 200)
        throw new AppError('Tam satış referansı gerekli.');
    const row = await db().prepare('SELECT * FROM booking_handovers WHERE owner=? AND reference_key=?').bind(owner, referenceKey(ref)).first<{
        id: string;
        data: string;
        revision: number;
        created_at: string;
        updated_at: string;
    }>();
    if (!row)
        throw new AppError('Devir bulunamadı.', 404);
    const draft = bookingSchema.parse(JSON.parse(row.data));
    return json({ booking: { id: row.id, draft, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at, assessment: assessBooking(draft) } });
}
catch (e) {
    return errorResponse(e);
} }
