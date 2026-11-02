# VGM ve Pre-alert bağımsız girişleri — 16 Ekim 2026

## Kullanıcı akışı

- Menü → VGM → Yeni VGM oluştur: armatör booking numarası, konteyner numarası, VGM (kg), imzalayan yetkili. Tartım yöntemi ve sertifika ek bilgiler altında isteğe bağlıdır. Armatör ek alan isterse ön kontrol durur; alanlar tahmin edilmez.
- Menü → Pre-alert → Yeni Pre-alert oluştur: önce tek PDF seç; belgedeki konşimento numaralarıyla T-MAXX pozisyonu otomatik bulunur ve düzenlenebilir alana yazılır. Kullanıcı pozisyonu değiştirebilir veya mevcut değeri kabul edip “PDF kaydet ve otomatik aktar” düğmesiyle kaydı onaylar. Belge PRA türüyle pozisyonun dijital arşivine kaydedilir; kaydın hedefi, türü, dosya kimliği ve indirilen PDF hash'i doğrulanır.
- Yeni işlemler booking_handovers kaydı oluşturmaz; booking devir formu, OCR veya yük/saha bilgileri istemez.
- Liste sayfaları platformdan oluşturulan kayıtları ve son 30 günlük ilgili kaynak geçmişini gösterir. Önceki booking bazlı ayrıntılı süreçler korunmuştur.

## Uyumluluk ve güvenlik

0024_standalone_documents.sql mevcut CMA job satırlarını birebir koruyarak booking_id alanını nullable yapar. Null booking bağımsız/manual kaynaktır; eski onaylı job'larda exportVgm kaynak doğrulaması aynen devam eder. Manual payload immutable hash ile tekrar kontrol edilir. İki yol aynı booking/konteyner çakışma korumasını kullanır. Hazırlama gerçek gönderime yetki vermez.

Pre-alert dosyaları ve aktarım adımları ayrı tablolardadır. Aynı kullanıcı/pozisyon/PDF hash'i için tek kayıt vardır. Belirsiz upload/link yanıtı otomatik tekrarlanmaz. Yerel PDF korunur. Tamamlanan adımlar tekrar yazılmadan doğrulanabilir. Belirsiz uzaktaki sonucu arşivden eşleştirme bu yeni yolda otomatik değildir; durum kullanıcıya açıkça bildirilir.

CMA_SUBMISSION_ENABLED değiştirilmedi. Armatör gönderimi kapalı kalır; gerçek bağlantı ve uçtan uca gönderim henüz doğrulanmış değildir. Kurulu uzantı dosyasındaki isteğe bağlı yöntem desteği güncellendi; Chrome Reload sonrası yüklenir. Yeni yetki eklenmedi.

## Doğrulama

- 116 odaklı test geçti: yeni bağımsız VGM/Pre-alert; mevcut OCR/onay, HBL arşiv hedefleri, booking T-MAXX, konşimento alan kuralları, INTTRA mapping/preflight ve hesap izolasyonu.
- TypeScript, kapsamlı dosyalar için lint ve üretim derlemesi geçti.
- Yerel API: oturumsuz erişim 401; giriş/çıkış 200; yeni listeler, booking ve operasyon okuma 200; yabancı origin 403; geçersiz veri 422.
- Yerel gerçek bağlantı kontrolü T-MAXX ve INTTRA için connected=true döndü. Altı mevcut yerel konşimento kaydı içerikleriyle aynı kaldı.
- Tarayıcıda kısa formlar, boş listeler ve hizalar izole UI fixture oturumuyla kontrol edildi; fixture kaldırıldı. Bu, gerçek armatör/T-MAXX yazma testi değildir. Gerçek oturum/API kontrolleri ayrıca yukarıdaki şekilde yapıldı.
- İki mevcut yerel D1 dosyası yedeklendi, 0023/0024 uygulandı; önceki tablo satır sayıları aynı, foreign_key_check temiz. Yedekler özel ve git dışında.
- Gerçek VGM/Pre-alert/konşimento gönderilmedi. Canlı D1 ve canlı uygulama bu çalışmada değiştirilmedi. Canlı yayın öncesi yedek + 0024 migration gerekir; 0023 zaten canlıda uygulanmıştır.


## Canlı yayın — 16 Ekim 2026

Kullanıcının “canlıya al” talimatıyla yayınlandı. Sürüm: `88a79f04-490c-4fff-961f-8efcfb13eb3c`.

Canlı D1 SQL yedeği özel klasöre alındı. Yedekten oluşturulan kontrol veritabanında 0024 migration uygulandı; tüm eski tablo satırları birebir aynı kaldı ve foreign key kontrolü temiz çıktı. Ardından canlıya yalnız 0024 uygulandı, uygulama yayınlandı. Önceki uygulama sürümü `e258d75a-72ec-4b30-8f6b-194581b706ad`; nullable booking_id eski kodla uyumludur. Veri geri yüklemesi gerektiğinde yedek kullanılabilir; yayın sonrası eklenen iş kayıtları korunmadan yedek geri yüklenmemelidir.

