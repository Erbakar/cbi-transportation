# Sayfalar arası görüntü önbelleği — 15 Ekim 2026

Kullanıcıya ve sorguya göre ayrılmış sessionStorage + bellek önbelleği eklendi. Oturum sunucudan doğrulanmadan çalışma alanı açılmaz. Çıkışta önbellek temizlenir; devam eden ortak okumalar iptal edilir ve geç sonuçların yeniden önbelleğe yazılması engellenir. Şifre, platform oturumu ve gönderim yanıtları bu mekanizmaya alınmaz.

T-MAXX aylık arşiv, INTTRA geçmişi, CMA VGM geçmişi, platform durumları ve T-MAXX raporu ortak önbelleği kullanır. Beş dakika boyunca tekrar tarama yapılmaz; görünür sayfada dakika başına kontrol ve pencereye dönüşte eskimiş verilerin arka planda yenilenmesi sağlanır. Manuel yenileme güncellik süresini atlar. Aynı sorgunun eşzamanlı okuyucuları tek isteği paylaşır. Son başarılı sonuç 24 saatten eskiyse kullanılmaz; tarayıcı sekmesi kapanınca sessionStorage silinir.

Ana sayfa/yönetim raporu, booking listesi, operasyon takvimi ve konşimento listesi görüntüleri saklanır; mevcut güncel okuma yolları korunur. Formlar, yetkilendirme ve gönderim kararları önbelleğe bağlanmaz. Konşimento listesinden ayrıntı açılırken güncel sunucu kaydı tekrar alınır. Yenilemede başarısız veya tamamlanmamış platform geçmişi başarılı görüntünün üzerine yazılmaz. Eşit içerik aynı veri nesnesini korur; başarılı okuma zamanı yenilenir.

Doğrulama: kullanıcı/sorgu ayrımı, sayfa yeniden yüklemesinde saklama, tek uçuş, hata halinde eski sonucu tutma, çıkışta iptal/geç yanıt, depolama kotası ve eşit içerik testleri. Mevcut konşimento PDF/revizyon/yanıt ve operasyon testleri çalıştırıldı. Yerel oturumla records ve operasyon API kontrolleri 200 döndü; oturumsuz arşiv 401 döndü. Tarayıcıda operasyon -> yönetim paneli geçişinde 497 belge ve aynı son okuma zamanı korundu. 27 INTTRA talimatı ve 39 aylık VGM doğrulandı. Gerçek konşimento gönderilmedi.

Yayın notu: 15 Ekim 2026 tarihinde `a6b2e882-06e9-409f-acda-6919ee5a5275` sürümüyle canlıya alındı. Doğrulama ve CMA bağlantı sınırı için `release-2026-10-15.md` belgesine bakın.
