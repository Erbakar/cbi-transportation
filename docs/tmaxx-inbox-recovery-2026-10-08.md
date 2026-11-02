# Gelen evrak ve T-MAXX belge kurtarma — 8 Ekim 2026

Yerelde geliştirildi; canlıya dağıtılmadı. Gerçek T-MAXX'e deneme belgesi gönderilmedi. Gerçek yükleme/kurtarma kabulü bekliyor; taklit ERP testleri bunun yerine geçmez.

## Gelen belgeler
- Önceki yükleme, okuma, kesin referansla otomatik yerel eşleme ve revizyonda önceki belge seçimi korundu.
- Gelen belgeler tablosunda booking dosyasına bağlanma ve T-MAXX arşiv durumu ayrı gösterilir. Yük bağlantısı yok, aktarılmadı, doğrulama bekliyor, sonuç belirsiz ve doğrulandı durumları bulunur.
- Bağlı T-MAXX yükü olan belgelerde kullanıcı gerçek T-MAXX belge türünü seçerek aktarır. Yerel belge sınıfı otomatik T-MAXX türü kabul edilmez. Yerel otomatik eşleşme tek başına uzak sisteme gönderim başlatmaz.
- Sunucu gelen belge sahibini, bağlı operasyon belgesini, booking kimliğini ve kaynak hash/boyutunu doğrular; tarayıcıdan hedef belge/yük kimliği kabul etmez. Aktarım mevcut ortak `syncBookingDocument` günlüğünden geçer; sahiplik, pilot engeli, hedef/tür kontrolü ve mükerrer koruması korunur.

## Yeniden göndermeden kontrol
Gelen belgelerde ve booking belge arşivinde “Yeniden göndermeden arşivi kontrol et” işlemi eklendi. T-MAXX tarafında yalnız GET kullanır; yeni dosya veya arşiv kaydı oluşturmaz.

Başarı için aynı yükte tam CBI aktarım işareti (yerel belge kimliği, sürüm, SHA-256), doğru T-MAXX türü, dosya adı/boyutu, varsa önceki başarılı yükleme referansı ve arşiv kimliği gerekir. Dosya T-MAXX'ten indirilir, kaynakla birebir içerik özeti karşılaştırılır; son olarak arşiv kaydı yeniden okunur. Birden fazla aday, değişmiş kaynak, farklı içerik veya değişmiş yük ilişkisinde doğrulama yapılmaz.

Doğrulama ve kanıt `reconcile` adımı olarak yerel günlükte atomik kaydedilir; eski belirsiz upload/link adımları silinmez. Aktif gönderimlerle yarışmamak için `sending` adımları ilk beş dakika kurtarmaya kapalıdır. Paralel kurtarma tek kanıta yakınsar. Belirsiz gönderim için arayüzde yeniden gönderim kapalıdır; sunucudaki mevcut günlük koruması da geçerlidir.

Arşiv kaydı oluşmamış, yalnız dosya deposuna ulaşmış ve yanıtı kaybolmuş upload otomatik çözülemez. Kanıt bulunamaması “hiç gönderilmedi” anlamına gelmez. Böyle bir durumda T-MAXX arşivinin kontrolü gerekir; otomatik silme, yeni upload veya tahmini eşleme yapılmaz.

## Kontroller
- 426 test geçti. Yeni 15 test kurtarma kanıtı, kayıp upload/link yanıtı, eksik/çoklu arşiv, yanlış hedef/tür/referans/kimlik, içerik ve kaynak değişimi, okuma sırasında değişim, sahiplik, aktif gönderim, paralel kurtarma ve gelen evrak hedefinin bütünlüğünü kapsıyor.
- TypeScript, değişen dosyaların ESLint kontrolü ve üretim derlemesi başarılı. Önceki genel lint sorunları bu kapsamda değiştirilmedi.
- Yerel giriş/çıkış, otomatik platform bağlantısı, mevcut konşimento/booking listeleri, T-MAXX kayıt formu ve gelen belge listesi HTTP 200.
- Gerçek mevcut pilot belge arayüzde “Devre bağlandı” ve ayrı olarak “T-MAXX yükü bağlı değil” gösteriyor. Gerçek aktarılmış kayıt bulunmadığından tarayıcıda başarılı kurtarma kabulü yapılmadı; yazma/kurtarma senaryoları taklit ERP ile doğrulandı.
- Yeni migration yok. Kontroller öncesindeki 46 iş tablosunun tüm satırları aynı kaldı; oturum tabloları karşılaştırma dışında. Öncesi `.private/tmaxx-inbox-2026-10-08/before-smoke.sqlite`, kanıtlar aynı klasörde. Ekran: `output/tmaxx-inbox-2026-10-08/inbox.png`.

Sıradaki entegrasyon: takvim ve saha operasyonu alanlarını T-MAXX'teki doğru tarih, görev ve olay kayıtlarına eşlemek. 24/4 saat uyarıları korunacak. Bu geliştirme bütün sayfaların T-MAXX entegrasyonunun tamamlandığı anlamına gelmez.
