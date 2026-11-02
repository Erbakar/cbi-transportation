// Read-only account capability probe. No SI or VGM submission endpoint is called.
export async function readInttraVgmMenu(cookie,request=fetch){
 if(typeof cookie!=='string'||!cookie||cookie.length>32768||/[\r\n]/.test(cookie))throw new Error('Invalid INTTRA session');
 const r=await request('https://api.inttra.e2open.com/auth/menus/menu-items',{method:'GET',headers:{Cookie:cookie},redirect:'manual',signal:AbortSignal.timeout(25000)});
 if(!r.ok)throw new Error('INTTRA menu unavailable');const result=await r.json();if(!Array.isArray(result)||!result.length)throw new Error('Invalid INTTRA menu');return result;
}
