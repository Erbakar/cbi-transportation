import { PDFDocument } from 'pdf-lib';

/** Isolate physical pages so a dense page cannot disappear in a packet summary. */
export async function pdfEvidencePages(bytes: ArrayBuffer): Promise<string[]> {
    const source = await PDFDocument.load(bytes, { updateMetadata: false });
    if (source.getPageCount() > 60) throw new Error('Sayfa kontrolü belge başına en fazla 60 PDF sayfası destekler.');
    const result: string[] = [];
    for (let index = 0; index < source.getPageCount(); index++) {
        const page = await PDFDocument.create();
        const [copied] = await page.copyPages(source, [index]);
        page.addPage(copied);
        result.push(await page.saveAsBase64());
    }
    return result;
}
