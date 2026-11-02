import { requireUser } from '@/lib/server/auth';
import { AppError, db, errorResponse, runtime } from '@/lib/server/runtime';
import { ownBooking, type DocumentRow } from '@/lib/server/operation-documents';
export async function GET(req: Request, { params }: {
    params: Promise<{
        id: string;
        documentId: string;
    }>;
}) {
    try {
        const owner = await requireUser(req), { id, documentId } = await params;
        await ownBooking(id, owner);
        const row = await db().prepare('SELECT * FROM operation_documents WHERE id=? AND booking_id=? AND owner=?').bind(documentId, id, owner).first<DocumentRow>();
        if (!row)
            throw new AppError('Belge bulunamadı.', 404);
        const object = await runtime().BUCKET.get(row.object_key);
        if (!object)
            throw new AppError('Kaynak dosya bulunamadı.', 404);
        return new Response(object.body, { headers: { 'Content-Type': row.mime, 'Content-Disposition': `attachment; filename="document"; filename*=UTF-8''${encodeURIComponent(row.filename).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16))}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    catch (e) {
        return errorResponse(e);
    }
}
