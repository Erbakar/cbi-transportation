import {documentMime, MAX_DOCUMENT_BYTES} from './documents';

export async function validateArchiveFile(file: File) {
    if (!file.size) throw new Error('Boş dosya yüklenemez.');
    if (file.size > MAX_DOCUMENT_BYTES) throw new Error('Dosya en fazla 10 MB olabilir.');
    // Match the server's content check without reading the entire file in the browser.
    documentMime(new Uint8Array(await file.slice(0, 8).arrayBuffer()), file.name);
}

type TransferResult = {status?: string; message?: string; remoteId?: number};
export function archiveTransferMessage(result: TransferResult & {archive?: TransferResult}) {
    const transfer = result.archive ?? result;
    if (transfer.status === 'synced' && transfer.remoteId) return 'T-MAXX arşiv kaydı doğrulandı.';
    if (transfer.status === 'pending') return 'Belge yerel arşivde korundu. ' + (transfer.message || 'T-MAXX aktarımı henüz doğrulanmadı.');
    return 'Aktarım sonucu doğrulanamadı. Belge listesini yenileyip mevcut kaydı kontrol edin.';
}
