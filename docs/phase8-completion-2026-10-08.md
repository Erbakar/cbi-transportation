# Faz 8 — Otomatik Pre-alert Hazırlığı

8 Ekim 2026 · Yerel geliştirme ve yerel kabul tamamlandı. Canlıya alınmadı.

## Tamamlanan kapsam

- Booking ve belge yönetimi ekranlarından erişilen pre-alert hazırlık ekranı: alıcılar, operasyon özeti, ekler, kontrol listesi, e-posta önizlemesi ve gönderim geçmişi.
- Booking/sefer, gemi, POL/POD, ETD/ETA, konteyner/mühür, paket, yük brüt ağırlığı, mal, agent/consignee ve release bilgileri mevcut booking, takvim ve kontrol kaynaklarından önerilir. Eksikler gerekçeyle tamamlanır. Bilinen kaynakla çelişen özet değeri paket oluşturmayı engeller; kabul edilmiş mühür kararı özet önerisinde dikkate alınır.
- Final HBL ve final MBL veya Sea Waybill zorunludur. Tüm seçilen ekler Faz 7'de güncel ve onaylı final olmalıdır. Taslak, eski sürüm, eksik dosya veya geçersiz onayla paket hazırlanamaz. İsteğe bağlı zorunlu ek türleri ve VGM gerekliliği kaydedilir. VGM seçilmişse mevcut VGM onayları da doğrulanır.
- Faz 6'nın kaynak, kimlik, rota, konteyner, ağırlık ve son teslim kontrolleri uygulanır. Faz 7'ye alınmış güncel finallerde eski taslak-final işaretinin yerine sürüme bağlı Faz 7 final onayı kullanılır; diğer kaynak engelleri atlanmaz. Önceki Faz 6 ekranı ve aktarım kapısı değiştirilmedi.
- Alıcılar ve ekler ile İngilizce e-posta metni değişmez paket kaydında saklanır. UTF-8 başlıklar, dosya adları ve base64 ekler içeren `.eml` dosyası indirilir. İndirme gönderim sayılmaz. Paket sınırı 12 ek ve toplam 20 MB'dir.
- Kaynak, onay, alıcı veya hazırlık revizyonu değiştiğinde eski paket indirilemez. Kaynak değişikliği kontrol işaretlerini temizler; özet, alıcı ve ek düzenlemelerinde de arayüz yeniden kontrol ister. İndirme sırasında dosya hash'leri ve güncel kaynaklar yeniden doğrulanır.
- Kullanıcı kendi e-posta uygulamasında gönderir; ardından gerçek gönderim zamanı, kanalı, kanıt referansı ve alıcı/ek eşleşmesi beyanıyla gönderim kaydı oluşturur. Alıcılar, CC, ek kimlikleri/hash'leri, kaydeden kullanıcı ve zaman saklanır. Aynı paketin ikinci gönderim kaydı engellenir.
- Gönderim kaydı booking'in pre-alert durumunu otomatik günceller ve booking detayında gösterilir. Sonradan kaynak/onay değişirse güncel durum yeniden kontrol olarak görünür; önceki gönderim kanıtı kaybolmaz.

## Korunan mevcut akış ve sınırlar

Yeni hazırlık tabloları eklenmiştir. Mevcut konşimento kayıtları, platform eşlemeleri, hesaplar, servis adresleri, oturum yapısı ve gönderim günlükleri değiştirilmemiştir. Eski kayıtlar otomatik olarak pre-alert sürecine alınmaz.

Bu faz plandaki ilk otomasyon düzeyini uygular: taslak ve ek hazırlığı, kullanıcı tarafından gönderim ve kanıtlı gönderim kaydı. SMTP/Outlook üzerinden otomatik mesaj göndermez. İndirilen e-postanın dışarıda değiştirilmesini veya gerçek teslimatını sistem kendiliğinden göremez; kullanıcı gönderim kaydında alıcı ve eklerin paketle aynı olduğunu doğrular. Gerçek posta istemcisinden gönderim ve alıcı teslimatı test edilmedi.

