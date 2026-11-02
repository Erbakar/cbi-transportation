# Çoklu talimat toplamları — 27 Ekim 2026

## Canlı kayıtta bulunan neden

`37f32df0-acae-48f5-b5d9-79ab1e9dcd30` kaydında iki konteynerin kap ve
ağırlıkları kaynaklı satırlarda doluydu. `KNS TAL (2).pdf` yüklemede
`mbl-parties` olarak işaretlenmişti. Ana okuma bu dosyanın yük satırlarını da
döndürmüş, bağımsız sayfa kontrolü ise belge rolüne uygun olarak bu dosyayı
hariç tutmuştu. Eksik kapsam kontrolü üç toplamı boşaltıyor, ardından iki
zorunlu alan uyarısı daha ekleniyordu. Bu kayıtta sayfanın atlanması rastgele
model davranışı değil, belge rolünün sonucuydu.

İki dosyanın da mevcut yükün müşteri talimatı olduğu görünen PDF içerikleriyle
doğrulandı. İkinci dosyanın kullanım rolü, yalnız bu kayıt ve belge kimliğinde,
kilit ve aktarım kontrolleri altında düzeltildi. Dosyalar, kayıt kimliği,
yükleme kimliği/hash, sürüm ve manuel girişler korundu. Önceki ham kayıt ve
belge metaverisi özel dizinde yedeklendi.

## Uygulama değişikliği

- Toplam kontrolü, sayfa gözlemlerinin eksik kaldığı kapsamı kaynaklı
  konteyner satırlarından ve konteynerin tek, açıkça bağlı yük satırından
  tamamlayabilir. Belge adı, sayfa, alıntı, konteyner bağı ve okuma kesinliği
  zorunludur. Birden fazla ürün satırı otomatik olarak konteyner toplamı
  sayılmaz.
- MBL taraf/adres referansları, master/şüpheli gözlemler, belirsiz bağlar ve
  gerçek çelişkiler bu tamamlamayla geçerli hale getirilmez. Çakışan kapsamlar
  engellenir; aynı toplam iki kez sayılmaz.
- Yalnız kanıtla çözülen kapsam uyarısı kaldırılır. Diğer belge uyarıları ve
  kullanıcı girişleri korunur.
- Yeni okumalar sürüm 9 kullanır. Sürüm 8 kayıtları normal kontrol sırasında
  mevcut kaynak verisiyle tamamlanır; belgeler yeniden modele gönderilmez.
- Yükleme açıklaması, birden fazla dosyanın müşteri talimatı seçilebileceğini
  ve MBL referansının miktarlarının toplama katılmadığını açıklar.

## Doğrulama

633 otomatik test, TypeScript kontrolü ve üretim derlemesi başarılı.
Ek kontroller eksik kaynak, düşük kesinlik, farklı sayfa, aynı adlı belgeler,
MBL referansı, master/unknown kapsam, gerçek sayı çelişkisi, grup toplamları,
tekrarlı satırlar ve aktarım yapmadan eski kaydın düzeltilmesini kapsıyor.

Gerçek kayıt üzerinde kontrol ve tarayıcı doğrulaması:

- Kap: 744 + 771 = 1.515.
- Brüt: 23.320 + 22.450 = 45.770 kg.
- Net: 22.893,36 + 21.979,98 = 44.873,34 kg.
- Yedi uyarıdan yanlış beşi kalktı; iki HBL'nin gönderen posta kodu uyarıları
  kaldı. Posta kodu alanlarına müdahale edilmedi.
- Booking `EBKG19125349`, MBL `MEDUJX351995` ve HBL/konteyner eşleşmeleri
  `1046445` / `MSNU8644653`, `1046446` / `MSMU5684659` korundu.
- Diğer üç kayıt, manuel alanlar, bağlantı ayarları ve dağıtım bağlantıları
  korundu. T-MAXX ve INTTRA bağlantıları hazır; giriş/çıkış ve çıkıştan sonra
  korunan veri erişiminin 401 dönmesi doğrulandı.
- T-MAXX ve INTTRA teslimleri hâlâ `waiting`. Platform kaydı oluşturma,
  review/submit veya konşimento gönderimi yapılmadı.

Bu yeni kayıtta ayrıca PDF'nin görünmeyen metninden gelen fazladan ürün/HS
satırları vardı. İki PDF'nin render edilmiş görüntüleri yeniden incelendi;
bu kaydın kaynak açıklamaları ve HS alanları görünen içerikle düzeltildi.
Manuel değişiklikler korunarak koşullu güncelleme uygulandı. Bu veri
düzeltmesi, görünmeyen PDF metninin genel okuma sorununu çözmüş sayılmaz;
yeni yüklemelerde o ayrı konu için görsel kaynak kontrolü hâlâ önemlidir.

## Dağıtım ve geri dönüş

- Önceki sürüm: `86519332-029a-4719-b273-d570cdc3a60b`.
- Yeni sürüm: `4730ba9f-b4de-4055-852b-66d1e01090aa`.
- Önceki 237 modül canlı kaynaktan alındı; yerel önceki derlemeyle tamamı
  eşleşti. Mevcut ortam ayarları korunarak dağıtıldı.
- Kaynak öncesi kopyalar, canlı kayıt/metaveri yedekleri, sınırlı düzeltme
  betikleri ve kontrol sonuçları `.private/document-totals-fix-2026-10-27/`
  içinde, sürüm kontrolü dışında tutuldu. Veri yapısı değişmedi.
