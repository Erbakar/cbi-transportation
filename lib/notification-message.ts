import {userMessage} from './user-message';

export type NoticeTone='success'|'error'|'warning'|'info';
export type Notice={tone:NoticeTone;title:string;description:string};
export function notificationMessage(value:unknown,tone:NoticeTone|'auto'='auto'):Notice|null{
 const text=userMessage(value).trim();
 if(!text)return null;
 // Describe the confirmed stage, never turn a saved/queued or uncertain write
 // into a successful transfer just because its text contains "kaydedildi".
 const notice=(kind:NoticeTone,title:string,description:string):Notice=>({tone:kind,title,description});
 if(/mevcut Pre-alert ile eşleştirildi|PDF.*mevcut.*eşleştirildi/i.test(text))return notice('success','Belge zaten arşivde','PDF, T-MAXX’teki mevcut belgeyle eşleştirildi. İkinci bir kayıt oluşturulmadı.');
 if(/PDF, T-MAXX Pre-alert arşivine kaydedildi|T-MAXX arşiv kaydı doğrulandı/.test(text))return notice('success','T-MAXX aktarımı tamamlandı','PDF, T-MAXX arşivinde ve açılabildiği doğrulandı. Belge listesinden PDF’yi indirebilirsiniz.');
 if(/PDF.*(?:otomatik aktarılacak|Otomatik aktarım bekleniyor)|PDF kaydedildi\. Otomatik aktarım/.test(text))return notice('info','PDF kaydedildi, aktarım bekleniyor','Belgeniz platformda kayıtlı. T-MAXX’e otomatik aktarılacak. Sayfayı kapatabilirsiniz; PDF’yi yeniden yüklemeniz gerekmez.');
 if(text==='Pozisyon belgedeki konşimento bilgileriyle bulundu.')return notice('success','Pozisyon bulundu','Pozisyon numarası PDF’deki bilgilerle dolduruldu. Kontrol edip kaydedin; gerekirse numarayı değiştirebilirsiniz.');
 if(/Pozisyon tekil olarak bulunamadı/.test(text))return notice('warning','Pozisyon numarasını kontrol edin','Bu numarayla bir pozisyon seçilemedi. Tam pozisyon numarasını girip “Pozisyonu bul” düğmesine basın.');
 if(/tek bir pozisyon|tek bir pozisyonla eşleşmiyor|birden fazla olası kayıt/.test(text))return notice('warning','Pozisyonu kontrol edin','PDF’deki bilgilerle tek bir pozisyon bulunamadı. Pozisyon numarasını girip “Pozisyonu bul” düğmesine basın.');
 if(/pozisyon kilitli/i.test(text))return notice('warning','Bu pozisyona belge eklenemiyor','Pozisyon kilitli. Pozisyon numarasını kontrol edin; doğruysa şirketinizin operasyon sorumlusuyla görüşün.');
 if(/Sonuç belirsiz|sonucu belirsiz|sonucu doğrulanamadı|tekrar denemeden önce kayıt durumunu|Yeni bir gönderim başlatmadan önce/.test(text))return notice(tone==='error'?'error':'warning','İşlem sonucunu kontrol edin',text);
 const negative=/tamamlanamadı|başarısız|yapılamadı|kaydedilemedi|gönderilemedi|ulaşılamadı|kurulamadı|okunamadı|bulunamadı|alınamadı|silinemedi|doğrulanamadı|yetkiniz|hata|geçersiz|sona ermiş/i;
 const caution=/eksik|belirsiz|uyarı|eşleşmiyor|uyuşmuyor|kilitli|kontrol gerekiyor|kontrol gerekli|zorunlu|seçin|girin|düzeltin|doğrulaması istiyor|henüz açık değil/i;
 const pending=/bekleniyor|bekliyor|kuyru|sıraya|sırada|başlıyor|başlatıldı|kontrol ediliyor|hazırlanıyor|gönderiliyor|aktarılıyor|güncelleniyor|tamamlanmadı|gönderilmedi|aktarılmadı/i;
 const positive=/tamamlandı|kaydedildi|güncellendi|doğrulandı|eşleştirildi|indirildi|silindi|kopyalandı|bağlantı.*aktif|bağlantıları yenilendi|oluşturuldu/i;
 const kind:NoticeTone=negative.test(text)?(tone==='warning'?'warning':'error'):caution.test(text)?(tone==='error'?'error':'warning'):pending.test(text)?'info':tone!=='auto'?tone:positive.test(text)?'success':'info';
 return notice(kind,kind==='error'?'İşlem tamamlanamadı':kind==='warning'?'Kontrolünüz gerekiyor':kind==='success'?'İşlem tamamlandı':'İşlem bilgisi',text);
}
