# Faz 10 — Dashboard, Performans ve Sürekli İyileştirme

8 Ekim 2026. Yerel geliştirme ve belirtilen kabul kontrolleri tamamlandı. Canlıya alınmadı.

## Teslimat

Ana sayfa ve ana menüden **Yönetim paneli** (`/dashboard`) açılır. Kullanıcının booking dosyaları ve bunlara açıkça bağlanmış kayıtlar raporlanır; bağlantısız eski konşimentolar kendiliğinden bir booking'e eşleştirilmez.

Operasyon kartları açık dosya, booking teyidi, yaklaşan/geçen cut-off, VGM, talimat, draft onayı, pre-alert, belge uyuşmazlığı, bekleyen faturalar ve yansıtılmamış giderleri gösterir. Kart seçimi ilgili dosyaları listeler; kaynak çalışma ekranlarına bağlantı vardır. Temel belge eksikliği oranının pay ve paydası belirtilir. Cut-off uyarıları mevcut takvimin 24/4 saat ve görev bazındaki ayarlarını kullanır. Booking request teyit sayılmaz; eski belgeler, revize edilmiş onaylar veya geri alınan VGM onayları tamamlanmış gibi gösterilmez.

Finans bölümünde beklenen/gerçekleşen maliyet farkı, gelir, gider ve brüt kâr TRY olarak gösterilir; müşteri, hat/armatör, rota ve operasyon türüne göre gruplanır. Mevcut finans hesapları kullanılır; tam ondalık hassasiyeti korunur. Finans kaydı olmayanlar sıfır kazanç olarak sunulmaz. Tutarlar kaydedilmiş faturalara ve kurlara bağlı, vergi hariç ve eksik fatura varsa geçicidir.

Arama, UTC dosya açılış tarihi aralığı, açık/kapalı durum ve test dosyası filtreleri vardır. Filtrelenen liste CSV olarak indirilir; CSV hücreleri kaçışlanır ve formül enjeksiyonu önlenir.

Ayrı raporlama profilinde hat, operasyon türü, test işareti, açık/kapalı durum ve iyileştirme aksiyonu kaydedilir. Her değişiklik gerekçeli ve sürümlüdür; son 20 gerekçe arayüzde görülebilir, bütün geçmiş veritabanında saklanır. Raporlamada kapanış belge/konşimento/finans onayı üretmez. Yeni tablolar mevcut iş kayıtlarını veya kontrol onaylarının geçerliliğini değiştirmez.

## Ölçüm kapsamı ve sınırlar

- Otomatik okuma oranı: güncel booking belgelerindeki başarıyla tamamlanmış son okuma / güncel belgeler. İnsan onayı anlamına gelmez.
- Kullanıcı düzeltmesi: bağlı konşimentoların dolu üst bilgi kaynak alanlarında kaydedilmiş farklı kullanıcı değerleri. Konteyner ve taraf alt alanları dahil değil; henüz yapılmamış düzeltme gereksinimlerinin oranı değildir.
- T-MAXX alan sayısı: başarılı işlem adımının istek özetiyle birebir eşleşen son aktarım planındaki bilinen kaydetme alanları. Mevcut HBL içe alma ve kanıtsız geçmiş aktarımlar hariç; tarihsel toplam için alt sınırdır.
- Manuel giriş azalması için gösterge: booking'e belgeden uygulanmış benzersiz alan sayısı / dosya. Ölçülmüş insan emeği veya zaman tasarrufu değildir; önce/sonra çalışma süresi baz çizgisi mevcut değil.
- Ortalama süre: açıkça raporlamada kapatılmış dosyalarda açılıştan kapanışa geçen takvim süresi. Aktif kullanıcı işlem süresi değildir; geçmiş kapanışlar uydurulmaz.
- Draft revizyonu: HBL/MBL sürüm dosyasında ilk taslaktan sonraki taslaklar; final sürüme geçiş hariç.
- Pre-alert sorun oranı: hazırlığı kaydedilmiş dosyalardaki güncel kontrol sorunu oranı. Başlanmamış dosyalar ayrı bekleyen işler göstergesinde yer alır.
- Mükerrer sayısı: gelen evrakta mükerrer olarak mevcut belgeye bağlandığı günlüğe kaydedilmiş olaylar. Önceden kaydedilmeyen finans/booking/platform engelleme denemelerinin genel toplamı bilinmiyor.
- Payda/kapanış örneği yoksa “Ölçüm yok” gösterilir. Tüm dosyalar aynı anda alınmış tek bir veritabanı görüntüsü değildir; hesaplama sırasında bir dosya değişirse 409 ile yeniden okunur. Başarısız dosyalar sessizce sıfır sayılmaz; raporun eksik olduğu belirtilir.

