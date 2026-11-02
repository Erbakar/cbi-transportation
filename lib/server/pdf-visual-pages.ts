import {AppError,runtime} from './runtime';
export type VisualPage={page:number;mime:'image/jpeg';data:string};
export async function pdfVisualPages(bytes:ArrayBuffer):Promise<VisualPage[]>{
 const env=runtime();if(!env.INTTRA_RELAY_URL||!env.INTTRA_RELAY_KEY)throw new AppError('PDF görüntüleme bağlantısı kullanılamıyor. Belgeniz korunuyor; bağlantı tamamlanınca yeniden kontrol edin.',503);
 const relay=new URL(env.INTTRA_RELAY_URL);if(relay.protocol!=='https:'||relay.username||relay.password)throw new AppError('PDF görüntüleme bağlantısı geçersiz.',503);
 const r=await fetch(new URL('/pdf-pages',relay),{method:'POST',headers:{Authorization:'Bearer '+env.INTTRA_RELAY_KEY,'Content-Type':'application/pdf'},body:bytes,redirect:'manual',signal:AbortSignal.timeout(85000)});
 if(!r.ok)throw new AppError('PDF sayfa görüntüleri hazırlanamadı (HTTP '+r.status+'). Belge korunuyor; yeniden deneyin.',r.status===413||r.status===422?422:502);
 const result=await r.json() as {pageCount:number;pages:VisualPage[]};
 if(!Number.isInteger(result.pageCount)||result.pageCount<1||result.pageCount>60||!Array.isArray(result.pages)||result.pages.length!==result.pageCount||result.pages.some((p,i)=>p.page!==i+1||p.mime!=='image/jpeg'||typeof p.data!=='string'||!p.data.startsWith('/9j/')||p.data.length>6*1024*1024))throw new AppError('PDF sayfa görüntüleri eksik veya geçersiz; belge okuma durduruldu.',502);
 return result.pages;
}
