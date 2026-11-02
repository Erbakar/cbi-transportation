import {AppError,runtime} from './runtime';
import {cloudCmaHistory} from './cma-history-store';
export type CmaBrowserState={configured:boolean;extensionOnline:boolean;connected:boolean;submissionEnabled:false;checkedAt:string|null;state:string;rows?:string[][];total?:number|null;scope?:string;complete?:boolean;accountVerified?:boolean;refreshing?:boolean;message?:string};
const offline=(state:string):CmaBrowserState=>({configured:state!=='not_configured',extensionOnline:false,connected:false,submissionEnabled:false,checkedAt:null,state});
export async function cmaBrowser(owner:string,read=false):Promise<CmaBrowserState>{
 const env=runtime();if(env.CMA_AGENT_KEY&&env.CMA_AGENT_OWNER===owner)return cloudCmaHistory(owner,read);
 if(!env.CMA_BROWSER_KEY||env.CMA_BROWSER_OWNER!==owner){if(read)throw new AppError('Bu hesap için yerel CMA bağlantısı kurulmamış.',409);return offline('not_configured');}
 if(!/^[a-f0-9]{64}$/.test(env.CMA_BROWSER_KEY))throw new AppError('CMA yerel bağlantı ayarı geçersiz.',503);
 try{
  const r=await fetch('http://127.0.0.1:18745'+(read?'/read':'/status'),{method:read?'POST':'GET',headers:{Authorization:'Bearer '+env.CMA_BROWSER_KEY},redirect:'manual',signal:AbortSignal.timeout(read?58000:2000)});
  if(r.status>=300&&r.status<400)throw new AppError('Yerel CMA servisi beklenmeyen yönlendirme döndürdü.',503);
  const data=await r.json() as Omit<CmaBrowserState,'configured'>&{error?:string};
  if(!r.ok)throw new AppError(data.error||'Yerel CMA bağlantısı yanıt vermedi.',r.status===409?409:503);
  return {...data,configured:true,submissionEnabled:false};
 }catch(e){if(read)throw e instanceof AppError?e:new AppError('Yerel CMA servisine ulaşılamadı.',503);return offline('service_offline');}
}