Tam tarihsel otomasyon tasarrufu, aktif çalışma süresi ve bütün modüllerdeki engellenen denemeler için geçmişte tutulmamış ölçümler bu fazda geriye dönük üretilemez. Ekrandaki göstergeler yukarıdaki açık tanımlarla sınırlıdır.

## Doğrulama

- Önceki baz: **348/348 test**. Son sonuç: **368/368 test**, başarısız/atlanmış yok.
- Yeni 20 test: tam ondalık finans, ağırlıklı oran/payda, ölçümsüz durum, gruplama, CSV formül güvenliği, sahiplik, 102 dosyada sayfalama, sürüm çakışması ve atomik geçmiş, operasyon verisi/epoch korunması, request/revision ayrımı, geri alınmış VGM, eski draft, eksik belge/uyuşmazlık ayrımı, kısmi yansıtma, kaynak yarış koşulu ve eski okuma özeti.
- TypeScript, değişen dosyalarda lint ve üretim derlemesi geçti.
- Yerel HTTP: 8 booking raporu okundu; örnek finans 3.000 TRY beklenen, 3.520 gider, 4.500 gelir, **980 TRY kâr**. Oturumsuz erişim, başka kaynaklı yazma ve eski sürümle güncelleme reddedildi.
- Önceki fazlarda açıkça sentetik oluşturulmuş 8 booking yalnız yeni raporlama profillerinde test olarak işaretlendi; varsayılan rapordan ayrıldı.
- Tarayıcıda arama, test filtresi, hat gruplaması, karttan 3 ilgili dosyaya süzme, mevcut belge yönetimine geçiş, sentetik dosya kapanışı ve iyileştirme notunun kalıcı kaydı doğrulandı.
- CSV tarayıcıdan indirildi; iki satır (başlık + seçilen tek dosya), doğru dosya ve 980 TRY kâr dosyanın içeriğinden doğrulandı. Tarayıcının indirme olay bildirimi zaman aşımına uğradı; dosyanın kendisi başarıyla oluştu.
- Giriş/çıkış, altı konşimento kaydının listelenmesi ve otomatik T-MAXX/INTTRA bağlantısının bağlı yanıtı geçti. Bu, gerçek gönderim testi değildir.
- Önceki pre-alert geçmişi, finans görev açıklaması ve 980 TRY sonuç korundu. Yedekle karşılaştırmada **177 önceki iş/yapılandırma satırı birebir aynı**; geçici oturum tabloları karşılaştırmanın dışında.
- Gerçek konşimento/e-posta/muhasebe gönderimi yapılmadı. Canlı yük/performance veya ayrı mobil viewport testi yapılmadı; tarayıcı kontrolü masaüstü yerel ortamda yapıldı.

## Dosyalar ve dağıtım

Yeni migration: `drizzle/0018_reporting.sql`; yalnız yerel DB'ye uygulandı. `booking_reporting` ve `booking_reporting_events` ekler. Operasyon tablolarını değiştirmez, bu tablolara tetikleyici eklemez. Canlı ortam bu çalışma kapsamında değiştirilmedi.

Yedek ve kontroller: `.private/phase10-2026-10-08/before.sqlite`, `baseline.log`, `tests.log`, `build.log`, `acceptance.mjs`, `acceptance-result.json`, `regression.mjs`, `regression-result.json`, `csv-check.json`. Ekran kanıtı: `output/phase10-2026-10-08/dashboard-verified.png`.

Canlı dağıtımda önce önceki fazların migration durumları doğrulanmalı, uygun yedekle bütün gerekli migration'lar ve uygulama sürümü birlikte ele alınmalıdır. Eski yedek sonradan eklenen kayıtların üzerine yazılmamalıdır. Geri dönüşte yeni raporlama tabloları korunarak önceki uygulama sürümüne dönülebilir; bu tablolar eski operasyon akışını etkilemez.
