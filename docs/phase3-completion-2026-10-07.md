# Faz 3 — yerel geliştirme ve doğrulama
Tarih: 7 Ekim 2026

Durum: Operasyon takvimi ve uygulama içi uyarılar yerelde uygulanıp doğrulandı. Faz 3 canlıya alınmadı; canlı sistem Faz 2 sürümünde. Gerçek operasyon üzerinde kullanıcı kabulü henüz yapılmadı.

## Teslim edilen kapsam
- Booking görevleri ve bütün booking kayıtları için merkezi operasyon ajandası; tarih, sorumlu, durum ve arama filtreleri.
- Ekipman uygunluğu, boş konteyner alımı, yükleme, terminal teslimi, SI/VGM/gümrük/liman son teslimleri, ETD/ATD/ETA/ATA, aktarma ve free time tarihleri.
- Güncel teyit/revizyon PDF'sinden kaynak alıntısı, sayfa ve okuma kaydıyla tarih önerileri. Kullanıcı tarih, saat, saat dilimi ve sevkiyatı kontrol ederek kaydeder. Eksik yıl veya saat dilimi varsayılmaz; tahmini tarihler gerçekleşen tarihe dönüştürülmez.
- Sorumlu ve durum yönetimi; tamamlandı/iptal ve yeniden açma; görev bazında beklenen belge.
- Kullanıcının tercihiyle varsayılan 24 saat önce yaklaşan uyarısı, 4 saat önce kritik uyarı. Her görevde iki süre de değiştirilebilir. Saat belirtilmemiş görevlerde yalnız gün düzeyinde uyarı.
- Geciken görev, eksik belge, atanmamış sorumlu ve değişen kaynak uyarıları; tarih sırası kontrolü.
- Gerekçeli değişiklik geçmişi ve eski sürümlerin korunması. Eşzamanlı kayıt ve belge değişikliği kontrolleri; hesap sahipliği doğrulaması.

## Doğrulama
- 238 test geçti; 24/4 saat sınırları, saat dilimi/yaz saati, sahiplik, yarış koşulları, değiştirilmiş/eski belge kanıtı ve geçmiş koruması dahil.
- TypeScript kontrolü, değişen takvim/okuma dosyalarının lint kontrolü ve üretim derlemesi geçti.
- Sentetik PDF ile gerçek belge okuma servisi üzerinden 12 açık tarih okundu. Belirtilmeyen ATD/ATA boş kaldı.
- Yerel sentetik booking üzerinde teyit → revizyon → tekrar okuma → güncel kaynağı takvime alma test edildi. Önceki tarih geçmişte kaldı, mevcut görev çoğaltılmadı.
- Tarayıcıda ajanda, booking görev paneli, kaynak değişikliği uyarısı ve 24/4 saat ayarlarıyla kaydetme doğrulandı.
- Değişiklik öncesi veritabanı yedeği: .private/phase3-2026-10-07/before.sqlite.
- Önceden bulunan 5 konşimento, 10 teslim, 6 revizyon, 1 booking, belgeler, maliyetler, gelen kutusu ve platform kimlik bilgileri satır bazında aynı kaldı. Platform oturum önbellekleri ve yerel veritabanı metadata bilgisi değişmişti; bunlar iş kaydı karşılaştırmasından ayrı tutuldu.
- Bu fazda gerçek konşimento gönderimi yapılmadı. Gerçek platform bağlantılarının yeniden uçtan uca testi bu fazın doğrulamasına dahil değildir.

## Sınırlar / sonraki kabul
- Uyarılar uygulama ekranı açıkken dakikada bir güncellenir. Arka plan, e-posta, SMS veya push bildirimi yoktur.
- Çoklu aktarma durakları ayrı görevler olarak girilir.
- Ajanda en güncel 500 booking ile sınırlıdır ve sınırı kullanıcıya bildirir. Görev sınırı booking başına 100; ekranda son 50 geçmiş sürümü gösterilir.
- Yerel sentetik test kaydı FAZ3-KABUL-20261007 açıkça test olarak etiketlendi; gerçek operasyon verisi değildir.
- Canlıya geçişte güncel canlı yedeği alınmalı, 0011_operation_schedule.sql uygulanmalı ve gerçek oturum/platform bağlantıları ile mevcut kayıtlar yeniden doğrulanmalıdır.
