import { requireUser } from '@/lib/server/auth';
import { db, errorResponse, json } from '@/lib/server/runtime';
import { bookingLifecycle } from '@/lib/operations/booking-phase2';
import { bookingExtractionSchema } from '@/lib/operations/booking-extraction';
export async function GET(req: Request) { try {
    const owner = await requireUser(req);
    const { results } = await db().prepare("SELECT d.booking_id,d.type,e.result FROM operation_documents d JOIN booking_document_extractions e ON e.document_id=d.id WHERE d.owner=? AND e.status='ready' AND NOT EXISTS(SELECT 1 FROM operation_documents n WHERE n.replaces_id=d.id)").bind(owner).all<{
        booking_id: string;
        type: string;
        result: string;
    }>();
    return json({ statuses: Object.fromEntries([...new Set(results.map(r => r.booking_id))].map(id => [id, bookingLifecycle(results.filter(r => r.booking_id === id).map(r => ({ type: r.type, current: true, result: bookingExtractionSchema.parse(JSON.parse(r.result)) })))])) });
}
catch (e) {
    return errorResponse(e);
} }