Canlı doğrulamalar: yeni dört sayfa ve /bills 200; VGM/Pre-alert, booking, operasyon, bağlantı kartları, T-MAXX arşiv ve INTTRA geçmiş API'leri 200. Giriş/çıkış 200; oturumsuz 401, yabancı kaynak 403, geçersiz veri 422. İki mevcut complete konşimento kimliği/durumu korundu; okuma kontrolleri sırasında içerikleri değişmedi. T-MAXX ve INTTRA connected=true. Gerçek belge gönderimi yapılmadı. CMA gönderim bayrağı ve mevcut bağlantı ayarları değiştirilmedi.


## Mevcut Pre-alert ile eşleştirme

Aynı pozisyonun PRA arşivinde aynı boyuttaki adaylar, doğru entityid/type/sourceType kontrolünden sonra indirilip SHA-256 ile karşılaştırılır. Eşleşirse yalnız platform kaydı mevcut remote_id ile synced yapılır; T-MAXX upload/link POST çağrıları çalışmaz. Dosya adı farklı olsa da içerik aynıysa eşleşir. Başka yükün belgeleri veya başka türler aday değildir. Adayın okunamaması yeni gönderimi durdurur. Yeni dosyalarda mevcut upload/link günlüğü korunur.

Canlı doğrulama: Downloads/618.pdf, S.E.26.08.00618 pozisyonunun 451299049 belgesine eşleşti. Yerel kayıt 7775b3cb-cccc-4d51-9c37-5ab2777a4c58. Önce/sonra uzaktaki belge sayısı 1/1; arşiv listesi ve pozisyon sürümü birebir aynı; konşimento kayıtları birebir aynı. Platform PDF indirmesi kaynakla birebir eşleşti. Pre-alert ekranında eşleşme açıklaması ve PDF indir bağlantısı görsel olarak doğrulandı. 82 ilgili test başarılı, TypeScript ve derleme başarılı. Yayın: 4efdd7f8-b52f-4e9b-984d-205e8f390e3b. Şema/hesap/konşimento gönderim kodu değişmedi.

## Yükleme sonrası hızlı başlatma — 23 Ekim 2026

PDF ve D1 aktarım kaydı saklandıktan sonra `PREALERT_WAKEUPS` üretici bağlantısı `cbi-prealert-wakeups` kuyruğuna yalnızca belge kimliği ve bildirim zamanını yazar. `cbi-prealert-scheduler` bu bildirimi en fazla birer mesaj ve tek tüketiciyle alıp mevcut özel uygulama bağlantısından ilgili belgeyi işler. HTTP yanıtından sonra süre sınırı olan bir arka plan işi başlatılmaz; aktarım, kalıcı kuyruk tüketicisinin ömrü boyunca beklenir.

Beş dakikalık cron yedek olarak korunur. Bildirim yazımı başarısız olsa da yükleme başarılı/queued döner; D1 kaydı cron tarafından bulunur. Bildirimin yeniden teslimi dosyayı doğrudan yeniden göndermez: aynı global kilit, kesinti bekleme süresi, upload/link günlüğü ve tam içerik karşılaştırması kullanılır. Tamamlanmış belgeye gelen bildirim salt okuma ile sonlanır; başka bir bekleyen belgeyi çalıştırmaz. Sonucu belirsiz upload/link sadece arşivden eşleştirilir. Bekleyen veya incelemedeki işler kendi bekleme süreleriyle yeniden bildirilir; bildirim denemeleri/retention sınırı dolsa da PDF ve D1 kaydı korunur, cron devam eder.

565 F.pdf ilk otomatik denemesinde 12:22:54.809–12:29:24.028 (Europe/Istanbul) arasında 389.219 saniye sürdü. Kayıtlarda 140.816 saniye cron başlangıcını bekleme, 215.573 saniye cron ile uygulama kuyruğunun başlangıcı arasında, 32.830 saniye aktarım/doğrulama görülüyor. İkinci aralığın alt nedeni eski uygulama telemetrisiyle doğrulanamadı; MongoDB kaynaklı olduğu iddia edilmiyor. Yeni `prealert-queue`, `prealert-dispatch` ve `prealert-transfer` günlükleri bildirim teslimi, uygulamaya geçiş, arşiv yoklaması ve senkronizasyon sürelerini belge içeriği/şifre kaydetmeden ayırır.

Canlı hızlı bildirim kontrolü, zaten tamamlanmış 565 F.pdf için iki bildirimle yapıldı: 3023/3610 ms teslim gecikmesi, 266/157 ms uygulama çağrısı; ikisi de `idle`, tek arşiv kaydı ve deneme sayısı 1 korundu. Bu bir yeni PDF'nin uçtan uca aktarım süresi ölçümü değildir. Mevcut dört Pre-alert satırı, konşimento listesi, 565 pozisyonu/yükleri/arşivi ve indirilen PDF özeti aynı kaldı. T-MAXX/INTTRA bağlantıları, giriş/çıkış ve oturumsuz erişim kontrol edildi. 55 odaklı test, TypeScript, lint ve derleme geçti. Şema, hesap, servis adresi ve T-MAXX dosya gönderim kodu değişmedi.

