import {z} from 'zod';
import {AppError,runtime} from './runtime';
import {contracts,platformSession,fetchJson} from './platforms';
type Menu={itemName:string;itemLabel:string;itemLinkUrl?:string;childItems?:Menu[]};
const menu:z.ZodType<Menu>=z.lazy(()=>z.object({itemName:z.string(),itemLabel:z.string(),itemLinkUrl:z.string().optional(),childItems:z.array(menu).optional()}));
export function assessVgmAccess(raw:unknown){const result=z.array(menu).nonempty().safeParse(raw);if(!result.success)throw new AppError('INTTRA hesap menüsü doğrulanamadı.',502);const matches:Menu[]=[];const visit=(items:Menu[])=>{for(const item of items){if(/vgm/i.test(item.itemName+' '+item.itemLabel))matches.push(item);if(item.childItems)visit(item.childItems);}};visit(result.data);return {available:matches.length>0,submissionEnabled:false,checkedAt:new Date().toISOString(),message:matches.length?'Hesap menüsünde VGM bulundu. Gönderim alanları ve alındı doğrulaması henüz tamamlanmadı; otomatik gönderim kapalı.':'Bu INTTRA hesabının menüsünde eVGM bulunmuyor. Hesap yöneticisi eVGM ürün erişimini ve kullanıcı yetkisini kontrol etmeli. Otomatik gönderim kapalı.'};}
export async function inttraVgmAccess(owner:string){const contract=contracts().find(c=>c.id==='inttra');if(!contract)throw new AppError('INTTRA bağlantısı bulunamadı.',503);const session=await platformSession(contract,owner);if(!session.cookie)throw new AppError('INTTRA web oturumu doğrulanmalı.',409);const config=runtime();let raw:unknown;
 if(config.INTTRA_RELAY_URL){const base=new URL(config.INTTRA_RELAY_URL);if(base.protocol!=='https:'||base.username||base.password||!config.INTTRA_RELAY_KEY)throw new AppError('INTTRA bağlantı ayarı doğrulanamadı.',503);raw=(await fetchJson(new URL('/vgm-access',base).toString(),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.INTTRA_RELAY_KEY},body:JSON.stringify({cookie:session.cookie})})).data;}
 else raw=(await fetchJson('https://api.inttra.e2open.com/auth/menus/menu-items',{method:'GET',headers:{Cookie:session.cookie}})).data;
 return assessVgmAccess(raw);
}
