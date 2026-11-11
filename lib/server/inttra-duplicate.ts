import {AppError,db} from './runtime';
import {inttraHistory} from './inttra-history';

const norm=(s:string)=>s.toUpperCase().replace(/[^A-Z0-9]/g,'');
/** Cancelled or carrier-rejected instructions do not block a new one. */
const inactive=/CANCEL|REJECT|DECLIN|DELET/i;

/**
 * One booking gets one shipping instruction. Before a new INTTRA SI is created, both our own
 * history (deleted records included) and INTTRA's last 30 days are checked for that booking.
 * If either cannot be read, nothing is sent: a duplicate SI is worse than a delayed one.
 */
export async function requireNoInttraDuplicate(owner:string,recordId:string,booking:string|null|undefined){
 const key=norm(booking||'');if(!key)return;
 const local=await db().prepare("SELECT reference FROM deliveries WHERE owner=? AND platform='inttra' AND record_id<>? AND status IN ('created','sending','unknown') AND instr(upper(payload),?)>0 LIMIT 1").bind(owner,recordId,JSON.stringify(key)).first<{reference:string|null}>();
 if(local)throw new AppError(`Bu booking (${key}) için sistemden daha önce INTTRA talimatı gönderilmiş${local.reference?' (SI '+local.reference+')':''}. Mükerrer olmaması için yeni talimat gönderilmedi; mevcut talimat güncellenmeli.`,409);
 let rows:{siId:string;carrierBooking:string;status:string;carrierAcknowledgmentStatus:string}[];
 try{rows=(await inttraHistory(owner)).rows;}
 catch{throw new AppError('INTTRA’daki mevcut talimatlar okunamadı; mükerrer kontrolü yapılamadığı için talimat gönderilmedi.',409);}
 const found=rows.find(r=>norm(r.carrierBooking)===key&&!inactive.test(r.status+' '+r.carrierAcknowledgmentStatus));
 if(found)throw new AppError(`Bu booking (${key}) için INTTRA’da zaten bir talimat var (SI ${found.siId}). Mükerrer olmaması için yeni talimat gönderilmedi; mevcut talimat güncellenmeli.`,409);
}
