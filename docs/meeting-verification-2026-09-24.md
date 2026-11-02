# 24 Eylül toplantısı: geliştirme ve doğrulama

Kaynak: https://fathom.video/calls/836067116

42:10 uzunluğundaki toplantının baştan sona konuşma dökümü iki kez incelendi; kullanıcının paylaştığı ekran görüntüleriyle karşılaştırıldı. Video bütünü gerçek zamanlı oynatılarak izlenmedi. Aşağıdaki kapsam toplantıdaki sözlü kararların izlenebilir kontrolüdür.

| Karar | Uygulama ve kontrol |
| --- | --- |
| Konteyner tipi numaranın yanında, üstte seçilebilir olsun | Ana form başlığına seçim yerleştirildi. T-MAXX düzeltmesinde ve INTTRA revizyonunda ayrı seçim var. Kaynak tipi korunuyor. |
| T-MAXX kısaltmaları INTTRA tipleriyle eşleşsin | DC/FT, HC/HQ, OT, FR, RF/RH karşılıkları; INTTRA kayıt kodu 45G0 ile seçim kodu 45G0_0 eşleştirildi. Bilinmeyen/çoklu eşleşme tahmin edilmiyor. |
| Ambalaj seçilebilir olsun | INTTRA ambalaj kataloğu kullanılıyor. Paket/kap/koli → Package, box/boxes → Box, palet → Pallet. Bilgi yoksa Package; açık kullanıcı düzeltmesi korunuyor. |
| Doğru adres bilgilerini otomatik tamamla | Kaynak güveni yüksek adresler; açık şehir/ülke/posta kodu/bina etiketleri; Türkiye il eşlemesi; toplantıda onaylanan Santiago bölge kuralı. Belirsiz şehir ve posta kodu uydurulmuyor. |
| Belge düzenleme yeri İstanbul | Platform kataloğunda tekil ISTANBUL, TURKEY (TRIST) karşılığı aranıyor; doğrulanamazsa alan açık kalıyor. |
| Türkçe karakterler bozulmasın | INTTRA gönderim ve revizyon verilerinde Türkçe harfler Latin karşılıklarına çevriliyor. |
| Mevcut INTTRA talimatı değiştirilebilsin | Resmi amend → review → submit akışı. Orijinal SI ve ShipmentId doğrulaması, parmak izi, kayıt kilidi ve işlem günlüğü mevcut. Kullanıcı kontrol ve onayından sonra final revizyon. |
| Yeni talimat oluşmasın | İlk aktarımda oluşturulmuş platform atlanıyor. Revizyonda originalSiId zorunlu; belirsiz gönderim otomatik tekrarlanmıyor. |
| INTTRA ve T-MAXX ayrıntıları ayrı olsun | Her platform kartında Ayrıntılar / Düzenle. Platforma ait form ve uyarılar gösteriliyor. |
| T-MAXX yalnız doğru değerleri göstersin | Tek değer sütunu; mal satırı bir kez düzenleniyor, konteyner/yük sayısal toplamları hesaplanıyor. Eski sıfırlar hata olarak gösterilmiyor. |
| Uyarı ilgili alana götürsün | Satır/alan hedefleri, genel Ambalaj mesajı, T-MAXX düzeltme bölümü ve seçim alanı odağı düzeltildi. |
| Kapatma düğmesi görünür kalsın | Detay paneli içinde yapışkan kapatma düğmesi. |
| HS kodları/net ağırlık açıklamada kalsın | Önceki Cargo Description düzeni ve tam HS/net ağırlık kuralları korundu; testler geçti. |
| Mühür bilinçli boş bırakılabilsin | Mevcut açık boş bırakma tercihi korundu. |
| Oluşan PDF indirilebilsin | Mevcut INTTRA PDF ve T-MAXX HBL belge yolları korundu. |

## T-MAXX kaydetme bulgusu

Onaylı mevcut konteyner 451136532 (DFSU7796423) için 23110 kg PUT, HTTP 200 ve sürüm 2 döndürdü; yanıt ve yeniden GET hâlâ 0 kg gösterdi. Mal satırı da 0. Bu durum yalnız sayı biçimi farkı değildir. Aktarım sırası mal satırı → konteyner → yük → HBL olarak düzeltildi. Üst kayıtların sürümü ve toplamı değişebileceği için her yazmadan önce güncel kayıt okunur. Kurtarma karşılaştırması kendi önceki adımlarının oluşturduğu beklenen toplam değişikliklerini kabul eder; başka beklenmeyen değişiklikte durur.

