# CMA VGM otomasyonu — 16 Ekim 2026

Durum: uygulama ve eklenti kodu hazır; otomatik giriş / gerçek form ön kontrolü kabul testi ve gerçek gönderim kabulü tamamlanmadı. `CMA_SUBMISSION_ENABLED=false`; gerçek gönderim kapalı. Canlı sürüm `e258d75a-72ec-4b30-8f6b-194581b706ad`. Kullanıcıdan eklentinin 0.2.0 sürümünü Reload ile yüklemesi istendi; son kontrolde agent online=false, bağlantı kontrolü queued.

## Ayrı CMA bağlantısı

Eklenti mevcut yerel okuma servisini korur; ayrıca canlı CBI API'sinden kullanıcıya bağlı, dar kapsamlı iş alır. Worker yalnız kendi açtığı pasif sekmeleri kullanır. Şirket hesabını `/ebusiness/account/edit` üzerindeki `#easyreg-login` ile karşılaştırır. Giriş gerekiyorsa yalnız `auth.cma-cgm.com` sayfasına kayıtlı bilgileri girer; tek deneme yapar. CAPTCHA/ek doğrulama ve farklı hesapta durur. Çerez kopyalanmaz, kullanıcı sekmeleri kapatılmaz, T-MAXX/INTTRA relay değiştirilmez. Chrome/eklenti çalışır durumda olmalıdır; tamamen tarayıcısız bulut CMA servisi değildir.

Yeni izinler yalnız CMA auth alanı ve CBI canlı origin'idir. Özel extension paketi mevcut kimliği korunarak `.private/cma-browser/extension` içine hazırlandı; eski paket `.private/cma-vgm-release/extension-before` altında. Özel config erişim anahtarı içerir; paylaşılmaz.

## Gönderim

Onaylı VGM export'u sunucuda yeniden doğrulanır. Kullanıcı armatör booking numarası, konteyner, SM1/SM2, imzalayan ve varsa sertifikayı onaylar. Sıraya alınan ön kontrol CMA formunu doldurur, göndermez. Ön kontrolden sonra ayrı kullanıcı onayı gerekir. Gönderim açılmışsa sunucu kalıcı `submitting` kaydını oluşturmadan tek Submit tıklaması yapılmaz. Yinelenen istekler, eski kaynaklar, yanlış hesap ve yetkisiz istemciler reddedilir. Gönderim sonrası belirsizlik `unknown` olarak kalır, otomatik yeniden gönderilmez. `submitted` yalnız görünür `#submitsucess` içindeki “VGM Submitted and pending validation.” sonucu içindir; armatör kabulü değildir.

İlk sürüm tek konteyner / işlem ve standart CMA formudur. Ek ülke/shipper-owned zorunlu alanlarında işlem durur. INTTRA eVGM gönderimi bu kodla açılmaz; önceki hesap yetkisi eksikliği ayrı konudur. Mevcut VGM onayı için gereken belge ve T-MAXX konteyner kontrolleri korunur.

## Şema ve hesap

0023 yalnız iki yeni tablo ve indeks ekler. Canlı veritabanı `.private/cma-vgm-release/database-before.sql` dosyasına yedeklendi. Yedeğin SQLite kopyasında şema uygulanarak mevcut kayıt/teslimat/platform adımları/belge/hesap satırlarının değişmediği kontrol edildi; ardından yalnız 0023 canlıya uygulandı. Migration IF NOT EXISTS ile tekrarlanabilir.

Canlıda CMA hesabı bulunmadığı doğrulandıktan sonra mevcut yerel şifreli CMA hesabı bellekte çözülüp mevcut CMA hesap API'siyle canlıda şifreli saklandı. Açık parola dosyası/günlüğü üretilmedi. T-MAXX ve INTTRA hesapları korunur. Yeni agent anahtarı/owner/gönderim-kapalı bayrağı ayrı secret olarak kaydedildi. Konşimento akışı değiştirilmedi.

## Kontroller ve sınırları

