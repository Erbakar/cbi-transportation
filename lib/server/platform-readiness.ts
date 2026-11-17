import {platformEnabled} from './platform-policy';
import {ensureTmaxxSession} from './tmaxx-workflow';
import {ensureInttraSession} from './inttra-workflow';
import {AppError} from './runtime';

/**
 * Before an e-mail instruction is checked or transferred, T-MAXX and INTTRA must answer with a
 * working session. Each check is one harmless read; an expired session is opened again with the
 * saved account. Nothing is written to either platform here.
 */
export async function ensurePlatformSessions(owner:string,skip:readonly string[]=[]){
 const failures:string[]=[];
 const message=(e:unknown)=>(e instanceof Error?e.message:'bağlantı kurulamadı').slice(0,160);
 if(platformEnabled('tmaxx')&&!skip.includes('tmaxx'))try{await ensureTmaxxSession(owner);}catch(e){failures.push('T-MAXX: '+message(e));}
 if(platformEnabled('inttra')&&!skip.includes('inttra'))try{await ensureInttraSession(owner);}catch(e){failures.push('INTTRA: '+message(e));}
 if(failures.length)throw new AppError('Platform oturumu açılamadı · '+failures.join(' · '),503);
}