## Doğrulama

- Başlangıçtaki 314 test geçti. Son durumda 333 test geçti; 19 yeni pre-alert testi eklendi.
- Gerçek SQLite geçişleri üzerinde paket şartları, HBL/MBL/Sea Waybill, eski veya onaysız ek, revizyon, alıcı değişikliği, VGM gerekliliği, kaynak uyuşmazlığı, bozuk dosya, sahiplik, eşzamanlı değişiklik, mükerrer kayıt, tarih ve e-posta başlık doğrulamaları test edildi.
- Tür kontrolü, yeni uygulama dosyaları ve veritabanı şemasında lint, üretim derlemesi geçti.
- Yerel API testinde yalnız yeni sentetik booking ve açıkça `NOT A SHIPPING DOCUMENT - DO NOT SEND` işaretli dört PDF kullanıldı. Kontrol okuması/pozisyon kaynağı test verisi olarak oluşturuldu; gerçek AI okuması veya gerçek T-MAXX operasyon eşleşmesi olarak sunulmaz. İlk test verisindeki boş VGM alanı şema tarafından reddedildi; doğru şemalı yeni okuma kaydı eklenip onaylar yenilendi. Eski test okuma geçmişi silinmedi.
- Gerçek uygulama API'sinde Faz 6/Faz 7 kontrollerinden geçen HBL ve MBL paketi hazırlandı. EML standart MIME ayrıştırıcısıyla açıldı; alıcılar, İngilizce gövde, dosya adları ve PDF byte'ları asıllarıyla eşleşti. Dosya adı parametresindeki uyumluluk sorunu bu kontrolde bulunup düzeltildi.
- Tarayıcıda oturum açma, hazırlığı kaydetme, paket oluşturma ve indirme doğrulandı. Sentetik dosyada açıkça test olarak işaretlenmiş gönderim kaydı oluşturuldu; booking detayında durumun güncellendiği görüldü. Gerçek mesaj gönderilmedi.
- Test final onayı geri alındığında eski paket indirmesi 409 ile engellendi, kontroller sıfırlandı ve gönderim geçmişi korundu. Test sonunda HBL onayı aktif bırakılmadı.
- Ayrı API oturumunda giriş–çıkış, mevcut 5 konşimentonun görüntülenmesi ve otomatik platform bağlantısı kontrol edildi: T-MAXX ve INTTRA `connected: true`.
- Geçiş öncesindeki 33 iş/yapılandırma tablosundaki mevcut 113 satır birebir korundu. Geçici oturum tabloları ve sağlayıcının dahili meta tabloları bu karşılaştırmadan hariçtir.

## Geçiş, geri dönüş ve kanıtlar

`drizzle/0016_prealert.sql` yalnız yerel veritabanına uygulandı. Üç yeni tablo eklendi. Geçiş öncesi SQLite yedeği `.private/phase8-2026-10-08/before.sqlite` dosyasındadır. Yeni geçmiş kayıtlarını silmeden, yalnız bu fazın ekran/API/modülleri ve navigation/durum bileşeni geri alınabilir. Yedeğin mevcut veritabanının üzerine otomatik yüklenmesi sonraki kullanıcı kayıtlarını kaybettirebileceğinden yapılmadı.

- Yerel test booking: `9cd7cc8d-60d6-483f-94e6-a4e310f99981` — `FAZ8-TEST-20261008`.
- Ekran: `/booking/9cd7cc8d-60d6-483f-94e6-a4e310f99981/prealert`.
- Test/derleme/koruma/API kanıtları: `.private/phase8-2026-10-08/`.
- Paket önizlemesi: `output/phase8-2026-10-08/prealert-preview.png`.
- Kontrolün yeniden istendiği son ekran: `output/phase8-2026-10-08/prealert-verified.png`.

Canlıya dağıtım ve gerçek e-posta/konşimento gönderimi yapılmadı. Canlıya geçişte güncel üretim yedeği, önceki fazların bekleyen geçişleri ve gerçek operasyon kabulü ayrıca ele alınmalıdır.
