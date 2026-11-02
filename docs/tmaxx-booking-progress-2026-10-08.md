# T-MAXX booking bağlantısı ve belge aktarımı — yerel geliştirme

Kullanıcı hedefi: MBL armatör sisteminde; diğer operasyonların ana kaynağı T-MAXX. Bu çalışma tüm entegrasyonun tamamlanması değildir.

## Bu adım
- Booking dosyası mevcut T-MAXX pozisyonunun tek bir yüküne bağlanabilir. Pozisyon ve yük canlı okunur; satış referansından tahmin yapılmaz. Sahiplik ve booking sürümü kontrol edilir. Eşleşme sabittir; aynı hesapta aynı yük iki booking'e bağlanamaz.
- Bağlanan dosyada güncel T-MAXX pozisyon/yük bilgileri ve dijital arşiv belgeleri görüntülenir. Eski operasyon alanları sessizce değiştirilmez.
- Belge yükleme sırasında gerçek T-MAXX belge kataloğundan tür seçilir. Uygulama kaynağı saklar, dosyayı T-MAXX'e yükler, dijital arşiv kaydını oluşturur ve kaydı geri okuyarak doğrular. Bu adım T-MAXX booking alanlarını değiştirmez.
- Eski belgeler otomatik gönderilmez; ilgili satırdaki T-MAXX arşivine kaydet/kontrol et işlemiyle gönderilebilir. Yeni sürümler önceki belgeyi T-MAXX'te silmez/değiştirmez.
- Dosya yükleme ve arşiv bağlama ayrı günlük adımlarıdır. Ağ kesintisi/yanıt kaybında sonuç belirsiz gösterilir; aynı istek otomatik tekrarlanmaz. Tamamlanmış adımlar tekrar kullanılabilir. Belirsiz uzaktaki işlemin otomatik mutabakatı henüz yok; T-MAXX arşiv kontrolü gerekir.
- Kaynak dosya özeti, hedef yük/pozisyon ilişkisi, kilit ve seçilen belge türü tekrar denetlenir. Test işaretli pilot dosyalar canlı T-MAXX yüküne bağlanamaz ve belge gönderemez.
- Henüz bağlı olmayan dosyaların mevcut yerel belge akışı korundu; arayüz T-MAXX bağlantısı olmadığını açıkça belirtir.

## Kontroller
394 test başarılı. TypeScript, değişen dosyalarda ESLint ve üretim derlemesi başarılı. Gerçek T-MAXX'te salt okunur pozisyon/yük/arşiv sorgusu Booking ekranında doğrulandı. Oluşturma/güncelleme kabulü taklit ERP ile test edildi: sahiplik, eski sürüm, tekil eşleşme, bilinmeyen belge türü, kilit, kaynak değişimi, paralel gönderim, kayıp upload/link yanıtı, yanlış geri okuma ve tekrar gönderim engeli.

0019_tmaxx_booking.sql yalnız yerel veritabanına uygulandı. Önce SQLite backup alındı: .private/tmaxx-booking-2026-10-08/before.sqlite. Mevcut iş tabloları önce/sonra aynı; yeni entegrasyon tabloları gerçek verilerle doldurulmadı. Gerçek T-MAXX'e belge/kayıt yazılmadı ve canlıya dağıtılmadı. Gerçek upload kabulünün yapılmadığı, birim testi başarısıyla örtülmemelidir.

## Sıradaki işler
1. T-MAXX kart kimlikleriyle yeni pozisyon/yük oluşturma ve mevcut booking alanlarını sürüm kontrollü kaydetme; başarılı kayıt sonrası geri okuma.
2. Gelen evrak akışını aynı hedef/işlem günlüğüne bağlama, belirsiz arşiv kayıtlarını kanıtlı eşleştirerek kurtarma.
3. Takvim/saha, VGM/onay, pre-alert, finans, ana sayfa ve rapor kaynaklarını T-MAXX'e bağlama. Önceki entegrasyon planındaki kalan maddeler sürüyor.

8 Ekim sonraki adım: kart seçimi ve sürüm kontrollü oluşturma/güncelleme yerelde eklendi. Kapsam, doğrulama ve kalan sınırlamalar: [Booking kayıt formu](tmaxx-booking-write-2026-10-08.md). Yukarıdaki sıradaki işlerin birincisi bu sınırlamalarla geliştirildi; gerçek yazma kabulü bekliyor.

Gelen evrak aktarımı ve kanıtlı kurtarma da yerelde geliştirildi: [kapsam ve kontrol sonuçları](tmaxx-inbox-recovery-2026-10-08.md). Yalnız yüklenmiş fakat arşiv kaydı oluşmamış belirsiz dosyalar otomatik kurtarılamaz.
