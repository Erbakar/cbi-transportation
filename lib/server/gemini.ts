/**
 * Gemini calls with retries for temporary failures. Overload (503), rate limits (429), gateway
 * errors and dropped connections usually pass within seconds; one such answer used to send a
 * whole e-mail to staff. Requests are idempotent reads (nothing is written anywhere by Gemini),
 * so repeating them is safe. A timeout set by the caller is respected and never retried.
 */
export const RETRY_STATUSES=new Set([408,429,500,502,503,504]);
const sleepFor=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));

export function retryDelay(attempt:number,retryAfter:string|null,random=Math.random()){
 const seconds=Number(retryAfter);
 if(retryAfter&&Number.isFinite(seconds)&&seconds>=0)return Math.min(seconds*1000,20000);
 return Math.round([2000,6000,12000][Math.min(attempt,2)]*(0.75+random*0.5));
}

export async function geminiFetch(url:string,init:RequestInit,{retries=2,sleep=sleepFor,label='gemini'}:{retries?:number;sleep?:(ms:number)=>Promise<void>;label?:string}={}):Promise<Response>{
 for(let attempt=0;;attempt++){
  let response:Response;
  try{response=await fetch(url,init);}
  catch(error){
   // The caller's own timeout ended the request: not repeated.
   if(init.signal?.aborted||attempt>=retries)throw error;
   console.warn(JSON.stringify({event:'gemini-retry',label,attempt:attempt+1,error:error instanceof Error?error.name:'unknown'}));
   await sleep(retryDelay(attempt,null));continue;
  }
  if(!RETRY_STATUSES.has(response.status)||attempt>=retries)return response;
  console.warn(JSON.stringify({event:'gemini-retry',label,attempt:attempt+1,status:response.status}));
  const wait=retryDelay(attempt,response.headers.get('retry-after'));
  await response.body?.cancel().catch(()=>{});
  await sleep(wait);
 }
}
