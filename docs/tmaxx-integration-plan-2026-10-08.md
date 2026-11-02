# T-MAXX ana kayıt sistemi entegrasyonu

## Kullanıcı hedefi
8 Ekim 2026: tüm sayfalar T-MAXX'e bağlı çalışacak. Kayıtlar T-MAXX'e yazılacak; ekran verileri ve belgeler T-MAXX'ten okunacak. Mevcut yerel fazların bitmiş olması bu entegrasyonun tamamlandığı anlamına gelmez.

Uygulama veritabanı işlem günlüğü, eşleştirme, geçici taslak ve doğrulanmış önbellek için kullanılabilir; T-MAXX'e yazılmamış işlem başarılı/senkron olarak gösterilemez. MBL/SI için INTTRA/armatör gönderim rolü korunur. 8 Ekim 14:36 Ozan Kaman açıklaması: VGM sonucu T-MAXX'e girilmez; armatörün web sitesine girilir. VGM sonucu, T-MAXX yazma kapsamına dahil değildir; VGM son teslim tarihi takvimde izlenebilir. Kullanıcı talimatı sahte/test gönderimi veya gerçek faturanın test amacıyla değiştirilmesi anlamına gelmez.

## Sayfa sırası ve tamamlanma koşulları

| Adım | Sayfa/alan | T-MAXX karşılığı ve kabul koşulu | Durum |
|---|---|---|---|
| 1 | Ortak bağlantı, pozisyon ve belge okuma | Hesap oturumu, tam pozisyon kimliği, bağlı yükler, dijital arşiv ve dosya indirme | Yerelde geliştirildi ve gerçek veriyle salt okunur doğrulandı |
| 2 | Booking devri | Mevcut pozisyon/yükü bağlama; şirket, liman, armatör kart kimlikleri; yeni pozisyon/yük oluşturma; sürüm kontrollü kaydetme ve geri okuma | Bağlantı, kart seçimi ve oluşturma/güncelleme yerelde hazır; gerçek yazma kabulü ve adres/ekipman kapsamı bekliyor |
| 3 | Belge yükleme ve gelen evrak | Belge türü/hedef pozisyon-yük eşlemesi; otomatik arşiv yükleme; belirsiz yanıt ve tekrar denemede mükerrer engeli; sürüm bağı | Booking/gelen evrak aktarımı ve kanıtlı arşiv kurtarma yerelde hazır; gerçek yazma/kurtarma kabulü bekliyor |
| 4 | Takvim ve saha | Pozisyon tarihleri ile görev/saha olaylarını doğru T-MAXX modülüne okuma/yazma; 24/4 saat uyarıları kaynak veriden | Doğrulanan tarih ve yük saha alanları yerelde bağlı; şoför/hareket/olay ekranının adı kullanıcıdan bekleniyor; adım açık |
| 5 | VGM, kontrol ve draft/final | VGM kontrolü ve armatör sitesine gönderim/teslim kanıtı; VGM sonucu T-MAXX’e yazılmaz. Draft/final belge ve onay eşlemeleri ayrıca doğrulanır | Bekliyor |
| 6 | Pre-alert | Doğru T-MAXX belge/iletişim kaydı ve gönderim kanıtı; alıcılar teyitli; mail gönderimi ayrı kullanıcı işlemi | Bekliyor |
| 7 | Finans | Pozisyon/yük gelir-giderleri, tahakkuk/fatura ayrımı, vergi/döviz/şirket-dönem kimlikleri, kilitler; geri okuma | Bekliyor |
| 8 | Ana sayfa ve yönetim paneli | T-MAXX kaynaklı tarih/görev/statü/finans; sayfalama, filtre ve toplamların T-MAXX ile mutabakatı | Bekliyor |
| 9 | Konşimento regresyonu ve yayın | Mevcut HBL/INTTRA gönderimi korunmalı; otomatik oturum, eski kayıtlar ve PDF'ler doğrulanmalı | İlk adım mevcut aktarımı değiştirmiyor |