Gerçek kaydı tüm doğrulanmış değerlerle tamamlama için kapsamlı onay sorusu bekleniyor. Tamamlandığında her alan yeniden okunarak doğrulanmalı; yalnız başarılı HTTP yanıtı yeterli sayılmıyor.

## INTTRA canlı kontrolü

- Uygulamadaki inspect: HTTP 200, mevcut SI 548509629, 72 düzenlenebilir alan.
- Resmi amend verisi, CreateModifySI kodundaki teknik form alanları ve AmendAction=Amend ile hazırlandı.
- Onaylı review: status OK, originalSiId 548509629, SiSequence 2, aynı ShipmentId. Final submit yapılmadı.
- Rezervasyon numarasının INTTRA rezervasyon listesinde bulunmadığına ilişkin 10136 uyarısı kullanıcı onayına sunuluyor; gizlenmiyor.
- İlk teknik kontrol, AmendAction eksik olduğundan taslak olarak döndü (63845943); kimlik kontrolü final göndermeyi engeller. Son doğru revizyon kontrol taslağı 63845956. Bunlar taşıyıcıya gönderilmiş yeni talimat değildir.
- Taşıyıcının “seyahat programı” uyarısının Türkçe karakterlerden kaynaklandığı toplantıda bir olasılık olarak konuşuldu; kesin neden olarak kabul edilmedi. Gerçek revizyon gönderilmeden taşıyıcı sonucu doğrulanamaz.

## Regresyon kapsamı

131 otomatik test, TypeScript kontrolü ve üretim derlemesi başarılı. Gerçek kaydetme akışını taklit eden test, mal satırı kaydının konteyner/yük toplam ve sürümlerini değiştirmesine rağmen aktarımın tamamlanmasını doğruluyor. Oluşturulmuş INTTRA/T-MAXX kayıtlarının tekrar gönderilmemesi, taraf/notify kuralları, ödeme dağılımları, SWB/orijinal, HBL ayrımı ve kaynak düzeltmelerini koruma testleri de dahil.

## Toplantıda ikinci aşamaya bırakılanlar

Yeni taşıyıcı platformları (Maersk/CMA vb.) ve reefer sıcaklık/havalandırma ayrıntıları bu teslimin kapsamına alınmadı. Desteklenmeyen özel konteyner ayrıntıları sessizce atlanmıyor; gönderim durdurulup kullanıcıya gösteriliyor.

## Son canlı teşhis — tarayıcıdan kaydetme

Kullanıcının tarayıcıdan mevcut kaydı tamamlatma isteği üzerine CBI uygulamasındaki T-MAXX ayrıntıları, kontrol ve onay akışı çalıştırıldı. HTTP 400 yeniden üretildi. Mevcut mal satırı 451136530 kaydedildi; GET/önizleme 788 paket, 23110 brüt, 22636.8 net ve ilgili toplamların eşleştiğini gösterdi. Kalan farklar 8 alana indi: yükün hblNo/bookingNo alanları ve HBL metin alanları.

Yük kaydının PUT yanıtındaki gerçek hata:

> Hat "BCM - Booking Confirmation" evrakı dijital arşive ilişkilendirilmiş olmalı! - WorkFlow [Booking Onay Kontrol]

Bu bir T-MAXX iş akışı önkoşuludur. HTTP hata mesajı iş açıklamasını gizliyordu; bilinen BCM hatası artık kullanıcıya belgeyi doğru yükün dijital arşivine ilişkilendirme adımıyla gösteriliyor. Bu kural atlanmadı, başka belge BCM diye yüklenmedi. Kullanıcıdan EBKG18686156 booking onay belgesinin dosya yolu veya T-MAXX arşiv konumu istendi. Kayıt tamamen tamamlandı olarak işaretlenmedi. INTTRA 548509629 değişmedi. Son test toplamı: 132 başarılı.

### Recovery cross-field checks — 2026-09-24
T-MAXX recovery now reports field-addressed cargo issues separately from structural blockers, allowing correction. Net weight exceeding gross weight, invalid stored quantities/weights/volume, and blank packing/description values are checked on inspection, preview and again before any recovery write. Approval is withheld when preview issues remain. No platform shipment was submitted for this change; BCM archive association remains an external prerequisite. Validation: full 133-test suite and TypeScript/build passed; additional inspection regression passed (134 tests total).
