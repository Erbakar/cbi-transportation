/**
 * PDF page images rendered in a headless browser with pdf.js (Cloudflare Browser Rendering in
 * production). Same contract as the poppler renderer on the INTTRA connection server: every
 * physical page as a JPEG whose longer side is 2600 px, annotations included. Only the visible
 * page reaches the extraction model; embedded text, links, scripts and attachments never do.
 */
export type RenderedPage={page:number;mime:'image/jpeg';data:string};
export class PdfRenderError extends Error{constructor(message:string,public status=422){super(message);}}

export const MAX_PDF_BYTES=30*1024*1024,MAX_PAGES=60,LONG_SIDE=2600,MAX_TOTAL=18*1024*1024;

type BrowserPage=Pick<import('@cloudflare/puppeteer').Page,'evaluate'>;
// What the page code below uses from pdf.js (loaded at runtime, so typed here by hand).
type PdfPage={getViewport(o:{scale:number}):{width:number;height:number};render(o:object):{promise:Promise<void>};cleanup():void};
type PdfDocument={numPages:number;getPage(n:number):Promise<PdfPage>};
type PdfLib={GlobalWorkerOptions:{workerSrc:string};AnnotationMode:{ENABLE:number};getDocument(o:object):{promise:Promise<PdfDocument>}};
type PdfWindow=typeof globalThis&{__pdf?:PdfDocument;__annotationMode?:number};

export async function renderPdfPages(page:BrowserPage,bytes:Uint8Array,pdfjs:{lib:string;worker:string},deadline=Date.now()+95000):Promise<{pageCount:number;pages:RenderedPage[]}>{
 if(bytes.length>MAX_PDF_BYTES||!new TextDecoder().decode(bytes.subarray(0,8)).startsWith('%PDF-'))throw new PdfRenderError('Geçerli ve en fazla 30 MB bir PDF gerekli.');
 let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 const opened=await page.evaluate(async(lib:string,worker:string,data:string,maxPages:number)=>{
  const w=window as PdfWindow;
  // No named helpers in page code: the Worker bundler would wrap them in a function the page does not have.
  const pdfjsLib=await import(URL.createObjectURL(new Blob([lib],{type:'text/javascript'}))) as PdfLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc=URL.createObjectURL(new Blob([worker],{type:'text/javascript'}));
  const raw=atob(data),buffer=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)buffer[i]=raw.charCodeAt(i);
  try{
   // No scripting, no external fonts or resources: only what the file itself draws.
   w.__pdf=await pdfjsLib.getDocument({data:buffer,isEvalSupported:false,enableXfa:false,disableFontFace:false,useSystemFonts:true,stopAtErrors:false}).promise;
  }catch(e){return {error:(e as {name?:string})?.name==='PasswordException'?'password':'open'};}
  w.__annotationMode=pdfjsLib.AnnotationMode.ENABLE;
  const count=w.__pdf!.numPages;if(!count||count>maxPages)return {error:'pages',count};
  return {count};
 },pdfjs.lib,pdfjs.worker,btoa(binary),MAX_PAGES) as {count?:number;error?:string};
 if(opened.error==='password'||opened.error==='open')throw new PdfRenderError('PDF açılamadı. Şifreli olmayan PDF kullanın.');
 if(opened.error==='pages'||!opened.count)throw new PdfRenderError('PDF en fazla 60 sayfa olabilir.');
 const pages:RenderedPage[]=[];let size=0;
 for(let n=1;n<=opened.count;n++){
  if(Date.now()>deadline)throw new PdfRenderError('PDF sayfalarının görüntüsü zamanında hazırlanamadı.',504);
  const data=await page.evaluate(async(number:number,longSide:number)=>{
   const w=window as PdfWindow;const p=await w.__pdf!.getPage(number);
   const base=p.getViewport({scale:1});const viewport=p.getViewport({scale:longSide/Math.max(base.width,base.height)});
   const canvas=document.createElement('canvas');canvas.width=Math.round(viewport.width);canvas.height=Math.round(viewport.height);
   const ctx=canvas.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
   await p.render({canvasContext:ctx,viewport,annotationMode:w.__annotationMode,background:'#ffffff'}).promise;
   const url=canvas.toDataURL('image/jpeg',0.92);p.cleanup();canvas.width=canvas.height=0;
   return url.slice(url.indexOf(',')+1);
  },n,LONG_SIDE) as string;
  if(typeof data!=='string'||!data.startsWith('/9j/'))throw new PdfRenderError('PDF sayfa görüntüsü doğrulanamadı.',502);
  size+=data.length*3/4;if(size>MAX_TOTAL)throw new PdfRenderError('PDF görüntüleri çok büyük; talimatı daha küçük belge grupları halinde yükleyin.',413);
  pages.push({page:n,mime:'image/jpeg',data});
 }
 return {pageCount:opened.count,pages};
}
