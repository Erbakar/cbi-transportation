# Faz 2 — KAPANDI · 7 Ekim 2026

Yerel geliştirme ve gönderimsiz kabul kapsamı tamamlandı. Üretime dağıtım ve gerçek platform gönderimi bu kapanışın kapsamında değildir.

## Tamamlanan uygulama

- Gelen belgeler için ayrı yükleme/okuma/eşleme ekranı. Booking, teklif ve satış referansları kaynak kanıtlarıyla değerlendirilir; tek ve güçlü teyit eşleşmesi otomatik bağlanır. Belirsiz/çelişkili sonuçlar gerekçeli manuel seçim ister. Taşıyıcı adı tek başına yeterli değildir.
- Talep, teyit alındı ve revizyon alındı durumları güncel okunan belgelere dayanır; operasyon onayı veya gönderim anlamına gelmez. Revizyon için önceki belge açıkça seçilir.
- Teklif fiyatları, dövizleri, birim esasları ve koşullar için yapılandırılmış okuma. CMA ara toplamları maliyet satırı olarak ikinci kez eklenmez. Koşullarda kaynak alıntısı gösterilir; AI yorumu operasyon teyidinin yerine geçmez.
- Seçilen beklenen maliyetler, miktarlar, kaynak belge/okuma, kullanıcı kontrol gerekçesi ve sürüm geçmişi kalıcı tutulur. Kur/vergi varsayılmaz. Kaynak değişirse eski maliyet uyarılır. Eşzamanlı değişiklikler sürüm kontrolleriyle korunur.
- T-MAXX aktif denizyolu masraf türleri salt okunur canlı katalogdan seçilir. 384 tanım içinden 194 aktif denizyolu tanımı görüntülendi. Kaydetme sırasında kimlik ve ad tekrar doğrulanır. Eşleme hedefi invoiceItemType'dır; tarife fiyatı, tedarikçi, vergi veya tarih koşulları uygulanmaz. T-MAXX maliyet kaydı oluşturulmaz.
- Eski belgeler yeniden okunabilir; başarılı önceki okuma arşivlenir. Yeniden okuma başarısızsa son başarılı sonuç korunur. Önceki teyit/revizyon fark raporu korunur.
- Gelen belge indirmede hesap sahipliği ve dosya özeti kontrol edilir. Büyük istek sınırları, kaynak bütünlüğü ve tekrar gönderim kontrolleri uygulanır.
- Yerel INTTRA tüneli değişen adresini yerel yapılandırmaya bağımsız ve atomik yazar. Sağlık kontrolü ve DNS bekleme süresi eklendi; hesaplar/anahtarlar korunur.

## Doğrulama

- Başlangıç 207 test; son koşu 223/223 başarılı.
- TypeScript, lint ve üretim derlemesi başarılı. Bunlar tek başına platform bağlantısı kanıtı sayılmadı.
- Gerçek süreç PDF'sinin teklif (2–3), booking talebi (4) ve teyit (6) sayfalarıyla yerel kabul yapıldı. Kaynak içerikleri değiştirilmedi.
- Talep teyit olarak işaretlenmedi; ISB2061067 teyidi doğru yerel devre otomatik bağlandı.
- Teklifin yedi detay maliyet satırı ayrı para birimleriyle kaydedildi ve yeniden açıldı. Navlun canlı T-MAXX 181693609 tanımıyla eşlendi; sürüm 2 kaydedildi. Diğer altı kalemin seçimi operasyon teyidine bırakıldı.
- Yeniden okuma geçmişi ve hata sonrası son başarılı sonuca dönüş kontrol edildi.
- Çıkış ve mevcut hesapla yeniden giriş yapıldı. Giriş ekranında sol menü yok. Giriş sonrası T-MAXX ve INTTRA otomatik olarak Aktif oldu; yeni tünelin sağlık kontrolü HTTP 200.
- Konşimentolar listesi ve ayrı yeni konşimento ekranı doğrulandı; booking listesi/yeni kayıt ayrımı korundu.
- Başlangıç yedeği ile mevcut records tablosu karşılaştırıldı: 5 kaydın tamamı birebir aynı.
- İnceleme için yalnız yerel FAZ2-KABUL-20261007 örnek devri bırakıldı. Gerçek operasyon kaydı değildir, dış platformlara gönderilmemiştir.

