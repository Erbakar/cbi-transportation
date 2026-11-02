# İşlem bildirimleri — 26 Ekim 2026

Platformdaki işlem sonucu bildirimleri ortak `ApplicationToaster` üzerinden gösterilir. `OperationToast` mevcut bileşen durumunu izler; `notify` olay işleyicilerinden bildirim verir. Başarı, hata, uyarı ve bilgi mesajları aynı başlık, açıklama ve kapatma düzenini kullanır. Teknik servis yanıtları `userMessage` ile kullanıcıya uygun metne çevrilir; servisin özgün yanıtı ve kayıtlı teşhis bilgisi değiştirilmez.

## Davranış

- PDF’nin platformda kaydedilmesi bilgi mesajıdır. T-MAXX aktarımı doğrulanınca aynı işlem bildirimi başarı mesajına dönüşür.
- Mevcut belgeyle eşleşme ikinci kayıt oluşturulmadığını açıklar. Belirsiz gönderimler başarı olarak gösterilmez ve yeniden gönderim önerilmez.
- Aynı metinle gelen arka plan yenilemeleri kapanan bildirimi tekrar açmaz. Bileşen kapandığında bildirimi temizlenir; giriş ve çıkışta eski oturum bildirimleri kaldırılır.
- Başarı/bilgi 9 saniye, uyarı 14 saniye görünür. Hata kullanıcı kapatana kadar kalır. Hover/focus sırasında Sonner’ın okuma süresini koruyan davranışı kullanılır.
- Kayıt durumları, alan doğrulama ayrıntıları ve kullanıcıyı ilgili dosyaya götüren bağlantılar kalıcı içerik olarak korunur.
- Ortak tasarım masaüstü ve dar ekranda çalışır; erişilebilir Türkçe bölge/kapatma etiketleri ve azaltılmış hareket desteği vardır.

## Kontroller

- Bildirim anlamlandırma, kullanıcı mesajı, önbellek/oturum yalıtımı ve otomatik Pre-alert akışı: 26 test geçti.
- TypeScript kontrolü ve üretim derlemesi geçti.
- Lint taramasında yalnız önceden de bulunan `tmaxx-recovery.tsx` içindeki `react-hooks/set-state-in-effect` hatası kaldı. Değişiklik öncesi yedek dosyada aynı hata doğrulandı; bu işlem akışı değiştirilmedi.
- Gerçek React bileşenleriyle yerel tarayıcı önizlemesinde pozisyon bulma, sırada bekleme → başarı geçişi, bildirim kapatma, aynı sonucu yenileyince tekrarlamama, teknik hata metninin gizlenmesi ve 390 pikselde taşmama doğrulandı. Önizleme sahte API yanıtları kullanır; gerçek T-MAXX gönderimi yapmaz.
- Yerel giriş ekranında hatalı giriş toast’ı, doğru giriş ve giriş sonrası eski bildirimin temizlenmesi görüldü. Yayın sonrası gerçek tarayıcıda çıkışın giriş ekranına dönmesi de doğrulandı.
- Pre-alert yükleme, pozisyon bulma, kuyruk, zamanlayıcı ve Cloudflare yapılandırma dosyalarının değişmediği SHA-256 karşılaştırmasıyla doğrulandı. İşlem bileşenlerindeki mevcut yükleme/kaydetme işleyicileri korundu.

## Canlı ortam ve yayın durumu

Değişiklik öncesi canlı kontrolde giriş 200, çıkış 200, çıkış sonrası yetkisiz kayıt isteği 401 döndü. Kayıt listesi, 11 Pre-alert kaydı, pozisyon okuması ve bağlantı kontrolü yanıt verdi. Önceden arşivlenmiş bir PDF’yi indirme isteği HTTP 503 döndü; bu hata yeni kod yayınlanmadan önce de vardı.

Kullanıcının Cloudflare girişinden sonra mevcut yayın yetkileriyle oturum yenilendi. Yayın öncesi etkin `5768ade5-acb2-499f-b028-15050b63be8e` sürümünün 232 kod modülünün son doğrulanan kaynakla aynı olduğu kontrol edildi; sürüm ve ayarlar özel yerel klasöre yedeklendi. Bildirim güncellemesi yayınlandı. Canlı kontrolde elle pozisyon arama yanıtındaki “tekil” ifadesi de sadeleştirildi; 11 mesaj testi ve üretim derlemesi yeniden geçti. Son sürüm: `1f8f20be-d8ae-433f-b526-d8bc50722784`, trafik %100.

Yayın sonrası 11 Pre-alert kaydı, mevcut konşimento kayıtları, belge kimlikleri ve platformdaki PDF içeriği değişmedi. T-MAXX ve INTTRA bağlantıları aktif; giriş 200, çıkış 200 ve çıkış sonrası kayıt erişimi 401. 17 servis/veri/ayar bağlantısı öncekiyle aynı; ayrı aktarım zamanlayıcısı değiştirilmedi. T-MAXX doğrudan PDF indirme isteği 503 vermeye devam ediyor; platformda saklanan PDF 200 ile indiriliyor ve özgün dosyanın SHA-256 değeriyle eşleşiyor. Doğrulama için gerçek konşimento veya PDF gönderilmedi.

Son sürümde tarayıcıdan çıkış ve yeniden giriş, mevcut konşimento/Pre-alert listeleri, otomatik bağlantı durumları, bağlantı kontrolü başarı toast’ı ve elle pozisyon aramasındaki sade uyarı doğrulandı. Bildirim kapatılıp deneme numarası temizlendi; yeni PDF ekranı kullanıcı için açık bırakıldı. Canlı kontrol yeni kayıt oluşturmadı.

Yerel yedekler, test çıktıları, kaynak karşılaştırmaları ve ekran görüntüleri `.private/toasts-2026-10-26/` içindedir; sırlar veya kayıt dökümleri sürüm kontrolüne eklenmemelidir.
