import { requireUser } from '@/lib/server/auth';
import { AppError, errorResponse, json, sameOrigin } from '@/lib/server/runtime';
import { checkRecord } from '@/lib/server/record-check';
export async function POST(req: Request, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    let id = '', owner = '';
    try {
        sameOrigin(req);
        owner = await requireUser(req);
        id = (await params).id;
        const raw = await req.text();
        if (raw.length > 200)
            throw new AppError('İstek çok uzun.', 413);
        const body = raw ? JSON.parse(raw) : {action:'check'};
        const action = body.action;
        if (!['check', 'submit'].includes(action))
            throw new AppError('Geçersiz işlem.');
        const reviewApproval=body.reviewApproval as import('@/lib/server/inttra-workflow').ReviewApproval|undefined;
        if(reviewApproval!==undefined&&(action!=='submit'||!reviewApproval||typeof reviewApproval.inputHash!=='string'||!/^[a-f0-9]{64}$/.test(reviewApproval.inputHash)||typeof reviewApproval.createdAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(reviewApproval.createdAt)||!Number.isFinite(Date.parse(reviewApproval.createdAt))))
            throw new AppError('Uyarı onay bilgisi geçersiz. Güncel uyarıyı tekrar açın.');
        return json({ record: await checkRecord(owner, id, action, reviewApproval) });
    }
    catch (e) {
        return errorResponse(e);
    }
}