44 odaklı test başarılı (VGM, CMA job/DOM, mevcut CMA yalıtımı, INTTRA preflight/mapping). TypeScript, değişen bileşenlerin lint kontrolü ve derleme başarılı. Canlı giriş/çıkış, oturumsuz 401, iki complete konşimento kaydı, T-MAXX ve INTTRA bağlantıları, booking/operasyon/arşiv/INTTRA geçmiş API'leri 200. Agent API yetkisiz istek 401. Canlı booking hideTests listesi boş olduğu için gerçek booking üstünden yeni ön kontrol akışı çalıştırılmadı. DOM testleri fixture testidir; gerçek gönderim kanıtı değildir.

Gerçek form, yöntem kodları, ağırlık birimi, başarı mesajı ve hesap alanı açık CMA oturumunda salt okunur incelendi. Gerçek form doldurulmadı/gönderilmedi. Otomatik yeniden giriş, eklenti yenilenmesi ve uçtan uca form ön kontrolü bekliyor. Gönderim bayrağı bu doğrulamalar ve kullanıcı tarafından belirlenen gerçek pilot işlem olmadan açılmamalı.


## 16 Ekim — Gerçek gönderim sonucu ve düzeltme

- ISB2086617 / TRHU3971713, 7950 KGM, Ozan Kaman: önceki yetkili gönderim CMA listesinde önce SUBMITTED, ardından INTEGRATED olarak doğrulandı. CMA gönderim tarihi 16-OCT-2026 01:17 PM; son doğrulanan cloud snapshot 2026-10-16T13:27:23.196Z. Ağırlık 7,950.00 KGM ve imzalayan eşleşti.
- Liste içindeki Refresh eski bellekteki sonucu gösterdi; tam sayfa yükleme ile sunucunun yeni sonucu görüldü. Başarı paneli bekleme süresi içinde yakalanmadığından yerel iş unknown kalmıştı. Yeni gönderim yapılmadan, hesabı doğrulanmış tam CMA geçmişiyle otomatik submitted durumuna geçti.
- Ayrıca canlı form incelemesinde konteyner bilgi sorgusu tamamlanınca CMA'nın VGM ağırlığını temizlediği görüldü. Kontrol amaçlı Submit alan doğrulamasıyla durdu; ikinci gerçek gönderim yapılmadı. 0.2.3 eklenti sabit 1.8 saniye yerine görünür konteyner darasını ve booking yüklemesinin bitmesini bekler, ağırlığı sonra yazar ve tekrar doğrular.
- Gönderim işi eski eklenti sürümlerine verilmez. Sonuç okunamazsa tekrar gönderilmez; güncel CMA geçmişi istenir. Yalnız sahibine ait, gönderimi yetkilendirilmiş unknown kayıtlar booking/konteyner/imza/tarih eşleşmesiyle düzeltilir. INTEGRATED için ağırlık da eşleşir. SUBMITTED henüz ağırlık kabulü sayılmaz.
- Sonuç incelemesinde alınan ilk MISSING görünümüne dayanılarak iş yalnız ön kontrole alınmıştı; sonraki güncel SUBMITTED kanıtı görülünce gönderim yetkisi sıfırlanmış bu ön kontrol durduruldu ve önceki unknown durumu geri getirildi. Otomatik geçmiş doğrulaması sonucu düzeltti. İşlem öncesi özel SQL yedeği ve dar kapsamlı düzeltme günlükleri .private/history-fix içinde; sırlar sürüm kontrolüne konmadı.
- 77 ilgili test başarılı (konşimento workflow/process/transfer, CMA tarayıcı, kuyruk, geçmiş ve sonuç eşleştirme). TypeScript ve üretim derlemesi başarılı. Mevcut T-MAXX/INTTRA bağlantı yöntemi değiştirilmedi.
- Otomatik gönderim kullanıcı talimatıyla tekrar etkinleştirildi. Bu kayıt yeniden gönderilmedi; sonraki farklı gerçek kayıtlar için ayrıca kullanıcının gönderim işlemi gerekir.