## Kabul kapsamı ve doğrulama sınırları

- S.E.26.09.00670 için toplam yük kullanımı, ağırlık, posta kodu ve mühür sahibi kullanıcı tarafından teyit edildi. Son kontrol ready / sıfır eksik bilgi ile tamamlandı; ayrıntılar aşağıdadır.
- Gerçek booking revizyonu çifti bulunamadı. Elde bulunan iki MSC PDF aynı özete sahip; farklı revizyon sayılmadı. Revizyon eşlemesi/farkları otomatik testlerle doğrulandı; gerçek revizyon çiftiyle uçtan uca kabul açık.
- T-MAXX/INTTRA gerçek gönderimi yapılmadı. Fiyat/masraf türü seçimi ve teklifin ticari geçerliliği operasyon kontrolü gerektirir.
- Değişiklikler yalnız yerelde. Üretime dağıtım veya üretim veritabanı geçişi yapılmadı. Tünelin mevcut üretim secret güncelleme sorunu bu yerel doğrulamayla çözülmüş sayılmaz.

## Geri dönüş ve kaynaklar

Yeni şema: drizzle/0010_booking_phase2.sql; yalnız yerel veritabanına uygulandı. Değişiklik öncesi veritabanı ve gizli yapılandırma yedekleri .private/phase2-backups-2026-10-07 altında erişimi kısıtlı tutulur. Tanılama çıktıları ve ekran görüntüsü output/phase2-completion-2026-10-07 altında; bu dizinler sürüm kontrolünden hariçtir. Başka çalışmaları silmemek için tüm veritabanını eski yedeğe döndürmeyin.

## Son kullanıcı teyitleri ve kapanış kontrolü

Kullanıcı 23.110 kg toplam brüt ağırlığı, MBL alıcısı için 8820000 posta kodunu ve ürün bazında paket/kilo dağılımı kullanılmadığını teyit etti. Bu bilgiler S.E.26.09.00670 kaydına işlendi; MBL notify aynı acente/adres olduğu için posta kodu ona da eklendi. HBL alıcısının kaynakta bulunan 8840167 posta kodu korundu.

Tek konteyner için açıkça seçilen “talimattaki toplamları tek yük satırında kullan” seçeneği eklendi. Ürün açıklamaları ve tam HS kodları korunur; 788 paket, 23110 kg brüt, 22636.8 kg net yalnız bir kez kullanılır. Ürün bazında miktarları bulunan diğer kayıtların varsayılanı değişmedi. Çok konteynerli veya bağlantısı belirsiz yükler bu seçenekle otomatik birleştirilmez.

Kaydın eski okuması yeniden kontrol sırasında güncellendi. Yeni AI çıktısında görünen ek PVC PROFILE ve 401693002200 girdileri kaynak PDF'nin görünür sayfasında yoktu; kaynak hash eşleşmesi ve görsel inceleme sonrası manuel düzeltmelerle dışarıda bırakıldı. Özgün okuma ve değişiklik öncesi veritabanı .private/phase2-close-2026-10-07 altında korunur. Gerçek iki ürün ve ORDER NO: 1293 muhafaza edildi. Adres alanları mevcut talimat/booking kaynağıyla tamamlandı.

Son otomatik test: 226/226 başarılı. TypeScript ve üretim derlemesi başarılı. Değişen dosyalarda lint hatası yok; manual-instructions.tsx içindeki önceden bulunan useEffect dependency uyarısı sürüyor. Diğer dört records satırı, deliveries ve platform_steps tabloları başlangıç yedeğiyle aynı. T-MAXX ve INTTRA yerel arayüzde Aktif.

