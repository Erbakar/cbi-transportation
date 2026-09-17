import {AppError,runtime} from './runtime';
import {contracts,platformSession} from './platforms';
export async function inttraDocument(owner:string,reference:string){
 if(!/^\d{1,15}$/.test(reference))throw new AppError('INTTRA SI numarası doğrulanamadı.',422);
 const contract=contracts().find(c=>c.id==='inttra');if(!contract)throw new AppError('INTTRA bağlantısı tanımlanmalı.',503);
 const env=runtime();if(!env.INTTRA_RELAY_URL||!env.INTTRA_RELAY_KEY)throw new AppError('INTTRA belge bağlantısı hazır değil.',503);
 const relay=new URL(env.INTTRA_RELAY_URL);if(relay.protocol!=='https:'||relay.username||relay.password)throw new AppError('INTTRA bağlantı adresi geçersiz.',503);
 for(let attempt=0;attempt<2;attempt++){
  const session=await platformSession(contract,owner,attempt===1);if(!session.cookie)throw new AppError('INTTRA oturumu yeniden açılmalı.',503);
  let response:Response;try{response=await fetch(new URL('/document',relay),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.INTTRA_RELAY_KEY},body:JSON.stringify({reference,cookie:session.cookie}),redirect:'manual',signal:AbortSignal.timeout(90000)});}catch{throw new AppError('INTTRA belge servisine ulaşılamadı. Bağlantıyı kontrol edip yeniden deneyin.',503);}
  if(response.status===401&&attempt===0)continue;
  if(!response.ok)throw new AppError(response.status===429?'Başka bir PDF hazırlanıyor. Biraz sonra yeniden deneyin.':'INTTRA PDF çıktısı alınamadı. Platform bağlantısını kontrol edip yeniden deneyin.',502);
  if(!response.headers.get('content-type')?.includes('application/pdf'))throw new AppError('INTTRA geçerli bir PDF döndürmedi.',502);
  if(Number(response.headers.get('content-length'))>20*1024*1024)throw new AppError('INTTRA belgesi boyut sınırını aşıyor.',502);
  const bytes=await response.arrayBuffer();if(bytes.byteLength<1000||bytes.byteLength>20*1024*1024||new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw new AppError('INTTRA PDF dosyası doğrulanamadı.',502);
  return bytes;
 }
 throw new AppError('INTTRA oturumu doğrulanamadı.',502);
}
