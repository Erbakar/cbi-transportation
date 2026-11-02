import test from 'node:test';import assert from 'node:assert/strict';import {PDFDocument,rgb,StandardFonts} from 'pdf-lib';
import {renderPdfPages} from '../scripts/pdf-pages.mjs';
async function fixture(hidden=false){const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);const page=pdf.addPage([300,400]);page.drawText('VISIBLE 391620',{font,size:14,x:20,y:350});if(hidden){page.drawText('HIDDEN 401693002200',{font,size:14,x:20,y:300,color:rgb(1,1,1)});page.drawText('COVERED OLD PRODUCT',{font,size:14,x:20,y:250});page.drawRectangle({x:0,y:220,width:300,height:60,color:rgb(1,1,1)});page.drawText('INVISIBLE OLD HS',{font,size:14,x:20,y:150,opacity:0});}return Buffer.from(await pdf.save());}
test('visual PDF input excludes white, transparent and covered stale text at the pixel level',async()=>{
 const visible=await renderPdfPages(await fixture()),hidden=await renderPdfPages(await fixture(true));assert.deepEqual(hidden,visible);assert.equal(hidden.pages[0].mime,'image/jpeg');assert.equal(hidden.pageCount,1);
});
test('PDF rendering retains every physical page in order and rejects invalid or oversized packets',async()=>{
 const pdf=await PDFDocument.create();pdf.addPage([300,400]);pdf.addPage([400,300]);const rendered=await renderPdfPages(Buffer.from(await pdf.save()));assert.deepEqual(rendered.pages.map(p=>p.page),[1,2]);assert.notEqual(rendered.pages[0].data,rendered.pages[1].data);
 await assert.rejects(renderPdfPages(Buffer.from('not PDF')));const tooMany=await PDFDocument.create();for(let i=0;i<61;i++)tooMany.addPage();await assert.rejects(renderPdfPages(Buffer.from(await tooMany.save())),/60/);
});
