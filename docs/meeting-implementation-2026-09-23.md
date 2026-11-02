# 23 Eylül toplantısı — uygulama ve doğrulama

Bu geliştirme 23 Eylül 2026 tarihinde kullanıcı onayıyla Cloudflare canlı sitesine yayınlandı. Sürüm: fbc71403-13eb-4157-8693-d8b87b0e4ffc. Canlı giriş ekranı tarayıcıda kontrol edildi. Yeni SI/HBL gönderimi yapılmadı.

## Uygulananlar

- Geniş inceleme formu, INTTRA sıralı bölüm bağlantıları, görünür otomatik değerler, ayrı MBL ve gerçek HBL tarafları.
- Pozisyon referansını kopyalama; mevcut zorunlu referans penceresi ve referansla arama korunmuştur.
- Mevcut T-MAXX yüklerini konteyner kimliğiyle eşleştirme; None / One / Multiple kapsamı. Konteyner sayısı tek başına HBL sayısını belirlemez.
- Çoklu HBL başına numara, taraf düzeltmeleri, konteynerler, ayrı işlem günlüğü ve belge sonucu. Operatör numara girer; numara üretilmez.
- Taşıma Destination ile HBL Final Delivery ayrı tutulur. MSC kaynak eşleştirmesi, bölge önerisi, ENS Carrier, Payment Other, bildirim adresleri.
- Ajenteli/ajentesiz taraflar, notify fallback, PP-port / PP-door / CC altı masraf kuralı korunmuştur.
- SWB bir navlunsuz belge; Original 3 + 3; SWB'de Non-Negotiable görünmez/gönderilmez. Kullanıcı seçimi formda anında adetlere yansır.
- Kaynakta bulunan REF / VES.NO / PO, tam HS kodları ve net kilo mal açıklamasında korunur. INTTRA HS/NCM/Marks varsayılanı ilgili kodun ilk altı rakamıdır; açık kullanıcı düzeltmeleri korunur. Hacim varsa taşınır.
- Eksik alan işaretleri ve listeden alana geçiş; HBL adres penceresi otomatik açılır, ilgili taraf odaklanır. Odak çerçevesi içtedir.
- T-MAXX HBL PDF için mevcut rapor şablonlarını listeleyen ve yalnız kayıtla ilişkili mevcut HBL'yi indiren yol. Yeni waybill oluşturma çağrısı içermez.
- Belirsiz çoklu T-MAXX sonucunda her yükün kayıt değerleri ve HBL tarafları okunarak doğrulanır; yalnız referans bulundu diye tamamlandı sayılmaz. Başarılı alt sonuçlar korunur.

## Servis eşleştirmeleri

| Konu | Uygulanan karşılık |
|---|---|
| Multiple HBL | Shipment HouseBillIndicator=2 + ConsolidatedShipment SIAttr; mal kalemi başına HBL referansı ve 19/20/27 gerçek tarafları |
| Transport Destination | Transportation SILocations.Destination, tür 2 |
| HBL Final Delivery | PlaceOfFinalDelivery, tür 16; Multiple'da ilgili mal kalemi konumu |
| Tek / çoklu T-MAXX | Mevcut yük kimliği; ayrı adım ad alanı ve hbl-result kaydı |
| HBL indirme | Mevcut seaGoodWaybill doğrulanır; resmi rapor şablonu seçilir; PDF imzası doğrulanır |

Bu eşleştirmeler eldeki platform formu/kod kayıtlarıyla ve örnek verilerle kontrol edildi. Gerçek platformun yeni Multiple gönderimini kabul ettiği henüz canlı gönderimle doğrulanmadı.

## Kontroller

- Otomatik testler: belge ayrıştırma, kaynak seçimi, taraflar, masraflar, belge adetleri, çoklu HBL eşleşmesi, referans koruma, indirme ve belirsiz sonuç kontrolleri.
- TypeScript kontrolü ve üretim derlemesi.
- Tarayıcıda masaüstü ve 390 px dar ekran incelemesi; yatay taşma yok.
- Original 3 + 3 → SWB 1 geçişi; Non-Negotiable alanının kapanması.
- Eksik posta kodundan HBL penceresine ve doğru alıcı alanına odaklanma.

## Yayın öncesi / canlı kabul sınırı

Canlıya yayın tamamlandı; 99 otomatik test ve üretim derlemesi geçti. Yeni Multiple SI kabulü ve gerçek T-MAXX rapor şablonundan PDF alma, kullanıcı denemesinde doğrulanmalıdır. INTTRA talimat PDF'si nihai armatör MBL'si olarak sunulmaz.

Kaynakta bulunmayan gerçek HBL numarası, gerekli adres bilgileri, belge düzenleme yeri ve konteyner sahipliği kullanıcı tarafından tamamlanır. Birden fazla yükte boş veya çakışan konteynerler tahminle eşlenmez. Aynı konteynerde T-MAXX'in birden fazla mal satırına yapılacak belirsiz eşleme mevcut korumayla durdurulur. Cevabı kaybolmuş ve henüz bütün alanları doğrulanamayan aktarım otomatik tekrar gönderilmez.
