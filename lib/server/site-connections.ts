import {db} from './runtime';
import {readCredentials} from './platforms';
import {platformEnabled} from './platform-policy';
import {cmaBrowser} from './cma-browser';
const sites=[
 {id:'tmaxx',name:'T-MAXX',monogram:'TM',category:'OPERASYON & HBL',description:'Booking, yük kayıtları ve dijital belge arşivi.',url:'http://95.216.243.19:8090/',workspace:'/booking',workspaceLabel:'Booking dosyaları'},
 {id:'inttra',name:'INTTRA',monogram:'IN',category:'MBL TALİMATI',description:'Armatör talimatları ve konşimento belgeleri.',url:'https://my.inttra.e2open.com/dashboard',workspace:'/bills',workspaceLabel:'Konşimentolar'},
 {id:'cma-cgm',name:'CMA CGM',monogram:'CM',category:'ARMATÖR · VGM',description:'Kayıtlı şirket hesabıyla arka planda VGM bağlantısı.',url:'https://www.cma-cgm.com/ebusiness/vgm',workspace:'/vgm',workspaceLabel:'VGM kayıtları'},
];
export async function siteConnections(owner:string){
 return {checkedAt:new Date().toISOString(),sites:await Promise.all(sites.map(async site=>{
  try{
   const saved=!!await readCredentials(owner,site.id);
   if(site.id==='cma-cgm'){const browser=await cmaBrowser(owner);return {...site,credentialsSaved:saved,state:browser.connected?'browser_ready':browser.extensionOnline?'check_required':'waiting',label:browser.connected?'Tarayıcı erişimi hazır':browser.extensionOnline?'Okuma bekliyor':'Yerel bağlantı bekliyor',detail:browser.connected?'Son VGM okuması başarılı. Otomatik gönderim kapalı.':(browser.message||'Chrome ve CBI bağlantı eklentisi açık olmalı; giriş kayıtlı hesapla otomatik yapılır.'),browser};}
   if(!platformEnabled(site.id))return {...site,credentialsSaved:saved,state:'paused',label:'Duraklatıldı',detail:'Otomatik platform bağlantısı duraklatılmış.'};
   const session=await db().prepare('SELECT expires FROM platform_sessions WHERE key=?').bind(owner+':'+site.id).first<{expires:number}>();
   const ready=!!session&&session.expires>Date.now();
   return {...site,credentialsSaved:saved,state:ready?'ready':saved?'check_required':'waiting',label:ready?'Oturum hazır':saved?'Kontrol gerekli':'Hesap bekleniyor',detail:ready?'Son doğrulanan uygulama oturumu henüz geçerli.':saved?'Hesap kayıtlı. Bağlantı durumu yeniden doğrulanmalı.':'Platform hesabı henüz kaydedilmemiş.'};
  }catch{return {...site,credentialsSaved:false,state:'unavailable',label:'Durum alınamadı',detail:'Bağlantı bilgisi şu anda okunamıyor.'};}
 }))};
}
