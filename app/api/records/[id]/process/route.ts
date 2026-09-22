import { transfer } from '@/lib/server/transfer';
import { resolveInstruction } from '@/lib/instruction-rules';
import { prepareSource } from '@/lib/server/instruction-preparation';
import { platformEnabled, pausedPlatforms } from '@/lib/server/platform-policy';
import { inttraQualityIssues } from '@/lib/inttra-quality';
import { applyManual } from '@/lib/manual-extraction';
import { emptyManual, manualIssues, manualSchema } from '@/lib/manual';
import { requireUser } from '@/lib/server/auth';
import { AppError, db, digest, errorResponse, json, sameOrigin } from '@/lib/server/runtime';
import { sourceFiles, owned, view } from '@/lib/server/records';
import { extractDocuments } from '@/lib/server/extraction';
import { contracts } from '@/lib/server/platforms';
import { Extraction, minimumFields, validate } from '@/lib/domain';
export async function POST(req: Request, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    let id = '', owner = '', locked = false, lease = 0;
    try {
        sameOrigin(req);
        owner = await requireUser(req);
        id = (await params).id;
        const raw = await req.text();
        if (raw.length > 200)
            throw new AppError('İstek çok uzun.', 413);
        const action = raw ? JSON.parse(raw).action : 'check';
        if (!['check', 'submit'].includes(action))
            throw new AppError('Geçersiz işlem.');
        const r = await owned(id, owner);
        if (r.status === 'complete')
            return json({ record: await view(r) });
        const existingDeliveries = await db().prepare('SELECT platform,status FROM deliveries WHERE record_id=?').bind(id).all<{
            platform: string;
            status: string;
        }>();
        if (existingDeliveries.results.some(d => d.platform === 'inttra' && d.status === 'created') && !platformEnabled('tmaxx'))
            return json({ record: await view(r) });
        lease = Date.now() + 15 * 60000;
        const claimed = await db().prepare('UPDATE records SET lock_until=? WHERE id=? AND owner=? AND lock_until<=?').bind(lease, id, owner, Date.now()).run();
        if (!claimed.meta.changes)
            throw new AppError('Bu talimat halen işleniyor. Lütfen bekleyin.', 409);
        locked = true;
        const { results: deliveries } = await db().prepare('SELECT * FROM deliveries WHERE record_id=?').bind(id).all<{
            id: string;
            platform: string;
            status: string;
            idempotency_key: string;
        }>();
        if (deliveries.some(d => platformEnabled(d.platform) && ['unknown', 'sending'].includes(d.status)))
            throw new AppError('Önceki aktarımın sonucu doğrulanmalı. Mükerrer kayıt oluşmaması için yeniden gönderim durduruldu.', 409);
        const uncertain = await db().prepare("SELECT step FROM platform_steps WHERE record_id=? AND status IN ('sending','unknown') AND platform NOT IN (SELECT value FROM json_each(?)) LIMIT 1").bind(id, JSON.stringify(pausedPlatforms())).first();
        if (uncertain)
            throw new AppError('Önceki platform adımı doğrulanmalı; tekrar gönderim durduruldu.', 409);
        await db().prepare("UPDATE records SET status='processing' WHERE id=?").bind(id).run();
        let ex: Extraction = r.extraction ? JSON.parse(r.extraction) : await extractDocuments(await sourceFiles(r));
        const sourceExtraction = structuredClone(ex);
        let manual = manualSchema.parse(r.manual ? JSON.parse(r.manual) : emptyManual);
        ex = applyManual(ex, manual);
        if (manual.tmaxxReference && platformEnabled('tmaxx')) {
            const { tmaxxSource } = await import('@/lib/server/tmaxx-source');
            const source=await tmaxxSource(owner, manual.tmaxxReference, ex);
            ex = source.ex;
            manual=(await prepareSource(owner,manual,source)).manual;
        }
        manual=resolveInstruction(manual,ex).manual;
        for (const key of ['bookingNumber', 'vessel', 'voyage'] as const)
            if (!manual[key] && ex.fields[key]?.value && ex.fields[key].confidence >= .95)
                manual[key] = ex.fields[key].value!;
        if(typeof ex.hblRequired==='boolean'&&manual.inttra)manual.inttra.houseBill=ex.hblRequired?'2':'0';
        const configured = contracts().filter(c => platformEnabled(c.id)&&(c.id!=='tmaxx'||ex.hblRequired!==false));
        const requirements = [...minimumFields, ...configured.flatMap(c => c.create?.requiredFields || [])].filter(key=>ex.hblRequired!==false||!['notifyName','notifyAddress'].includes(key));
        const issues = [...validate(ex, requirements), ...manualIssues(manual), ...inttraQualityIssues(ex, manual.inttra?.houseBill || '')];
        if (!issues.length && platformEnabled('inttra')) {
            try {
                await (await import('@/lib/server/inttra-preflight')).validateInttraInput(owner, ex, manual);
            }
            catch (e) {
                if (e instanceof AppError && e.status === 422)
                    issues.push(e.message);
                else
                    throw e;
            }
        }
        await db().prepare('UPDATE records SET fields=?,extraction=?,manual=?,issues=?,status=?,updated_at=? WHERE id=?').bind(JSON.stringify(ex.fields), JSON.stringify(sourceExtraction), JSON.stringify(manual), JSON.stringify(issues), issues.length ? 'missing' : 'ready', new Date().toISOString(), id).run();
        if (issues.length || action !== 'submit')
            return json({ record: await view(await owned(id, owner)) });
        await transfer({ id, owner, revision: r.revision }, ex, manual, deliveries);
        return json({ record: await view(await owned(id, owner)) });
    }
    catch (e) {
        if (locked) {
            const issue = e instanceof AppError ? e.message : 'İşlem tamamlanamadı. Platforma aktarım sonucunu kontrol edin.';
            await db().prepare("UPDATE records SET status=CASE WHEN EXISTS(SELECT 1 FROM deliveries WHERE record_id=? AND status IN ('sending','unknown')) OR EXISTS(SELECT 1 FROM platform_steps WHERE record_id=records.id AND status IN ('sending','unknown')) THEN 'unknown' ELSE ? END,issues=? WHERE id=?").bind(id, e instanceof AppError && e.status === 422 ? 'missing' : 'blocked', JSON.stringify([issue]), id).run();
        }
        return errorResponse(e);
    }
    finally {
        if (locked)
            await db().prepare('UPDATE records SET lock_until=0 WHERE id=? AND owner=? AND lock_until=?').bind(id, owner, lease).run();
    }
}
