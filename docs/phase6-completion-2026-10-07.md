# Faz 6 — Konşimento Veri Kontrol Merkezi

7 Ekim 2026 · Yerel geliştirme ve yerel kabul tamamlandı. Canlıya alınmadı.

## Tamamlanan kapsam

- Müşteri talimatı, booking teyidi/revizyonu, taşıyıcı SI, VGM, HBL/MBL taslak ve final, Sea Waybill için kanıt/sayfa/okuma güveni taşıyan PDF veya görsel okuması.
- 39 alanın booking, kayıtlı T-MAXX pozisyon kaynağı, güncel belge okumaları ve bağlı konşimentonun manuel düzeltmeleri uygulanmış verisiyle karşılaştırılması.
- Konteyner kimliği, mühür, tip ve ağırlıkların konteyner bazında karşılaştırılması; farklı konteynerlerin ağırlıklarının veya yük brüt ağırlığı ile VGM'ın aynı alan olarak ele alınmaması.
- Gerekçeli fark kabulü, dosyaya ve kaynak sürümüne özel taraf/navlun CBI istisnası, yanlış belgeyi dışlama/geri alma ve karar geçmişi. Fark kabulü konşimento alanlarını kendiliğinden değiştirmez.
- Yanlış pozisyon/konteyner, liman/booking/müşteri uyuşmazlığı, okunmamış veya türü uyuşmayan belge ve temel kimlik kanıtı eksikliği için engeller. Kritik kimlik/rota farkı basit bir onayla aşılamaz.
- Son teslim görevinin “tamamlandı” olması tek başına gönderim sayılmaz. Geçmiş cut-off için ilgili güncel belgenin gerekçeli gönderim kanıtı gerekir; belirsiz son teslim saati düzeltilmelidir.
- Taslak onayı ve ilgili güncel taslağa bağlı final doğrulaması. Pre-alert listesi yalnızca bu kontrollerden geçen güncel final belgeleri içerir; e-posta göndermez.
- Gönderilecek kesin planın tüm alanlarıyla önizlemesi, gerekçeli onay/iptal geçmişi; payload/kaynak/karar değişikliği veya onay iptalinde tekrar onay zorunluluğu.
- Kontrole bağlanan kayıtlarda ilk T-MAXX/INTTRA aktarımı, INTTRA revizyonu ve T-MAXX düzeltmesine onay kapısı. Günlükteki gerçek yazma adımlarından önce de kontrol edilir. Önceden tamamlanmış adımların tekrar gönderilmesini önleyen günlük davranışı korunur.

## Mevcut akışı koruma kararı

Kullanıcının bu çalışmada tekrarladığı “mevcut konşimento akışını bozma” talimatıyla yeni onay kapısı yalnızca açıkça kontrol dosyasına bağlanan konşimentolarda etkindir. Mevcut kayıtlar otomatik bağlanmaz. Kontrole bağlanmamış kayıtlar önceki süreçlerini kullanır. Bu nedenle tüm eski kayıtların zorunlu olarak yeni onay sistemine taşındığı iddia edilmez.

Bağlantı sahiplik, pozisyon referansı ve seçilmiş T-MAXX yükünün konteynerleri üzerinden doğrulanır. Başka yüklere ait konteynerleri içeren birleşik bir konşimento bu tek yük bağlantısına zorla bağlanamaz; mevcut çoklu HBL akışı değişmeden kullanılabilir. Karşılaştırma otomatik semantik eşanlamlılık çıkarmayan temkinli bir kontroldür: farklı liman yazımları gibi uyuşmazlıklar kaynaktan düzeltilmelidir.

Mevcut platform eşlemeleri, bağlantı adresleri, hesap ayarları, oturum sistemi, belge indirme ve platform önkontrol/önizleme davranışları değiştirilmedi. Onay kapısı kesin aktarım/düzeltme planının uygulanmasını kontrol eder; mevcut platform önkontrolleri final gönderim değildir.

## Doğrulama

- 301 test geçti. Önceki aktarım, kısmi başarı, belirsiz sonuç, yeniden deneme, HBL/MBL taraf ayrımı ve mükerrer gönderim koruma testleri korundu.
- Yeni SQL üzerinde 19 kontrol testi: eski akışın etkilenmemesi, kesin plan onayı, kaynak/payload değişikliği, onay iptali, sahiplik, yanlış yük/konteyner, kritik fark, belge dışlama, düşük güven, dosya bütünlüğü, eşzamanlı kaynak değişikliği, okuma kilidi/hatası, cut-off kanıtı, taslak-final ve eski sürüm pre-alert engeli.
- Ek aktarım testleri: onaysız planın iki platformda da son yazmadan önce durması; adım düzeyinde reddedilen onayın gönderim veya belirsiz günlük kaydı oluşturmaması.
- TypeScript, değiştirilen uygulama dosyalarında lint ve üretim derlemesi geçti.
- İki açıkça sentetik PDF gerçek belge okuma servisiyle okundu. İlk okumanın şema doğrulamasında reddedilmesi üzerine yanıt şeması servis isteğinde açıkça tanımlandı; sonraki iki okuma başarıyla doğrulandı.
- Yerel tarayıcıda giriş, karşılaştırma, gerekçeli plan onayı ve iptali doğrulandı. Test planı yalnızca test önizlemesidir; gerçek platform planı veya gerçek gönderim değildir. Test onayı iş sonunda iptal edildi.
- Ayrı API oturumuyla giriş–çıkış, mevcut 5 konşimentonun görüntülenmesi ve otomatik bağlantı kontrolü geçti. T-MAXX ve INTTRA `connected: true` döndü.
- Geçiş öncesi 24 tablodaki 75 iş verisi satırı eski sütunlarıyla birebir korundu. Yalnızca yeni, açıkça sentetik kabul kayıtları eklendi.

## Yerel geçiş ve geri dönüş

`drizzle/0014_bill_control.sql` yalnızca yerel veritabanına uygulandı. Geçiş öncesi SQLite yedeği `.private/phase6-2026-10-07/before-completion.sqlite` dosyasında. Yeni kontrol tabloları ve kontrol sürümü sayacı eklendi; eski iş kayıtları taşınmadı veya silinmedi. Kod geri alınması gerekirse yalnızca Faz 6 ekleri geri alınmalı; denetim kayıtlarını içeren yeni tabloları silmek gerekmez. Yedek geri yükleme, sonradan oluşan kullanıcı verilerini silmemek için otomatik yapılmamalıdır.

Canlıya geçmeden önce mevcut üretim yedeği alınmalı ve henüz canlıya uygulanmamış önceki faz geçişleriyle birlikte sıra doğrulanmalıdır. Bu çalışma canlı dağıtım yapmadı.

## Kabul kanıtları

- Yerel test booking: `94abd519-614d-42ab-b14e-e72e20d0855e` (`FAZ6-TEST-20261007`).
- Sentetik test konşimento: `9d37e231-1cf1-4465-8fd9-3a8d81bf322d` (`PHASE6-TEST-DO-NOT-SEND.pdf`).
- Yerel test dosyasında T-MAXX kaynağı açıkça sentetik test verisidir; gerçek platformdan alınmış operasyon doğrulaması olarak sunulmaz.
- Test/okuma/koruma sonuçları: `.private/phase6-2026-10-07/`.
- Ekran: `output/phase6-2026-10-07/control-completed.png`.

Gerçek HBL/MBL gönderimi veya armatöre e-posta yapılmadı. Otomatik test/derleme başarısı gerçek taşıyıcının belge kabulü yerine geçmez. Gerçek evrakla operasyon kabulü ve canlıya alma ayrıca yapılmalıdır.
