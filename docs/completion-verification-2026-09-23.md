# Kalan geliştirmelerin kapanış kontrolü

## Uygulanan değişiklikler

- Aynı konteynerde birden fazla mal satırı: mevcut satırları açıklama/kap/kilo ile eşleme; belirsizlikte formdan açık T-MAXX satır seçimi; ayrı yeni satırlar; aynı satırın iki defa seçilmesini ve başka konteynere bağlanmasını engelleme.
- Yeni satırlar için ayrı işlem anahtarı ve beklenen mevcut satır sayısı kontrolü. Sonucu belirsiz bir istek otomatik tekrar gönderilmez. Çoklu sonuç doğrulamada her satır ayrı eşlenir.
- T-MAXX `seaGoodPack.volume` ve yük `volume` alanları: kaynak m³ değeri varsa aktarılır; yoksa mevcut değer korunur. Yanıt kontrolüne dahil edilir. Önceki hacimsiz işlem planları geriye uyumlu kalır.
- Otomatik kaynak değerlerinin referans ve değer kaydı. Aynı referansta değişmemiş otomatik değerler yenilenir, kullanıcı düzeltmeleri korunur. Referans değişirse yükle ilişkili gemi/liman/booking/HBL/acente/masraf ve satır seçimleri yeniden hazırlanır; kullanıcıya yenileme mesajı gösterilir.
- Eksik alan yönlendirmesi merkezi alan eşlemesi kullanır. HBL sırası, gerçek taraf, konteyner ve mal satırı kapsamı korunur. Masraf düzenleme ve HBL penceresi gerektiğinde açılır. Bilinmeyen sistem hatası rastgele ilk kırmızı alana gönderilmez.
- T-MAXX PDF rapor kimliği: yanlış metabase kullanıcı servisi kaldırıldı; kimlik platformun kendi rapor ekranı gibi giriş yanıtındaki kullanıcıdan alınır. Eski oturum önbelleği gerekiyorsa yenilenir.

## Gerçek platform doğrulamaları

- Canlı uygulama oturumu ve kayıt okuması: HTTP 200.
- T-MAXX oturumu: HTTP 200.
- Mevcut yük 451076449 için sekiz resmi HBL rapor şablonu listelendi.
- Mevcut HBL Draft PDF'si resmi rapor servisinden indirildi: 72.820 bayt, PDF imzası doğrulandı. Yeni HBL/konşimento oluşturulmadı.
- Test PDF'si özel çalışma klasöründe tutulur; kullanıcı kayıt ilişkisi doğrulanmadan herkese açık bir indirme yolu oluşturulmaz.

## Tarayıcı kontrolü

- İkinci mal satırının brüt kilo uyarısı tam olarak ikinci mal satırındaki brüt kilo alanına odaklandı.
- Birinci masraf uyarısı düzenlemeyi açıp birinci masraf satırına odaklandı.
- Gerçek alıcı posta kodu uyarısı HBL penceresini açıp alıcının posta koduna odaklandı.

## Canlı kabul sınırı

Mevcut kayıtlar içinde gönderime hazır gerçek bir Multiple HBL yükü yok. Örnek verilerle çoklu HBL gönderim yapısı ve satır/gerçek taraf ilişkileri test ediliyor; bu, yeni bir gerçek Multiple SI'nin taşıyıcı tarafından kabul edildiği anlamına gelmez. Kullanıcıdan gerçek yük referansı istendi. Gerçek olmayan yük veya eski başarılı kayıt, test amacıyla gönderilmez.

## Yayın sonucu

- 115 otomatik test başarılı; TypeScript hatası yok; üretim derlemesi başarılı.
- Canlı sürüm: `e8cc59f6-706c-41b8-9f41-07c8f0dfdd9a`.
- Yayın sonrasında S.E.26.09.00670 kaydının salt okunur kaynak sorgusu HTTP 200 verdi. Yeni kaynak takibi üretildi, mevcut mal satırı seçeneği döndü, ajenteli/HBL kapsamı doğrulandı.
- Kaynak sorgusu sonucu kullanıcı kaydına kaydedilmedi; yeni SI/HBL gönderilmedi.

## Altı toplantı ekran görüntüsüyle ikinci kontrol

23 Eylül tarihli 11.17.49–11.41.33 ekranları, form bileşenleri ve INTTRA gönderim hazırlayıcısıyla karşılaştırıldı. Bu kontrol yeni bir canlı gönderim değildir.

- MBL tarafları, Forwarder, taşıyıcı, booking ve B/L referansı formda ve gönderim eşlemesinde mevcut.
- Gemi/sefer, yükleme/boşaltma limanı, ayrı taşıma teslim yeri, Move Type ve FCL eşlemesi mevcut.
- ENS Carrier, varış bölgesi ve None/One/Multiple ayrımı mevcut. Görselde Multiple seçili olması bütün yüklere Multiple uygulanacağı anlamına gelmez.
- HBL numarası, çıkış/teslim yeri, ilk/son ülke ve Other ödeme yöntemi mevcut. Yerler ana ENS/HBL bölümünde, gerçek tarafların ayrıntıları açılır pencerede bulunuyor; INTTRA ekranıyla pencere gruplaması birebir aynı değil.
- Gerçek tarafların ad, sokak, bina numarası, şehir, bölge, ülke ve posta kodu alanları gönderim eşlemesinde mevcut. Görsellerdeki çelişkili adres/posta kodları doğrulanmış kaynak sayılmadı.
- Konteyner, ambalaj/kap, brüt ağırlık, açıklama, altı haneli HS/NCM/Marks eşlemesi mevcut. Tam HS ve net ağırlık açıklamada korunuyor.
- Örnek görsellerdeki HBL 1046274, booking EBKG18549431, eski B/L MEDUJX315701 ve örnek miktarlar mevcut yükün üzerine yazılmadı.
- HBL teslim yeri CORONEL ile taşıma boşaltma limanı SAN ANTONIO ayrı alanlardır; birbirine zorla eşitlenmedi.

İşaretli alanlar arasında eksik bir veri eşlemesi bulunmadı. Bu sonuç, her modalın INTTRA ile aynı tasarıma sahip olduğu veya gerçek Multiple HBL kabulünün tamamlandığı iddiası değildir.