Yayınlar: uygulama `017d11c0-d473-4425-8cf6-a8deb51ab395`; tüketici/zamanlayıcı `d6966b9a-b768-42b0-9c4f-aed6db1999a1`. Önceki sürümler: uygulama `f7cd4e5f-0034-4292-8f12-bf9d51e08050`, zamanlayıcı `30051fd9-1b6a-4df2-ae4f-913a5732be2b`. Hızlı yolu kapatmak için önce üretici/tüketici kuyruk bağlantılarını kontrollü olarak kaldırıp eski cron'u koruyun; D1/R2 kayıtlarını silmeyin. Kanıt ve yedekler `.private/prealert-fast-2026-10-23/` altında, sürüm kontrolü dışındadır.

## PDF'den pozisyon bulma — 23 Ekim 2026

PDF seçimi pozisyon alanından önce açıktır. Yeni `POST /api/prealert/position`, mevcut belge okuma bağlantısıyla PDF'nin bütün sayfalarındaki açıkça yazılı HBL/MBL veya tam pozisyon referansını okur. Dosya adından pozisyon türetilmez. T-MAXX aramalarının sonuçları gerçek kayıt alanlarıyla karşılaştırılır; bütün kanıtlar tek bir güncel, açık pozisyonda birleşirse alan otomatik doldurulur. Eksik, belirsiz veya çelişkili okumada tahmin yapılmaz; mevcut elle pozisyon seçimi kullanılabilir. İstemcide dosya değişimi veya elle düzenleme, eski okuma sonucunun alanın üzerine yazmasını engeller.

Müşteriden yeni alan istenmez. PDF seçimi yalnız okuma/eşleştirme yapar; arşiv kaydı veya aktarım işi oluşturmaz. Kullanıcı kaydetme düğmesine bastığında mevcut PDF saklama ve otomatik kuyruk akışı çalışır. Önce pozisyonu elle bulup sonra PDF seçme akışı da korunur. Arşive gönderim, kuyruk, mükerrer koruması, zamanlayıcı, şema ve bağlantı ayarları değiştirilmedi.

Canlı tarayıcıda `568.pdf` seçildi; `S.E.26.08.00568` otomatik doldu, alan düzenlenebilir ve kaydetme düğmesi aktif görüldü. Gerçek belgeyle ayrı okuma/eşleştirme ölçümü 8292 ms sürdü: sayfa 1 HBL `1046266`, sayfa 2 MBL `MEDUJE662971`. Bu kontrol yeni PDF aktarım testi değildir; 568.pdf kaydedilmedi ve kullanıcı onayı için formda bırakıldı.

66 odaklı test, TypeScript, lint ve üretim derlemesi başarılı. Yayın sonrası mevcut beş Pre-alert, konşimento kayıtları, 565 pozisyonu/yükleri/arşivi ve indirilen PDF özeti korundu. Giriş/çıkış, oturumsuz erişim ve T-MAXX/INTTRA bağlantıları doğrulandı. Canlı sürüm `8364f5fe-ff09-439a-884c-ff95861a38a4`; önceki uygulama sürümü `017d11c0-d473-4425-8cf6-a8deb51ab395`. Zamanlayıcı sürümü değişmedi. Kanıt ve kaynak yedekleri `.private/prealert-autoposition-2026-10-23/` altında, sürüm kontrolü dışındadır.

## Tamamlanan aktarım bildirimi — 23 Ekim 2026

568.pdf'nin kullanıcı tarafından yapılan canlı denemesinde kayıt 25,07 saniyede otomatik tamamlandı; tek arşiv kopyası, iki sayfanın açılması ve kaynakla birebir içerik doğrulandı. Liste doğru duruma geçerken üst bildirim ilk kaydetme yanıtındaki bekleme metninde kalıyordu. Bildirim artık kaydetme/yeniden kontrol yanıtındaki belge kimliğiyle listede yalnız o kaydın `synced` durumunu izler. Sonraki otomatik liste yenilemesinde başarı metni görünür; mevcut arşivle eşleştirme açıklaması korunur. Yeni dosya seçimi eski bildirim kimliğini temizler.

Değişiklik yalnız `PrealertQuickWorkspace` bildirimindedir. Gerçek bileşen ve mevcut 30 saniyelik yenileme davranışı, dış servislere bağlı olmayan yerel arayüzde kontrol edildi: başka tamamlanmış belge erken başarı göstermedi; ilgili belge tamamlanınca üst mesaj değişti; yeni seçim bildirimi temizledi; mevcut belge eşleştirme metni korundu. TypeScript, dosya lint kontrolü ve üretim derlemesi geçti. Bu düzeltme için yeni gerçek PDF gönderilmedi. Canlı sürüm `da2ff705-da72-4dc6-8e50-ae4a723cf46b`; geri dönüş sürümü `8364f5fe-ff09-439a-884c-ff95861a38a4`. Özel kanıt ve yedekler `.private/prealert-message-2026-10-23/` altındadır.
