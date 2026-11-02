# Faz 4 — Rezervasyon, nakliye ve saha
Tarih: 7 Ekim 2026

Durum: Yerel uygulama ve teknik kabul testleri tamamlandı. Canlıya alınmadı. Gerçek sevkiyat üzerinde kullanıcı kabulü yapılmadı. Canlı sistem Faz 2 sürümündedir; Faz 3 ve Faz 4 yerelde bulunmaktadır.

## Uygulanan kapsam
- Booking detayından ayrı Nakliye ve saha ekranına geçiş.
- Ortak operasyon bilgileri: yükleyici, booking, gemi/sefer, rota, ekipman, armatör, yükleme adresi/irtibatı, boş depo, dolu teslim terminali, gümrük ve evrak teslim bilgileri.
- Altı çıktı türü: yükleyici–gümrükçü rezervasyon notası, nakliyeci yükleme talimatı, boş alım bilgisi, dolu konteyner/evrak teslim bilgisi, yükleme teyit e-postası ve konteyner/mühür bilgi talebi. Adres, irtibat ve teslim bilgileri bu çıktılara ortak kayıttan aktarılır.
- Bütün yeni taslaklar aynı ortak bilgilerden üretilir. Yerel düzeltmeler açıkça işaretlenir ve kaynak değere döndürülebilir.
- T-MAXX için mevcut salt okunur bağlantı kullanılır. Tam pozisyon referansı, seçili yükün pozisyona aitliği ve önizleme içeriğinin değişmediği doğrulanır. ERP üzerinde yazma yapılmaz.
- T-MAXX kaynağı son okumanın kopyasıdır; yeni okumayı kullanıcı başlatır. Mevcut saha satırları ve yerel düzeltmeler korunur. Yalnız tamamen boş saha kaydı ERP konteynerlerinden başlatılır.
- Konteyner başına nakliyeci, araç/dorse, plaka, şoför, iletişim, konteyner ve mühür; gerçekleşen boş alım, yükleme başlangıç/bitiş ve dolu giriş saatleri.
- Bekleme/sorun olayları; başlangıç, bitiş, konteyner bağı, açıklama ve çözüm.
- Saat dilimi, tarih sırası, konteyner kontrol hanesi, tekrar eden numara ve gelecekte gerçekleşmiş olay kaydı kontrolleri.
- Değişiklik gerekçesi ve eski saha sürümleri saklanır. Mevcut satırlar silinmez; konteyner satırı iptal edilir.
- Arşiv kopyaları değişmez; kaynaklar değiştiğinde eski kopya etiketi gösterilir. Metin indirme/kopyalama ve tarayıcı yazdırma/PDF düzeni bulunur.
- Gönderim kaydı belirli arşiv kopyasına bağlanır: alıcı, tarih/saat, kanal ve kanıt/mesaj referansı. Kullanıcının gönderim beyanı olarak gösterilir; uygulama e-posta veya WhatsApp mesajı göndermez. Aynı beyanın tekrar isteği çoğaltılmaz.

## Doğrulama
- Başlangıç: 238 mevcut test geçti.
- Sonuç: 254 test geçti (16 yeni test). TypeScript, değişen dosyaların lint kontrolü ve üretim derlemesi geçti.
- Hesap sahipliği, eşzamanlı booking/takvim/saha değişiklikleri, ilk kayıt yarışları, eski önizleme, kaynak eşleşmesi, ortak alan yayılımı, arşiv değişmezliği, gönderim beyanı, silme koruması, konteyner ve tarih kontrolleri test edildi.
- Yerel API kabulünde altı taslak arşivlendi. Booking numarası değişince altı yeni taslak güncellendi; eski indirilen kopyanın metni aynı kaldı.
- Gerçek T-MAXX pozisyonu S.E.26.09.00670 ve yükü YK.S.E.26.09.00801 mevcut bağlantı üzerinden salt okunur sorgulandı. T-MAXX'ten içeri alma yazma senaryosu otomatik testlerde kontrollü kaynakla doğrulandı; gerçek ERP verisi sentetik booking'e uygulanmadı.
- Tarayıcıda yeni sayfa, saha düzenleme/kaydetme, çıktı seçimi, talimatın taslağa yansıması, arşiv oluşturma ve eski/güncel arşiv işaretleri kontrol edildi.
- Sentetik test kaydı: FAZ4-KABUL-20261007. Test alıcısı example.invalid adresidir; gerçek gönderim yapılmadı.
- 18 tablodaki mevcut 54 iş/veri satırı değişiklik öncesi yedekle birebir aynı kaldı. Oturum önbellekleri, giriş denemeleri ve veritabanı metadata'sı iş kaydı karşılaştırmasının dışındadır.
- Yedek: .private/phase4-2026-10-07/before.sqlite.
- Kabul kanıtları: .private/phase4-2026-10-07/; ekran görüntüsü output/phase4-completion-2026-10-07/field-output.png.

## Sınırlar ve canlıya geçiş
- Gönderim beyanı teslim edildi onayı değildir. Gerçek dış mesaj veya konşimento gönderimi yapılmadı.
- Yazdır/PDF arayüzü eklendi; işletim sisteminin yazdırma iletişim kutusundan fiziksel çıktı veya PDF kaydetme bu çalışmada doğrulanmadı.
- Saha ekranı açılışta ve Yenile ile kaynakları günceller. Arşivleme ve kayıt sırasında eski sürüm kullanımı sunucuda engellenir.
- Booking başına 100 konteyner, 100 olay sınırı; ekranda son 50 çıktı/saha geçmişi ve son 100 gönderim görünür.
- T-MAXX haricindeki gerçek platform akışları bu fazda tekrar uçtan uca test edilmedi. Ortak oturum ve bağlantı ayarları değiştirilmedi.
- Canlıya geçiş öncesi güncel canlı yedeği alınmalı; henüz uygulanmamış 0011 ve 0012 geçişleri kontrollü uygulanmalı; giriş–çıkış, otomatik bağlantılar ve mevcut kayıtlar canlıda ayrıca doğrulanmalı.