## Son kontrol ve kapanış

7 Ekim 2026: Kullanıcı EU32004869 mühürünün armatör MSC tarafından verildiğini teyit etti. S.E.26.09.00670 kaydında mühür sahibi arayüzden Taşıyıcı (sealType=1) seçilerek “Kaydet ve kontrol et” çalıştırıldı. İşlem normal uygulama akışında T-MAXX kaynak kontrolü ve canlı INTTRA alan ön kontrolünden geçti. Son durum **ready / Aktarıma hazır**, issues=[]; işlem kilidi bırakıldı. Dış platformlara aktarım başlatılmadı.

Son test koşusu 226/226 başarılı, sıfır başarısız ve sıfır atlanan test. Bu kapanışta uygulama kodu değiştirilmedi; önceki TypeScript/derleme sonuçları yukarıda kayıtlıdır. Yeni yedekle karşılaştırmada diğer dört kayıt, deliveries ve platform_steps tabloları birebir aynı. Hedef kayıtta yalnız manual, status, issues ve updated_at değişti. Yedek ve karşılaştırma kanıtı .private/phase2-final-2026-10-07 altında korunur.

**Faz 2 yerel geliştirme ve gönderimsiz kabul kapsamında KAPANDI.** Gerçek revizyon çifti bulunmadığı için o senaryo otomatik testlerle doğrulandı; gerçek çiftle saha kontrolü ilk uygun belgede yapılacak takip maddesidir. Üretime dağıtım, üretim tüneli ayarı ve gerçek HBL/MBL gönderimi bu yerel kapanışla yapılmış sayılmaz.

## Canlı yayın — 7 Ekim 2026, 20:04 Türkiye saati

Kullanıcının “canlıya al” talimatıyla Cloudflare ortamına yayınlandı: https://cbi-transportation.kadirerbakar.workers.dev
Sürüm: d3641793-44fe-4941-9017-bc57f4eb98d6 (trafik %100).

- Üretimde eksik olan 0006–0010 migration'ları önce yedek üzerinde denendi, sonra canlıya uygulandı. TypeScript kontrolü ve yayın derlemesi başarılı.
- Önceki sürüm listesi, ayar envanteri ve tam SQL yedeği .private/phase2-production-2026-10-07 altında tutulur. Eski kod sürümü 22026c2d-640f-4fb0-b460-e9fca4cfdf5b; yayın öncesi tünel adresi aynı yetkilerle otomatik yenilendi. Eski kodla geri dönüşte güncel tünel ayarı korunmalıdır; mevcut veritabanının tümünü yedekle değiştirmek güvenli varsayılmaz.
- Yayın sonrasında 8 records, 16 deliveries, 24 platform_steps, 14 record_documents, 10 revisions ve 2 platform_credentials satırı yedekle birebir aynı. Yerel pilot/test kayıtları canlıya kopyalanmadı; canlı hesapta görünen kayıt listesi 2 kayıt döndürdü.
- Mevcut hesapla giriş ve çıkış 200; çıkış sonrasında oturum null. Records, bookings ve booking inbox API kontrolleri 200.
- T-MAXX ve INTTRA mevcut kayıtlı hesaplarla bağlantı kontrolünü geçti. INTTRA tüneli mevcut bilgisayara bağımlı olmaya devam eder.
- Tarayıcıda giriş ekranında menü yok; giriş sonrası ana sayfa, booking listesi ve ayrı yeni booking formu doğrulandı.
- Gerçek konşimento gönderimi, maliyet kaydı veya test amaçlı canlı booking oluşturulmadı.
- Canlı konşimento listesi ve ayrı yeni konşimento ekranı da tarayıcıda doğrulandı; her ikisinde T-MAXX/INTTRA Aktif. Önceden tamamlanmış iki işlem ve platform referansları korunuyor. Yerelde teyit edilen pilot verileri, aynı referanslı tamamlanmış canlı işlem üzerine yazılmadı.
