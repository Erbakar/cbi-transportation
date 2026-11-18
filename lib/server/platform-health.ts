import {AppError,db} from './runtime';

/**
 * Sign-in back-off. A platform whose sign-in was rejected (or could not be reached) is not
 * tried again until the back-off ends: a security wall that rejects automated sign-ins with
 * 403/429 only blocks longer when it keeps being hit. Work that needs the platform waits
 * (mail transfers resume on their own); nothing tries to get around the rejection.
 */
export type PlatformHealth={platform:string;blockedUntil:number;failures:number;reason:string};
const MINUTE=60000,HOUR=60*MINUTE;
const names:Record<string,string>={inttra:'INTTRA',tmaxx:'T-MAXX'};

/** 403/429 (security wall / rate limit): 30 min, doubling up to 6 h. 400/401 (account rejected): 6 h. Anything else: 10 min. */
export function backoffMs(status:number|undefined,failures:number){
 if(status===400||status===401)return 6*HOUR;
 if(status===403||status===429)return Math.min(30*MINUTE*2**Math.max(0,failures-1),6*HOUR);
 return 10*MINUTE;
}

let known=new Map<string,number>();
/** Platforms in back-off right now, as last read from the database by this Worker. */
export function coolingPlatforms(now=Date.now()){return [...known].filter(([,until])=>until>now).map(([id])=>id);}
export function platformAvailable(id:string,now=Date.now()){return (known.get(id)||0)<=now;}

export async function refreshPlatformHealth(){
 const {results}=await db().prepare('SELECT platform,blocked_until FROM platform_health WHERE blocked_until>?').bind(Date.now()).all<{platform:string;blocked_until:number}>();
 known=new Map(results.map(r=>[r.platform,Number(r.blocked_until)]));
 return coolingPlatforms();
}

export async function platformCooling(id:string):Promise<PlatformHealth|null>{
 const row=await db().prepare('SELECT platform,blocked_until,failures,reason FROM platform_health WHERE platform=? AND blocked_until>?').bind(id,Date.now()).first<{platform:string;blocked_until:number;failures:number;reason:string|null}>();
 if(!row){known.delete(id);return null;}
 known.set(id,Number(row.blocked_until));
 return {platform:row.platform,blockedUntil:Number(row.blocked_until),failures:Number(row.failures),reason:row.reason||''};
}

export function clock(ms:number){
 try{return new Date(ms).toLocaleTimeString('tr-TR',{timeZone:'Europe/Istanbul',hour:'2-digit',minute:'2-digit'});}
 catch{return new Date(ms).toISOString().slice(11,16)+' UTC';}
}
export function coolingMessage(h:Pick<PlatformHealth,'platform'|'blockedUntil'|'reason'>){
 const name=names[h.platform]||h.platform;
 return `${name} girişi geçici olarak bekletiliyor; ${clock(h.blockedUntil)} sonrası yeniden denenecek.`+(h.reason?' Son yanıt: '+h.reason.slice(0,160):'');
}
export function coolingError(h:PlatformHealth){return Object.assign(new AppError(coolingMessage(h),503),{cooling:true});}

/** Records a failed sign-in (or an unreachable platform) and starts the back-off. */
export async function recordPlatformFailure(id:string,status:number|undefined,reason:string){
 const now=Date.now();
 const row=await db().prepare('SELECT failures,blocked_until,updated_at FROM platform_health WHERE platform=?').bind(id).first<{failures:number;blocked_until:number;updated_at:string|null}>();
 // Failures more than a day apart start counting again.
 const recent=row&&row.updated_at&&now-Date.parse(row.updated_at)<24*HOUR;
 const failures=(recent?Number(row!.failures):0)+1;
 const blockedUntil=now+backoffMs(status,failures);
 await db().prepare('INSERT INTO platform_health(platform,blocked_until,failures,reason,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(platform) DO UPDATE SET blocked_until=excluded.blocked_until,failures=excluded.failures,reason=excluded.reason,updated_at=excluded.updated_at').bind(id,blockedUntil,failures,reason.slice(0,300),new Date(now).toISOString()).run();
 known.set(id,blockedUntil);
 console.warn(JSON.stringify({event:'platform-backoff',platform:id,status:status??null,failures,until:new Date(blockedUntil).toISOString()}));
 return {platform:id,blockedUntil,failures,reason} satisfies PlatformHealth;
}

export async function clearPlatformHealth(id:string){
 await db().prepare('DELETE FROM platform_health WHERE platform=?').bind(id).run();
 known.delete(id);
}
