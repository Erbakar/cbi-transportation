import { z } from 'zod';
export const eventLabels = {
    equipmentAvailable: 'Ekipman uygunluğu', emptyPickup: 'Boş konteyner alımı', loading: 'Yükleme', terminalDelivery: 'Dolu konteyner terminal teslimi',
    siCutoff: 'SI son teslim', vgmCutoff: 'VGM son teslim', customsCutoff: 'Gümrük son teslim', portCutoff: 'Liman son teslim',
    etd: 'Tahmini kalkış · ETD', atd: 'Gerçekleşen kalkış · ATD', eta: 'Tahmini varış · ETA', ata: 'Gerçekleşen varış · ATA',
    transshipmentArrival: 'Aktarma varışı', transshipmentDeparture: 'Aktarma kalkışı', freeTimeStart: 'Free time başlangıcı', freeTimeEnd: 'Free time bitişi', other: 'Diğer görev',
} as const;
export type EventKind = keyof typeof eventLabels;
export const eventKinds = Object.keys(eventLabels) as [
    EventKind,
    ...EventKind[]
];
export const taskStates = { pending: 'Bekliyor', in_progress: 'Devam ediyor', done: 'Tamamlandı', cancelled: 'İptal' } as const;
export function validZone(zone: string) { try {
    new Intl.DateTimeFormat('en', { timeZone: zone }).format();
    return !!zone;
}
catch {
    return false;
} }
export function validDate(value: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false; const d = new Date(value + 'T00:00:00Z'); return Number.isFinite(+d) && d.toISOString().slice(0, 10) === value && value >= '2000-01-01' && value <= '2100-12-31'; }
const date = z.string().refine(v => !v || validDate(v), 'Geçerli bir tarih girin.');
const time = z.string().regex(/^(?:|(?:[01]\d|2[0-3]):[0-5]\d)$/, 'Saat 00:00–23:59 arasında olmalı.');
export const taskInputSchema = z.object({ id: z.string().uuid().optional(), kind: z.enum(eventKinds), label: z.string().trim().min(1).max(150), location: z.string().trim().max(150), date, time, zone: z.string().max(100).refine(validZone, 'Geçerli bir saat dilimi seçin.'), assignee: z.string().trim().max(120), status: z.enum(['pending', 'in_progress', 'done', 'cancelled']), remindHours: z.number().int().min(1).max(720), urgentHours: z.number().int().min(1).max(720).default(4), requiredDocument: z.enum(['', 'instruction', 'vgm', 'booking_confirmation', 'other']), note: z.string().trim().max(2000) }).strict().superRefine((v, c) => { if (v.urgentHours > v.remindHours) c.addIssue({ code: 'custom', message: 'Kritik uyarı süresi ilk uyarı süresinden büyük olamaz.' }); if (v.time && !v.date)
    c.addIssue({ code: 'custom', message: 'Saat için tarih gerekli.' }); if (v.status === 'done' && (!v.date || !v.assignee))
    c.addIssue({ code: 'custom', message: 'Tamamlanan görevde tarih ve sorumlu gerekli.' }); if (v.date && v.time) {
    try {
        zonedInstant(v.date, v.time, v.zone);
    }
    catch (e) {
        c.addIssue({ code: 'custom', message: (e as Error).message });
    }
} });
export type TaskInput = z.infer<typeof taskInputSchema>;
export type SourceProof = {
    documentId: string;
    extractionId: string;
    seriesId: string;
    key: string;
    filename: string;
    value: string;
    quote: string;
    page: number;
    confidence: number;
};
export type ScheduleTask = TaskInput & {
    id: string;
    source: SourceProof | null;
    updatedAt: string;
    completedAt: string | null;
};
export const scheduleActionSchema = z.discriminatedUnion('action', [
    z.object({ action: z.literal('task'), revision: z.number().int().nonnegative(), evidenceRevision: z.number().int().nonnegative(), reason: z.string().trim().min(5).max(1000), task: taskInputSchema }).strict(),
    z.object({ action: z.literal('import'), revision: z.number().int().nonnegative(), evidenceRevision: z.number().int().nonnegative(), documentId: z.string().uuid(), extractionId: z.string().uuid(), key: z.enum(eventKinds), date: date.refine(Boolean, 'Tarih gerekli.'), time, zone: z.string().max(100).refine(validZone, 'Saat dilimi gerekli.'), assignee: z.string().trim().max(120), remindHours: z.number().int().min(1).max(720), urgentHours: z.number().int().min(1).max(720).default(4), verified: z.literal(true), reason: z.string().trim().min(5).max(1000) }).strict(),
]);
function wallParts(ms: number, zone: string) { return Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(ms).filter(p => p.type !== 'literal').map(p => [p.type, p.value])); }
/** Reject DST gaps and repeated wall times; never silently shift an operational deadline. */
export function zonedInstant(day: string, clock: string, zone: string): number {
    if (!validDate(day) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(clock) || !validZone(zone))
        throw new Error('Tarih, saat veya saat dilimi geçersiz.');
    const target = Date.parse(day + 'T' + clock + ':00Z'), offsets = new Set<number>();
    for (const delta of [-36, -12, 0, 12, 36]) {
        const probe = target + delta * 3600000, p = wallParts(probe, zone);
        offsets.add(Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`) - probe);
    }
    const matches = [...offsets].map(o => target - o).filter(t => { const p = wallParts(t, zone); return `${p.year}-${p.month}-${p.day}` === day && `${p.hour}:${p.minute}` === clock; });
    if (matches.length !== 1)
        throw new Error('Bu yerel saat yaz/kış saati geçişinde belirsiz veya mevcut değil. Sabit UTC saat dilimiyle doğrulayın.');
    return matches[0];
}
/** Conservative hints only. Missing year, numeric slash ambiguity and zone are never invented. */
export function dateHint(value: string): {
    date: string;
    time: string;
    zone: string;
    warning: string;
} {
    let day = '';
    const iso = value.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/), dot = value.match(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/), named = value.match(/\b(\d{1,2})[ -]([A-Za-z]{3})[ -](20\d{2})\b/);
    if (iso)
        day = `${iso[1]}-${iso[2]}-${iso[3]}`;
    else if (dot)
        day = `${dot[3]}-${dot[2].padStart(2, '0')}-${dot[1].padStart(2, '0')}`;
    else if (named) {
        const m = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].indexOf(named[2].toUpperCase()) + 1;
        if (m)
            day = `${named[3]}-${String(m).padStart(2, '0')}-${named[1].padStart(2, '0')}`;
    }
    if (!validDate(day))
        day = '';
    const clock = value.match(/(?:T|\s)([01]\d|2[0-3]):([0-5]\d)(?::00)?/);
    const zone = /\b(?:UTC|GMT)(?!\s*[+-])\b|\d{2}:\d{2}(?::00)?Z\b/.test(value) ? 'UTC' : '';
    return { date: day, time: clock ? `${clock[1]}:${clock[2]}` : '', zone, warning: !day ? 'Tarih biçimini ve yılı kaynaktan doğrulayın.' : !zone ? 'Saat dilimini kaynaktan doğrulayın.' : !clock ? 'Belgede saat yok; gün düzeyinde izlenir.' : '' };
}
export type ScheduleAlert = {
    code: string;
    severity: 'danger' | 'warning' | 'info';
    text: string;
};
export function taskAlerts(task: ScheduleTask, now: number, currentDocs: {
    id: string;
    type: string;
    extractionId: string | null;
}[]): ScheduleAlert[] {
    if (['done', 'cancelled'].includes(task.status))
        return [];
    const alerts: ScheduleAlert[] = [];
    if (!task.assignee)
        alerts.push({ code: 'unassigned', severity: 'warning', text: 'Sorumlu atanmadı' });
    if (!task.date)
        alerts.push({ code: 'undated', severity: 'warning', text: 'Tarih bekleniyor' });
    else if (task.time) {
        const due = zonedInstant(task.date, task.time, task.zone);
        if (due < now)
            alerts.push({ code: 'overdue', severity: 'danger', text: 'Süresi geçti' });
        else if (due - now <= (task.urgentHours ?? 4) * 3600000)
            alerts.push({ code: 'upcoming', severity: 'danger', text: 'Kritik · son ' + (task.urgentHours ?? 4) + ' saat' });
        else if (due - now <= task.remindHours * 3600000)
            alerts.push({ code: 'upcoming', severity: 'warning', text: 'Son tarih yaklaşıyor' });
    }
    else {
        const p = wallParts(now, task.zone), today = `${p.year}-${p.month}-${p.day}`;
        if (task.date < today)
            alerts.push({ code: 'overdue', severity: 'danger', text: 'Günü geçti · saat belirtilmedi' });
        else if (Date.parse(task.date) - Date.parse(today) <= Math.ceil(task.remindHours / 24) * 86400000)
            alerts.push({ code: 'upcoming', severity: 'warning', text: 'Günü yaklaşıyor · saat belirtilmedi' });
    }
    if (task.requiredDocument && !currentDocs.some(d => d.type === task.requiredDocument || (task.requiredDocument === 'booking_confirmation' && d.type === 'booking_revision')))
        alerts.push({ code: 'missing_document', severity: 'warning', text: 'Beklenen belge gelmedi' });
    if (task.source && !currentDocs.some(d => d.id === task.source!.documentId && d.extractionId === task.source!.extractionId))
        alerts.push({ code: 'source_changed', severity: 'warning', text: 'Kaynak değişti · güncel tarihi kontrol edin' });
    return alerts;
}
export function chronologyWarnings(tasks: ScheduleTask[]): string[] {
    const active = tasks.filter(t => t.status !== 'cancelled' && t.date), warnings: string[] = [];
    for (const [a, b, label] of [['etd', 'eta', 'Tahmini varış kalkıştan önce'], ['atd', 'ata', 'Gerçek varış kalkıştan önce'], ['freeTimeStart', 'freeTimeEnd', 'Free time bitişi başlangıçtan önce']] as const) {
        const x = active.filter(t => t.kind === a), y = active.filter(t => t.kind === b);
        if (x.length === 1 && y.length === 1) {
            const first = x[0], last = y[0];
            const inverted = first.time && last.time ? zonedInstant(last.date, last.time, last.zone) < zonedInstant(first.date, first.time, first.zone) : first.zone === last.zone && last.date < first.date;
            if (inverted)
                warnings.push(label);
        }
    }
    return warnings;
}
