import {AppError,runtime} from './runtime';
export type VisualPage={page:number;mime:'image/jpeg';data:string};
type Result={pageCount:number;pages:VisualPage[]};

function checked(result:Result){
 if(!Number.isInteger(result.pageCount)||result.pageCount<1||result.pageCount>60||!Array.isArray(result.pages)||result.pages.length!==result.pageCount||result.pages.some((p,i)=>p.page!==i+1||p.mime!=='image/jpeg'||typeof p.data!=='string'||!p.data.startsWith('/9j/')||p.data.length>6*1024*1024))throw new AppError('PDF sayfa görüntüleri eksik veya geçersiz; belge okuma durduruldu.',502);
 return result.pages;
}
const rejected=(status:number)=>status===413||status===422;
const failure=(status:number)=>new AppError('PDF sayfa görüntüleri hazırlanamadı (HTTP '+status+'). Belge korunuyor; yeniden deneyin.',rejected(status)?422:502);

/** poppler on the INTTRA connection server, while one is configured. */
async function fromRelay(bytes:ArrayBuffer){
 const env=runtime();if(!env.INTTRA_RELAY_URL||!env.INTTRA_RELAY_KEY)return null;
 const relay=new URL(env.INTTRA_RELAY_URL);if(relay.protocol!=='https:'||relay.username||relay.password)return null;
 const r=await fetch(new URL('/pdf-pages',relay),{method:'POST',headers:{Authorization:'Bearer '+env.INTTRA_RELAY_KEY,'Content-Type':'application/pdf'},body:bytes,redirect:'manual',signal:AbortSignal.timeout(85000)});
 if(!r.ok)throw failure(r.status);
 return checked(await r.json() as Result);
}
/** pdf.js in Cloudflare Browser Rendering: independent of any computer. */
async function fromBrowser(bytes:ArrayBuffer){
 const service=runtime().CARRIER_BROWSER;if(!service)throw new AppError('PDF görüntüleme bağlantısı kullanılamıyor. Belgeniz korunuyor; bağlantı tamamlanınca yeniden kontrol edin.',503);
 const r=await service.fetch('https://carrier-browser/pdf-pages',{method:'POST',headers:{'Content-Type':'application/pdf'},body:bytes,signal:AbortSignal.timeout(120000)});
 if(!r.ok)throw failure(r.status);
 return checked(await r.json() as Result);
}

/**
 * Every physical PDF page as an image. The connection server renders while it is reachable;
 * when it is not (computer off, tunnel gone), the Cloudflare browser renders the same pages.
 * A PDF that is itself unreadable (password, too large) is not tried twice.
 */
export async function pdfVisualPages(bytes:ArrayBuffer):Promise<VisualPage[]>{
 try{const pages=await fromRelay(bytes);if(pages)return pages;}
 catch(error){if(error instanceof AppError&&error.status===422)throw error;console.warn(JSON.stringify({event:'pdf-pages-relay-unavailable',error:error instanceof Error?error.message.slice(0,160):'unknown'}));}
 return fromBrowser(bytes);
}
