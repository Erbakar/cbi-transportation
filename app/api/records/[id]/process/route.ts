import { transfer } from '@/lib/server/transfer';
import { reconcileDocumentTotals } from '@/lib/document-evidence';
import { resolveInstruction, resetSourceValues } from '@/lib/instruction-rules';
import {houseBillIssues,extractionForBill} from '@/lib/house-bills';
import { prepareSource } from '@/lib/server/instruction-preparation';
import { platformEnabled, pausedPlatforms } from '@/lib/server/platform-policy';
import { inttraQualityIssues } from '@/lib/inttra-quality';
import { applyManual } from '@/lib/manual-extraction';
import { emptyManual, manualIssues, manualSchema } from '@/lib/manual';
import { requireUser } from '@/lib/server/auth';
import { AppError, db, digest, errorResponse, json, sameOrigin } from '@/lib/server/runtime';
import { sourceFiles, documentsFor, owned, view } from '@/lib/server/records';
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
        const body = raw ? JSON.parse(raw) : {action:'check'};
        const action = body.action;
        if (!['check', 'submit'].includes(action))
            throw new AppError('Geçersiz işlem.');
        const reviewApproval=body.reviewApproval as import('@/lib/server/inttra-workflow').ReviewApproval|undefined;
        if(reviewApproval!==undefined&&(action!=='submit'||!reviewApproval||typeof reviewApproval.inputHash!=='string'||!/^[a-f0-9]{64}$/.test(reviewApproval.inputHash)||typeof reviewApproval.createdAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(reviewApproval.createdAt)||!Number.isFinite(Date.parse(reviewApproval.createdAt))))
            throw new AppError('Uyarı onay bilgisi geçersiz. Güncel uyarıyı tekrar açın.');
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
            payload?: string | null;
        }>();
        if (deliveries.some(d => platformEnabled(d.platform) && ['unknown', 'sending'].includes(d.status)))
            throw new AppError('Önceki aktarımın sonucu doğrulanmalı. Mükerrer kayıt oluşmaması için yeniden gönderim durduruldu.', 409);
        const uncertain = await db().prepare("SELECT step FROM platform_steps WHERE record_id=? AND status IN ('sending','unknown') AND platform NOT IN (SELECT value FROM json_each(?)) LIMIT 1").bind(id, JSON.stringify(pausedPlatforms())).first();
        if (uncertain)
            throw new AppError('Önceki platform adımı doğrulanmalı; tekrar gönderim durduruldu.', 409);
        // INTTRA is already submitted and the instruction is immutable. Resume the
        // verified T-MAXX plan instead of rebuilding it from partially updated ERP data.
        if(deliveries.some(d=>d.platform==='inttra'&&d.status==='created')&&deliveries.some(d=>d.platform==='tmaxx'&&d.status==='failed'&&d.payload)){
            if(action==='submit'){
                const manual=manualSchema.parse(r.manual?JSON.parse(r.manual):emptyManual);
                if(!r.extraction)throw new AppError('Kayıtlı talimat bilgisi bulunamadı.',409);
                await transfer({id,owner,revision:r.revision},applyManual(JSON.parse(r.extraction),manual),manual,deliveries);
            }
            return json({record:await view(await owned(id,owner))});
        }
        await db().prepare("UPDATE records SET status='processing' WHERE id=?").bind(id).run();
        let ex: Extraction = r.extraction ? JSON.parse(r.extraction) : await extractDocuments(await sourceFiles(r));
        if (ex.schemaVersion === 2 || ex.schemaVersion === 3 || ex.schemaVersion === 4 || ex.schemaVersion === 5 || ex.schemaVersion === 6 || (ex.schemaVersion === 7 && (ex.containers?.length || 0) > 1)) ex = await extractDocuments(await sourceFiles(r));
        if (ex.schemaVersion === 8) {
            ex = reconcileDocumentTotals(ex, await documentsFor(r));
            ex.schemaVersion = 9;
        }
        const sourceExtraction = structuredClone(ex);
        let manual = manualSchema.parse(r.manual ? JSON.parse(r.manual) : emptyManual);
        // Preserve successful reading before any external lookup can fail.
        await db().prepare('UPDATE records SET extraction=?,fields=? WHERE id=?').bind(JSON.stringify(sourceExtraction),JSON.stringify(ex.fields),id).run();
        if (/^(?:YK\.)?(?:S|T)\.I\./i.test(manual.tmaxxReference || '') || ['other','draft'].includes(ex.documentType)) {
            const issues=[...ex.issues,'Bu dosya yeni denizyolu ihracat konşimento talimatı olarak işlenemez. İthalat/operasyon belgeleri dosya kontrolü akışında incelenmeli.'];
            await db().prepare("UPDATE records SET issues=?,status='blocked',updated_at=? WHERE id=?").bind(JSON.stringify(issues),new Date().toISOString(),id).run();
            return json({record:await view(await owned(id,owner))});
        }
        if(manual.tmaxxReference&&platformEnabled('tmaxx'))manual=resetSourceValues(manual);
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
        ex=applyManual(ex,manual);
        const configured = contracts().filter(c => platformEnabled(c.id)&&(c.id!=='tmaxx'||ex.hblRequired!==false));
        const requirements = [...minimumFields, ...configured.flatMap(c => c.create?.requiredFields || [])].filter(key=>(manual.inttra?.houseBill==='2'||!['shipperName','shipperAddress','consigneeName','consigneeAddress','notifyName','notifyAddress'].includes(key))&&(key!=='blType'||!(ex.hblRequired===true||manual.inttra?.mblDocumentType||(ex.hblRequired===undefined&&['2','multiple'].includes(manual.inttra?.houseBill||'')))));
        const issues = [...validate(ex, requirements), ...manualIssues(manual), ...houseBillIssues(manual,ex), ...inttraQualityIssues(ex, manual.inttra?.houseBill || ''),...(manual.inttra?.houseBill==='multiple'?(manual.houseBills||[]).flatMap((b,i)=>inttraQualityIssues(extractionForBill(ex,b,manual),'2').map(s=>`HBL ${i+1}: ${s}`)):[])];
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
        await transfer({ id, owner, revision: r.revision }, ex, manual, deliveries,reviewApproval);
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
