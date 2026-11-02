import { selectedBookingFields, extractableFields, type BookingExtraction, type ExtractableField } from './booking-extraction';
import { bookingFields, supplementaryBookingFields, type BookingDraft } from './booking';
export const DOCUMENT_POLICY_VERSION = 'booking-evidence-v3';
export type Integrity = 'verified' | 'missing' | 'mismatch' | 'unavailable';
export type PolicyInput = {
    result: BookingExtraction;
    draft: BookingDraft;
    declaredType: string;
    current: boolean;
    integrity: Integrity;
    peers?: {
        documentId: string;
        documentType: string;
        result: BookingExtraction;
    }[];
};
export type FieldDecision = {
    key: ExtractableField;
    state: 'missing' | 'blocked' | 'review';
    reasons: string[];
    conflict: boolean;
    peerConflicts: {
        documentId: string;
        documentType: string;
        value: string;
    }[];
    sourceStatus: 'unverified';
    modelConfidence: number;
    action: 'fill_draft' | 'keep' | 'review' | 'missing' | 'blocked';
};
const normalize = (value: unknown) => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleUpperCase('tr-TR');
export function evaluateDocument(input: PolicyInput) {
    const { result, draft, declaredType, current, integrity } = input;
    const supported = ['quote', 'booking_request', 'booking_confirmation', 'booking_revision'];
    const typeMatch = result.documentType === declaredType;
    const blockers: string[] = [];
    if (integrity !== 'verified')
        blockers.push(integrity === 'mismatch' ? 'Kaynak dosyanın içeriği arşiv kaydıyla eşleşmiyor.' : integrity === 'missing' ? 'Kaynak dosya arşivde bulunamadı.' : 'Kaynak dosyanın bütünlüğü doğrulanamadı.');
    if (!current)
        blockers.push('Belgenin daha yeni bir sürümü var.');
    if (!supported.includes(result.documentType) || !supported.includes(declaredType))
        blockers.push('Belge türü booking alan aktarımına uygun değil.');
    const fields: FieldDecision[] = extractableFields.map(key => {
        const field = result.fields.find(f => f.key === key)!;
        if (field.value === null)
            return { key, state: 'missing', action: draft[key] ? 'keep' : 'missing', reasons: ['Belgede değer bulunamadı.'], conflict: false, peerConflicts: [], sourceStatus: 'unverified', modelConfidence: field.confidence };
        const reasons: string[] = [];
        let valid = true;
        try {
            selectedBookingFields(draft, result, [key]);
        }
        catch {
            valid = false;
            reasons.push('Değer alan biçimine veya izin verilen seçeneklere uymuyor.');
        }
        const conflict = Boolean(draft[key]) && normalize(draft[key]) !== normalize(field.value);
        const peerConflicts = (input.peers || []).flatMap(peer => { const other = peer.result.fields.find(f => f.key === key); return other?.value && normalize(other.value) !== normalize(field.value) ? [{ documentId: peer.documentId, documentType: peer.documentType, value: other.value }] : []; });
        if (peerConflicts.length)
            reasons.push('Diğer güncel belgelerde farklı değer var; kaynak önceliği otomatik seçilmez.');
        if (conflict)
            reasons.push('Mevcut booking değeriyle farklı.');
        reasons.push('Alıntı ve sayfa orijinal dosya üzerinde insan tarafından doğrulanmalı.');
        if (field.confidence < .8)
            reasons.push('Model bu alan için düşük güven bildirdi.');
        if (!typeMatch)
            reasons.push('Beyan edilen tür ile modelin önerdiği tür farklı.');
        // A literal match is only a candidate safeguard, never independent source verification.
        const literalEvidence = normalize(field.source).includes(normalize(field.value));
        const safeCandidate = valid && !blockers.length && typeMatch && !result.issues.length && !conflict && !peerConflicts.length && field.confidence >= .8 && literalEvidence;
        const action: FieldDecision['action'] = !valid || blockers.length ? 'blocked' : conflict || peerConflicts.length ? 'review' : draft[key] ? 'keep' : safeCandidate ? 'fill_draft' : 'review';
        return { key, action, state: !valid || blockers.length ? 'blocked' : 'review', reasons, conflict, peerConflicts, sourceStatus: 'unverified', modelConfidence: field.confidence };
    });
    // Equipment type and count describe one unit of information; never auto-combine incompatible sources.
    const equipment = fields.filter(f => f.key === 'equipmentType' || f.key === 'equipmentCount');
    if (equipment.some(f => f.action === 'review' || f.action === 'blocked' || f.action === 'missing'))
        for (const field of equipment) if (field.action === 'fill_draft') {
            field.action = 'review';
            field.reasons.push('Ekipman tipi ve adedi birlikte çözümlenmeli.');
        }
    for (const [name, address] of [['shipper', 'shipperAddress'], ['consigneeName', 'consigneeAddress'], ['notifyName', 'notifyAddress']] as const) {
        const nameDecision = fields.find(f => f.key === name)!;
        const addressDecision = fields.find(f => f.key === address)!;
        if (addressDecision.action === 'fill_draft' && (!result.fields.find(f => f.key === name)?.value || !['keep', 'fill_draft'].includes(nameDecision.action))) {
            addressDecision.action = 'review';
            addressDecision.reasons.push('Adresin ait olduğu taraf aynı kaynak üzerinde çözümlenmeli.');
        }
    }
    const fillable = fields.filter(f => f.action === 'fill_draft').map(f => f.key);
    const allFields = [...bookingFields, ...supplementaryBookingFields];
    const filled = allFields.filter(([key]) => Boolean(draft[key])).length;
    const workflow = {
        scope: 'Booking devir alanları', total: allFields.length, extractable: extractableFields.length,
        filled, autoFill: fillable.length, afterFill: filled + fillable.length,
        review: fields.filter(f => f.action === 'review' || f.action === 'blocked').map(f => f.key),
        missing: bookingFields.filter(([key]) => !draft[key] && !fillable.includes(key as ExtractableField)).map(([key, label]) => ({ key, label })),
    };
    const present = fields.filter(f => f.state !== 'missing');
    const valid = present.filter(f => { try {
        selectedBookingFields(draft, result, [f.key]);
        return true;
    }
    catch {
        return false;
    } }).length;
    // Operational control index, not accuracy probability or authenticity certification.
    // Missing extraction fields affect coverage separately, not document truthfulness.
    const checks = [
        { key: 'integrity', label: 'Dosya bütünlüğü', earned: integrity === 'verified' ? 25 : 0, max: 25 },
        { key: 'version', label: 'Güncel sürüm', earned: current ? 15 : 0, max: 15 },
        { key: 'type', label: 'Belge türü tutarlılığı', earned: typeMatch && supported.includes(result.documentType) ? 15 : 0, max: 15 },
        { key: 'format', label: 'Dolu alanların biçimi', earned: present.length ? Math.round(15 * valid / present.length) : 0, max: 15 },
        { key: 'evidence', label: 'Bağımsız kaynak doğrulaması', earned: 0, max: 20 },
        { key: 'consistency', label: 'Kayıtla tutarlılık', earned: present.length && !fields.some(f => f.conflict || f.peerConflicts.length) && !result.issues.length ? 10 : 0, max: 10 },
    ];
    const rawScore = checks.reduce((n, c) => n + c.earned, 0);
    return { workflow, policyVersion: DOCUMENT_POLICY_VERSION, controlScore: blockers.length ? 0 : Math.min(60, Math.round(rawScore * 0.75)), scoreMeaning: 'Operasyonel kontrol puanı; doğruluk olasılığı değildir.', coverage: { present: present.length, total: extractableFields.length }, authenticity: 'unverified' as const, sourceEvidence: 'unverified' as const, typeMatch, blockers, fields, checks, capReason: 'Kaynak alıntıları bağımsız doğrulanmadığından puan en fazla 60 olabilir.', issues: result.issues };
}
export type DocumentAssessment = ReturnType<typeof evaluateDocument>;
export function authorizeSelection(assessment: DocumentAssessment, keys: ExtractableField[], verified: ExtractableField[], reason: string) {
    if (assessment.blockers.length)
        throw new Error(assessment.blockers.join(' '));
    if (!keys.length || new Set(keys).size !== keys.length)
        throw new Error('Benzersiz alanlar seçin.');
    if (new Set(verified).size !== verified.length || verified.some(k => !keys.includes(k)))
        throw new Error('Kaynak teyidi seçilen alanlarla eşleşmeli.');
    for (const key of keys) {
        const field = assessment.fields.find(f => f.key === key);
        if (!field || field.state !== 'review')
            throw new Error('Eksik veya engellenmiş alan aktarılamaz.');
        if (!verified.includes(key))
            throw new Error('Seçilen her alanın alıntısını ve sayfasını orijinal belgede teyit edin.');
    }
    const needsReason = !assessment.typeMatch || assessment.issues.length > 0 || assessment.fields.some(f => keys.includes(f.key) && (f.conflict || f.peerConflicts.length > 0 || f.modelConfidence < .8));
    if (needsReason && reason.trim().length < 15)
        throw new Error('Fark, uyarı veya düşük güven için en az 15 karakterlik kontrol gerekçesi gerekli.');
    return { policyVersion: assessment.policyVersion, sourceVerifiedFields: verified, reason: reason.trim(), verificationMethod: 'human_source_review' as const };
}

/** Automatically populated values remain unverified draft data. No human attestation is fabricated. */
export function authorizeDraftFill(assessment: DocumentAssessment, keys: ExtractableField[]) {
    if (assessment.blockers.length || !keys.length || new Set(keys).size !== keys.length ||
        keys.some(key => assessment.fields.find(f => f.key === key)?.action !== 'fill_draft'))
        throw new Error('Otomatik taslak aktarımı yalnızca boş, çelişkisiz ve kaynaklı alanlar için yapılabilir.');
    for (const [key, dependency] of [['equipmentCount', 'equipmentType'], ['equipmentType', 'equipmentCount'], ['shipperAddress', 'shipper'], ['consigneeAddress', 'consigneeName'], ['notifyAddress', 'notifyName']] as const)
        if (keys.includes(key) && assessment.fields.find(f => f.key === dependency)?.action === 'fill_draft' && !keys.includes(dependency))
            throw new Error('İlişkili alanlar aynı işlemde doldurulmalı.');
    return { policyVersion: assessment.policyVersion, sourceVerifiedFields: [], reason: '', verificationMethod: 'automatic_draft' as const, sourceStatus: 'unverified' as const };
}
