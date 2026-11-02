import {requireControlApproval} from './control-gate';
import type { Extraction } from '../domain';
import type { Manual } from '../manual';
import {AppError,db,digest} from './runtime';
import {prepareTmaxxBatch as prepareTmaxx,executeTmaxxBatch as executeTmaxx} from './tmaxx-batch';
import {prepareInttra,executeInttra} from './inttra-workflow';
import type { Run } from './platform-journal';
import {platformEnabled} from './platform-policy';
import {resumeTmaxxPlan} from './tmaxx-checkpoint';
export async function transfer(run: Run, ex: Extraction, manual: Manual, deliveries: {
    id: string;
    platform: string;
    status: string;
    payload?: string | null;
}[],reviewApproval?:import('./inttra-workflow').ReviewApproval) {
    if(ex.hblRequired===false){
        const hbl=deliveries.find(d=>d.platform==='tmaxx');
        if(hbl&&['created','unknown','sending'].includes(hbl.status))throw new AppError('Mevcut HBL işlemi var; acentesiz MBL işlemine dönüştürülemez.',409);
        if(hbl)await db().prepare("UPDATE deliveries SET status='skipped',message=?,updated_at=? WHERE id=?").bind('T-MAXX pozisyonunda acente yok; bu yük için HBL hazırlanmaz.',new Date().toISOString(),hbl.id).run();
    }else{
        for(const d of deliveries.filter(d=>d.platform==='tmaxx'&&d.status==='skipped')){await db().prepare("UPDATE deliveries SET status='waiting',message=NULL WHERE id=?").bind(d.id).run();d.status='waiting';}
    }
    const pending = deliveries.filter(d => d.status !== 'created' && platformEnabled(d.platform)&&(d.platform!=='tmaxx'||ex.hblRequired!==false));
    if (!pending.length)
        return;
    if(pending.some(d=>['unknown','sending'].includes(d.status)))throw new AppError('Önce platformdaki mevcut kayıt doğrulanmalı. Sonucu belirsiz aktarım yeniden gönderilemez.',409);
    if (pending.some(d => !['tmaxx', 'inttra'].includes(d.platform)))
        throw new AppError('Bu platform için aktarım eşlemesi tanımlı değil.', 422);
    const keys = new Map<string, string>();
    for (const d of pending) {
        const key = await digest(JSON.stringify([ex.fields.bookingNumber.value, ex.containers.map(c => c.containerNumber.value).sort(), d.platform]));
        const existing = await db().prepare('SELECT record_id FROM deliveries WHERE owner=? AND platform=? AND business_key=? AND record_id<>?').bind(run.owner, d.platform, key, run.id).first();
        if (existing)
            throw new AppError('Aynı booking ve konteynerler başka bir kayıt üzerinden aktarılmış veya işleniyor.', 409);
        keys.set(d.platform, key);
    }
    // All local mapping checks and target matching finish before either final write begins.
    const tmaxxDelivery=pending.find(d=>d.platform==='tmaxx');
    const savedPlan=tmaxxDelivery?.payload&&tmaxxDelivery.status==='failed'&&deliveries.some(d=>d.platform==='inttra'&&d.status==='created')?await resumeTmaxxPlan(run,tmaxxDelivery.payload):null;
    const tmaxx = tmaxxDelivery ? savedPlan??await prepareTmaxx(run.owner, ex, manual) : null;
    const inttra = pending.some(d => d.platform === 'inttra') ? await prepareInttra(run, ex, manual,reviewApproval) : null;
    if (inttra?.warnings.length && !inttra.approved) {
        await db().prepare("UPDATE records SET status='review',issues=? WHERE id=?").bind(JSON.stringify(inttra.warnings.map(w => 'INTTRA ' + w.code + ': ' + w.message)), run.id).run();
        return;
    }
    const controlPlans:Record<string,unknown>={tmaxx,inttra:inttra?.payload};
    let controlError:unknown;
    for(const d of pending)try{await requireControlApproval(run,d.platform+'-submit',controlPlans[d.platform]);}catch(e){controlError=e;}
    if(controlError)throw controlError;
    for (const d of pending) {
        const guardedRun={...run,control:{kind:d.platform+'-submit',payload:controlPlans[d.platform]}};
        const claimed = await db().prepare("UPDATE deliveries SET status='sending',payload=?,owner=?,business_key=?,updated_at=? WHERE id=? AND status IN ('waiting','failed','blocked')").bind(JSON.stringify(d.platform === 'tmaxx' ? tmaxx : inttra), run.owner, keys.get(d.platform), new Date().toISOString(), d.id).run();
        if (!claimed.meta.changes)
            throw new AppError('Aktarım zaten başlatılmış. Sonucu kontrol edin.', 409);
        try {
            const reference = d.platform === 'tmaxx' ? await executeTmaxx(guardedRun, tmaxx!) : await executeInttra(guardedRun, inttra!);
            await db().prepare("UPDATE deliveries SET status='created',reference=?,message=?,updated_at=? WHERE id=?").bind(reference, d.platform === 'inttra' ? 'Talimat INTTRA’ya gönderildi. Taşıyıcı onayı ayrıca takip edilir.' : 'HBL bilgileri T-MAXX’e kaydedildi.', new Date().toISOString(), d.id).run();
        }
        catch (e) {
            const blocked=e instanceof AppError&&'controlBlocked' in e;
            await db().prepare(blocked?"UPDATE deliveries SET status='blocked',message=?,updated_at=? WHERE id=?":"UPDATE deliveries SET status='unknown',message=?,updated_at=? WHERE id=?").bind(e instanceof AppError ? e.message : 'Platform sonucu doğrulanamadı. Tekrar gönderim durduruldu.', new Date().toISOString(), d.id).run();
            throw e;
        }
    }
    const finished = deliveries.every(d => platformEnabled(d.platform)||(d.platform==='tmaxx'&&ex.hblRequired===false));
    await db().prepare(finished ? "UPDATE records SET status='complete',issues=NULL WHERE id=?" : "UPDATE records SET status='partial',issues=NULL WHERE id=?").bind(run.id).run();
}
