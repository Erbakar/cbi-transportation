# Faz 7 — Belge, Taslak, Onay ve Sürüm Yönetimi

7 Ekim 2026 · Yerel geliştirme ve yerel kabul tamamlandı. Canlıya alınmadı.

## Tamamlanan kapsam

- Booking kaydından açılan, önce belge dosyalarını listeleyen ayrı belge yönetimi ekranı. Yeni dosya açma, ayrıntı inceleme ve mevcut arşivden sürüm bağlama.
- HBL, MBL/Sea Waybill, booking, VGM ve diğer belge aileleri. Her dosyada numaralı sürüm geçmişi ve en fazla bir güncel final.
- Bekleniyor, alındı, veri çıkarıldı, kontrol gerekiyor, hazırlandı, gönderildi, revize geldi, yeniden gönderildi, onaylandı, final ve pre-alert için seçildi durumları. Revizyon talebi ve yeniden kontrole alma da kayıt altındadır.
- Sürümün göndereni, kaydeden kullanıcısı, zamanı, değişiklik isteyen tarafı, eski/yeni alan değerleri, ücreti, para birimi ve risk açıklaması korunur. Mevcut belge okumalarındaki farklar ile kullanıcı beyanları ayrı kaynak olarak tutulur.
- Gönderim ve onay; ilgili kişi/kurum, gerçek işlem zamanı, açıklama ve isteğe bağlı arşiv kanıt belgesiyle tam belge sürümüne bağlanır. Belge okuması değişirse eski onay geçersizleşir. Önceden gerçekleşmiş olaylar, kendi sıralamaları korunarak sonradan kaydedilebilir.
- Yeni arşiv revizyonu geldiğinde eski final seçimi kaldırılır ve otomatik geçmiş kaydı eklenir. Yeni sürüm açıkça dosyaya bağlanıp yeniden kontrol edilmelidir. Taslak türündeki HBL/MBL final seçilemez.
- Eski sürüm müşteri/pre-alert indirme kapısında engellenir; arşiv aslı ve geçmişi korunur. Ekranda eski sürüm için uyarı vardır. Onay geri alındığında final ve gönderime hazır indirme bağlantıları kaldırılır.
- Faz 6 pre-alert listesi, Faz 7 dosyasına alınmış belgelerde ayrıca güncel final/onay şartını uygular. Eşzamanlı kaynak değişikliği, sahiplik, dosya bütünlüğü ve kayıt kilidi denetlenir. Durum, sürüm ve olay kaydı atomik olarak yazılır.

## Mevcut akışın korunması

Mevcut konşimento aktarımı, T-MAXX/INTTRA eşlemeleri, hesaplar, bağlantı adresleri ve oturum sistemi değiştirilmedi. Eski belgeler ve konşimentolar yeni sürece otomatik alınmadı. Yeni dosyaya açıkça bağlanan belgelerde sürüm kuralları uygulanır. Orijinal arşiv indirmesi tarihsel inceleme için korunur; dışarıda elle paylaşılmış dosyaların kullanımını sistem teknik olarak engelleyemez.

Faz 7'de “gönderildi” dışarıda gerçekleşmiş gönderimin kanıtlı kaydıdır. İşlem gönderim yapmaz. “Pre-alert için seçildi” belge seçimidir; otomatik paket, alıcı listesi ve e-posta hazırlama Faz 8 kapsamındadır. Faz 6 kaynak kontrolleri ayrıca geçerlidir.

## Doğrulama

- 314 test geçti. Önceki 301 test korunarak 13 yeni yaşam döngüsü testi eklendi; önceki pre-alert testi yeni dosya onayını da denetleyecek şekilde genişletildi.
- Gerçek SQLite geçişleri üzerinde durum geçişleri, değişmez geçmiş, tek final, bağlı onay, eski/henüz bağlanmamış yeni sürüm engeli, eski akış uyumluluğu, sahiplik, dosya/kanıt bütünlüğü, eşzamanlı güncelleme, ücret doğrulaması ve geçmiş olay sıralaması doğrulandı.
- Tür kontrolü, değişen yeni uygulama dosyalarında lint ve üretim derlemesi geçti.
- Yerel API ile iki sentetik test PDF'sinin arşive yüklenmesi, taslaktan revizyona/finale ilerleme, tek final, eski sürüme 409 yanıtı, eski arşiv aslının erişimi ve final indirmesi doğrulandı. Bunlar Faz 6'nın sentetik PDF'lerini sürüm yönetimi denemesi için yeniden kullanır; gerçek HBL içerik onayı veya yeni OCR kabulü değildir.
- Tarayıcıda sürüm listesi, değişen alanlar, onay geçmişi ve onayı geri alma işlemi doğrulandı. Test dosyası sonunda yeniden kontrole alındı; aktif final/test onayı bırakılmadı.
- Ayrı oturumla giriş–çıkış, mevcut 5 konşimentonun görüntülenmesi ve platform bağlantı kontrolü geçti. T-MAXX ve INTTRA `connected: true` döndü.
- Geçiş öncesindeki 30 iş/config tablosunun mevcut 91 satırı birebir korundu. Oturum ve sağlayıcının dahili meta tabloları bu karşılaştırmaya dahil değildir. Yalnız yeni sentetik test booking/belge/geçmiş kayıtları eklendi.

## Geçiş ve geri dönüş

`drizzle/0015_document_lifecycle.sql` yalnızca yerel veritabanına uygulandı. Üç yeni tablo ve ilgili tetikleyiciler eklendi; eski kayıtlar taşınmadı veya silinmedi. Geçiş öncesi güvenli SQLite yedeği `.private/phase7-2026-10-07/before.sqlite` dosyasındadır.

Geri dönüşte yalnız bu fazın yeni ekran/API/modülleri, booking bağlantısı, arşiv uyarısı ve pre-alert entegrasyonu geri alınmalıdır. Geçmişi korumak için yeni tabloları silmek gerekmez. Yedeğin tüm veritabanının üzerine otomatik yüklenmesi sonraki kullanıcı verilerini kaybettirebilir; böyle bir işlem yapılmadı.

Canlı dağıtımdan önce güncel üretim yedeği ve henüz canlıya uygulanmamış önceki faz geçişleri birlikte değerlendirilmelidir. Bu çalışma canlı dağıtım, gerçek konşimento aktarımı veya e-posta gönderimi yapmadı. Gerçek operasyon/armatör kabulü bu yerel testlerin yerine geçmez.

## Kanıtlar

- Yerel test booking: `bc310aea-8790-4e5c-92f0-a7ac3bd03ed8` — `FAZ7-TEST-20261007`.
- Yerel ekran: `/booking/bc310aea-8790-4e5c-92f0-a7ac3bd03ed8/documents`.
- Test, derleme, API kabul ve koruma sonuçları: `.private/phase7-2026-10-07/`.
- Final seçimi ekranı: `output/phase7-2026-10-07/document-management.png`.
- Test onayı geri alınmış son ekran: `output/phase7-2026-10-07/document-management-verified.png`.
