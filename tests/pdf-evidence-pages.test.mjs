import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {pdfEvidencePages} from '../lib/server/pdf-evidence-pages.ts';

test('every physical page is retained in order as a separate readable PDF',async()=>{
 const doc=await PDFDocument.create();doc.addPage([300,400]);doc.addPage([500,600]);
 const bytes=await doc.save();const pages=await pdfEvidencePages(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 assert.equal(pages.length,2);
 for(let i=0;i<pages.length;i++){const page=await PDFDocument.load(pages[i]);assert.equal(page.getPageCount(),1);assert.equal(page.getPage(0).getWidth(),i===0?300:500);}
});
test('invalid and oversized PDFs cannot silently skip page audit',async()=>{
 await assert.rejects(pdfEvidencePages(new TextEncoder().encode('not PDF').buffer));
 const doc=await PDFDocument.create();for(let i=0;i<61;i++)doc.addPage();const bytes=await doc.save();await assert.rejects(pdfEvidencePages(bytes.buffer),/60/);
});
