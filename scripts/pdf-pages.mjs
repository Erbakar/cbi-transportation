import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {PDFDocument} from 'pdf-lib';
const run=promisify(execFile);
export class PdfPagesError extends Error{constructor(message,status=422){super(message);this.status=status;}}
export async function pdfRenderer(){
 const candidates=[process.env.PDFTOPPM_BIN,'/opt/homebrew/bin/pdftoppm','/usr/bin/pdftoppm',path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/bin/pdftoppm')].filter(Boolean);
 for(const candidate of candidates)try{await fs.access(candidate,fs.constants.X_OK);return candidate;}catch{/* Try the next installed renderer. */}
 throw new PdfPagesError('PDF görüntüleyici kullanılamıyor; belge okunmadı.',503);
}
// Render the visible page, including clipping, overlays and annotations. Never
// expose embedded PDF text, links, scripts or attachments to the extraction model.
export async function renderPdfPages(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length>30*1024*1024||!bytes.subarray(0,8).toString().startsWith('%PDF-'))throw new PdfPagesError('Geçerli ve en fazla 30 MB bir PDF gerekli.');
 let document;try{document=await PDFDocument.load(bytes,{updateMetadata:false});}catch{throw new PdfPagesError('PDF açılamadı. Şifreli olmayan PDF kullanın.');}
 const count=document.getPageCount();if(!count||count>60)throw new PdfPagesError('PDF en fazla 60 sayfa olabilir.');
 const executable=await pdfRenderer(),dir=await fs.mkdtemp(path.join(os.tmpdir(),'cbi-pdf-'));
 try{
  const source=path.join(dir,'source.pdf');await fs.writeFile(source,bytes,{mode:0o600});
  const pages=[];let size=0;const deadline=Date.now()+70000;
  for(let page=1;page<=count;page++){
   const prefix=path.join(dir,'page');
   try{await run(executable,['-f',String(page),'-l',String(page),'-scale-to','2600','-jpeg','-jpegopt','quality=92','-singlefile',source,prefix],{timeout:Math.max(1,Math.min(25000,deadline-Date.now())),maxBuffer:1024*1024,killSignal:'SIGKILL'});}catch{throw new PdfPagesError('PDF sayfalarının görüntülenmesi tamamlanamadı; hiçbir sayfa atlanmadı.',502);}
   const image=await fs.readFile(prefix+'.jpg');size+=image.length;
   if(size>18*1024*1024)throw new PdfPagesError('PDF görüntüleri çok büyük; talimatı daha küçük belge grupları halinde yükleyin.',413);
   if(image[0]!==255||image[1]!==216)throw new PdfPagesError('PDF sayfa görüntüsü doğrulanamadı.',502);
   pages.push({page,mime:'image/jpeg',data:image.toString('base64')});
  }
  return {pageCount:count,pages};
 }finally{await fs.rm(dir,{recursive:true,force:true});}
}
