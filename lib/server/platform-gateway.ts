import {runtime} from './runtime';

export type PlatformGateway={url:URL;key:string};

/**
 * The VDS platform gateway (relay.trade-commerce.com) for one platform, or null when that
 * platform keeps its direct path. INTTRA always uses it while INTTRA_RELAY_URL is set; other
 * platforms are listed in PLATFORM_GATEWAY (comma separated, e.g. "tmaxx,msc").
 */
export function platformGateway(platform:string):PlatformGateway|null{
 const env=runtime();
 const enabled=(env.PLATFORM_GATEWAY||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
 if(!enabled.includes(platform)||!env.INTTRA_RELAY_URL||!env.INTTRA_RELAY_KEY)return null;
 let url:URL;try{url=new URL(env.INTTRA_RELAY_URL);}catch{return null;}
 if(url.protocol!=='https:'||url.username||url.password)return null;
 return {url,key:env.INTTRA_RELAY_KEY};
}