Her yazma işleminde: T-MAXX kimliği + sürüm, yalnız değişen alanlar, işlem günlüğü, cevap kimliği ve sonucun geri okunması gerekli. Ağ kesintisinde başarı uydurulmaz ve kontrolsüz yeniden oluşturma yapılmaz. Eski pilot kayıtları otomatik canlı T-MAXX kayıtlarına dönüştürülmez. Finans kaydı oluşturma ile faturayı kesinleştirme/muhasebeleştirme aynı işlem değildir.

## İlk adımın kanıtı
Yeni `lib/server/tmaxx-workspace.ts` modülü, `/api/tmaxx/position` ve `/api/tmaxx/position/document` uçları ve Booking listesindeki T-MAXX sorgu paneli. Veriler her sorguda doğrudan T-MAXX'ten gelir; başarısız sorguda eski sonuç gösterilmez. Dosyalar tarayıcıya kimlik doğrulamalı indirme olarak sunulur; uzak URL/token açığa çıkarılmaz.

S.E.26.09.00670 tam eşleşmesi, 451136538 pozisyonu, 451136513 yükü ve 451202146 BCM belgesi salt okunur doğrulandı. T-MAXX arşivinden 186507 bayt PDF geri alındı. T-MAXX'in dosya servisinde kök entityid null olabilir; JSON entity alanındaki kimlik, dosya referansı ve boyutu ayrıca doğrulanır. Hesaplar değiştirilmedi, ERP'ye yazılmadı.

384 test, TypeScript, değişen dosyalarda lint ve üretim derlemesi geçti. Yeni 9 test referans/kayıt eşleşmesi, başka yüke ait belge engeli, okuma sırasında pozisyon değişimi, dosya kimliği ve eksik dosya içeriğini kapsıyor. Bu kod henüz canlıya alınmadı.

## Doğrulanacak dış sözleşmeler
T-MAXX'in kendi mevcut istemcisinde seaPosition, seaGood, document/doc, bpm/mainProcessRef, crm/crmTask ve finance/invoice servisleri bulundu. Servis adının bulunması, ilgili operasyonun doğru iş karşılığı veya yazma sözleşmesinin doğrulandığı anlamına gelmez. Yerel `.private/tmaxx-integration-2026-10-08` altında kaynak parçaları ve salt okunur yanıtlar tutulur.

Belge türü kataloğunda BCM, TLM, PRA, VOT, KDM, DOM vb. var. VOT yalnız “Vgm talep/ödeme formu”; tartım belgesi/onay alanıyla eşit kabul edilmeyecek. HBL/MBL draft-final, maliyet/fatura ve onayların doğru hedef türleri ayrıca belirlenecek.

Kullanıcı ayrı test ortamı olmadığını belirtti ve hedefi netleştirdi: operasyon kayıtları T-MAXX’te; yalnız MBL talimatı armatör sisteminde (örneğin INTTRA) işlenecek. Uygulama T-MAXX için arayüzdür; bağımsız alternatif operasyon kayıt sistemi hedeflenmiyor. Geliştirme ve yazma sözleşmesi testleri yerel taklit servislerle; canlı doğrulamalar salt okunur yapılacak. Gerçek oluşturma/güncelleme kabulü, kullanıcının yapacağı gerçek operasyon sırasında doğrulanacak; deneme amacıyla gerçek kayıt oluşturulmayacak. Canlıya henüz başka entegrasyon dağıtımı yapılmadı.

Son ilerleme: [Booking bağlantısı ve belge aktarımı](tmaxx-booking-progress-2026-10-08.md).

Sonraki ilerleme: [Booking oluşturma ve güncelleme](tmaxx-booking-write-2026-10-08.md).

Son ilerleme: [Gelen evrak ve belge kurtarma](tmaxx-inbox-recovery-2026-10-08.md).

Takvim/saha ilerlemesi ve VGM hedef düzeltmesi: [kontrol notu](tmaxx-schedule-progress-2026-10-08.md).
