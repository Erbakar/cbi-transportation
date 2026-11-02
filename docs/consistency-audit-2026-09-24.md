# İş kuralı tutarlılık kontrolü — 24 Eylül 2026

Kapsam: son mantık katmanı değişikliklerinin mevcut oluşturma, düzeltme ve sonuç doğrulama akışlarıyla kod ve regresyon testleri üzerinden karşılaştırılması. Bu incelemede gerçek platform kayıtlarına yazılmadı ve yeni konşimento gönderilmedi.

## Bulunan ve giderilen çelişkiler

- T-MAXX düzeltme ekranı kanonik sayıları eşit kabul ederken ilk kaydetme yanıtı ve yeniden doğrulama katı tür karşılaştırması yapıyordu. Aynı ortak karşılaştırıcı kullanılıyor; örneğin 3 ve 3.00 eşit, gerçek miktar farkı eşit değil.
- Sonuç doğrulama, kullanıcı tarafından onaylanmış HBL düzeltmesine rağmen eski çıkarım metninden yeniden beklenti üretiyordu. Mevcut HBL için son onaylı plan esas alınıyor; yeni HBL adımı için belge çıkarımı yedeği korunuyor.
- Düzeltme ekranında mal satırı değişikliği otomatik HBL açıklamasına yansımayabiliyordu. Yalnız eski mal satırlarıyla birebir eşleşen otomatik HBL metni güncelleniyor. Kullanıcıya özel metin korunuyor. Otomatik net ağırlık satırı da aynı şekilde güncelleniyor.
- Sonucu belirsiz aktarım, kayıt kilidi aşamasında durmasına rağmen ön hazırlık servislerini çağırabiliyordu. Artık unknown/sending sonucu olan aktarım hazırlık başlamadan duruyor; mevcut kaydı doğrulama/düzeltme yolu kullanılmalı.

## Korunan kurallar ve regresyon kapsamı

- Acente yoksa yalnız MBL; acente varsa MBL/HBL taraf ayrımı.
- Notify varsayılanı ve açık kullanıcı düzeltmelerinin korunması.
- PP/CC ve kapı teslim masraf dağılımları.
- SWB: 1 navlunsuz; Original: 3 navlunsuz orijinal ve 3 navlunsuz kopya; navlun basılmaz.
- ENS armatör; tek/çoklu HBL eşleştirmesi ve konteynerlerin doğru yükte tutulması.
- Konteyner/ambalaj seçenekleri, Türkçe karakter dönüşümü, kaynak yenilemede manuel değerlerin korunması.
- HS kodlarının açıklamaya taşınması, net ağırlık ve toplam hesapları.
- Daha önce oluşturulan platformun tekrar gönderilmemesi; belirsiz sonuçta otomatik tekrar yapılmaması.

Doğrulama: 138 test geçti. TypeScript kontrolü, üretim derlemesi ve git diff boşluk kontrolü geçti. Canlı platformların nihai kaydetme işlemleri bu incelemenin parçası olarak tekrarlanmadı.

## Devam eden dış bağımlılık

S.E.26.09.00670 için BCM / Booking Confirmation belgesinin doğru yükün dijital arşivine bağlanması hâlâ gerekli. Bu zorunluluk yazılımla atlanmadı; T-MAXX tamamlandı olarak işaretlenmedi.

## Onaylı INTTRA karakter revizyonu

Kullanıcının açık final gönderim onayıyla 548509629 asıl SI kaydının dört Actual Shipper alanı Latin harflere düzeltildi. INTTRA revizyon referansı 548523096 döndürdü. Gönderimden sonra resmi view üzerinden yeniden okunarak originalSiId=548509629 ve 72 düzenlenebilir alanın onaylı önizlemeyle aynı olduğu doğrulandı; bu alanlarda ¿ veya replacement character kalmadı. T-MAXX değişmedi. Taşıyıcı revizyon kabulü ayrıca takip edilir.

Revizyon sırasında INTTRA amend yanıtının text/plain / ISO-8859-1 JSON döndürdüğü saptandı; sadece amend için bu yanıt biçimi desteklendi. Metin revizyonlarında boş hacim/toplam alanlarının gereksiz değiştirilmesi kaldırıldı. 141 test ve üretim derlemesi geçti. Canlı uygulama sürümü d2f23a30-621d-4860-b1b3-1150b33ea110; yerel relay yeniden başlatıldı.

## Revizyon sonrası PDF indirme

INTTRA resmi baskı şablonu originalSiId ve SiSequence gösteriyor. İndirme kontrolü ise son SiId'nin baskı metninde bulunmasını beklediği için revizyondan sonra zaman aşımına düşüyordu. API yanıtında son SiId doğrulaması korundu; baskı hazır olma kontrolü doğrulanmış originalSiId ile yapılıyor. 511 oturum yanıtı da yenileme kapsamına alındı. Beş belge testi geçti. Canlı relay yeniden başlatıldı; uygulamanın gerçek indirme uç noktası HTTP 200 ve 250295 bayt PDF döndürdü. Üç sayfalı çıktı asıl SI 548509629 / Version 2.0 ve düzeltilmiş FIRAT alanlarını içeriyor; bozuk karakter kalmadı. Yeni SI veya revizyon gönderilmedi.

## Booking Confirmation yükleme — 24 Eylül

Kullanıcının Global_Booking_Confirmation_EBKG18686156.pdf belgesinde booking EBKG18686156 ve MBL MEDUJX324083 doğrulandı. Kullanıcının talebiyle uygulamaya T-MAXX yüküne özel PDF yükleme bölümü eklendi. Hedef yük kayıt planından doğrulanır; BCM türü katalogdan tekil seçilir; sahiplik, oturum, kayıt kilidi, dosya türü/boyutu ve işlem günlüğü kontrolleri uygulanır. Ham PDF byte aktarımı için T-MAXX TCP transport multipart body desteği eklendi. Başarılı dosya yüklemesinden sonra resmi doc kayıt servisiyle arşiv bağlantısı oluşturulur ve okunarak doğrulanır.

Canlı tarayıcıda YK.S.E.26.09.00801 / goodId451136513 seçildi; dosya yerel dosya seçicisinden seçilerek yükleme butonuna basıldı. bcm-upload adımı sonucu unknown. Belge bağlantısı/create-doc aşamasına geçilmedi. Yeniden yükleme yapılmadı. Salt okunur dosya deposu sorgusu 502 Proxy Error, doc arşiv sorgusu iki kez 503 Service Unavailable döndürdü. Dolayısıyla yükleme veya HBL tamamlandı olarak doğrulanamaz. INTTRA 548523096 değişmedi.

143 testlik tam paket + 2 yeni upload yetki/PDF testleri geçti; TypeScript ve üretim derlemesi geçti. Tarayıcıda hedef booking ve doğru dosya adı doğrulandı. Servis normale döndüğünde önce dosya deposundaki olası kayıt okunmalı; unknown adım körlemesine sıfırlanmamalı.
