import { requireUser } from '@/lib/server/auth';
import { errorResponse, json } from '@/lib/server/runtime';
import { operationCalendar } from '@/lib/server/operation-schedule';
export async function GET(req: Request) { try {
    return json(await operationCalendar(await requireUser(req),new URL(req.url).searchParams.get('hideTests')==='true'));
}
catch (e) {
    return errorResponse(e);
} }
