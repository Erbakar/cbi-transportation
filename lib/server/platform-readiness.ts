import {platformEnabled} from './platform-policy';
import {ensureTmaxxSession} from './tmaxx-workflow';
import {ensureInttraSession} from './inttra-workflow';
import {platformCooling,coolingMessage,recordPlatformFailure,refreshPlatformHealth} from './platform-health';
import {AppError} from './runtime';

/**
 * Before an e-mail instruction is checked or transferred, the platforms must answer with a
 * working session. Each check is one harmless read; an expired session is opened again with the
 * saved account. Nothing is written to either platform here.
 *
 * T-MAXX is required: without it the e-mail waits (503). INTTRA is not: when it cannot be reached
 * (sign-in rejected, connection server down) a back-off starts and INTTRA is listed as unavailable,
 * so the HBL still goes ahead and the MBL instruction follows once INTTRA answers again.
 */
export async function ensurePlatformSessions(owner:string,skip:readonly string[]=[]):Promise<{unavailable:string[];notes:string[]}>{
 await refreshPlatformHealth();
 const failures:string[]=[],unavailable:string[]=[],notes:string[]=[];
 const message=(e:unknown)=>(e instanceof Error?e.message:'bağlantı kurulamadı').slice(0,160);
 if(platformEnabled('tmaxx')&&!skip.includes('tmaxx'))try{await ensureTmaxxSession(owner);}catch(e){failures.push('T-MAXX: '+message(e));}
 if(platformEnabled('inttra')&&!skip.includes('inttra')){
  const cooling=await platformCooling('inttra');
  if(cooling){unavailable.push('inttra');notes.push(coolingMessage(cooling));}
  else try{await ensureInttraSession(owner);}
  catch(e){
   // A rejected sign-in already started its back-off; anything else (connection server down) starts a short one here.
   const health=await platformCooling('inttra')||await recordPlatformFailure('inttra',undefined,message(e));
   unavailable.push('inttra');notes.push(coolingMessage(health));
  }
 }
 if(failures.length)throw new AppError('Platform oturumu açılamadı · '+failures.join(' · '),503);
 return {unavailable,notes};
}
