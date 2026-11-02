# Booking devir altyapısı — ilk geliştirme adımı

Tarih: 5 Ekim 2026

## Plan ve kapsam

Klasörde doğrulanan ana kaynak `../CBI_OPERASYON_OTOMASYONU_FAZ_PLANI.md`, Faz 0–10 içeriyor. Kullanıcının yüklediği `CBI_OPERASYON_OTOMASYONU_FAZ_PLANI_DIYAGRAMLI_v2 (1).pdf` (18 sayfa) incelendi: dokümanda 19 ana bölüm, Faz 0–10 olarak 11 uygulama fazı vardır. Sayfa 16 bağımlılık diyagramı, sayfa 18 ilk teslimatı doğrular. Belgede 3–4 aylık süre veya haftalık teslim takvimi bulunmaz; bu süre kullanıcı tarafından belirtilen hedef olarak ele alınmalıdır. Bu teslimat Faz 0'ın veri tanımları ile Faz 1'in devir kaydı bölümünü uygular. Faz 0 veya Faz 1 bütünüyle tamamlanmış değildir.

Pilot: denizyolu ihracat FCL. İthalat örnekleri, bu modülde ihracat kuralı olarak kullanılmaz.

## Uygulanan işlevler

- `/booking`: liste, referans/müşteri/sorumlu araması, yeni taslak, mevcut taslağı düzenleme, anlık eksik bilgi kontrolü.
- `/api/bookings`: oturumlu kullanıcıya ait son 200 devri listeleme; oluşturma ve sürüm kontrollü güncelleme.
- `lib/operations/booking.ts`: ortak doğrulama şeması, alan etiketleri, referans normalizasyonu, hazırlık değerlendirmesi.
- `booking_handovers`: satış referansı, müşteri, yükleyici, rota, ekipman, ticari şartlar, sorumlu, kaynak referansı, notlar.
- `booking_handover_events`: her kaydetmede kullanıcı, zaman, sürüm ve veri görüntüsü. Güncelleme ve olay kaydı tek veritabanı işleminde tutulur.
- Aynı kullanıcı ve normalize satış referansı için tek devir. Eski sürümden güncelleme reddedilir. Yetkisiz kullanıcı bir başka kullanıcının kaydını okuyamaz/değiştiremez.
- Eksik bilgiler taslakta saklanabilir. Alanlar tamamlandığında durum yalnızca “İnceleme bekliyor” olur; booking confirmation veya platform onayı sayılmaz.

Mevcut konşimento kayıtları ve aktarım mantığı değiştirilmedi; ana ekrana Booking devri bağlantısı eklendi. Önceden bulunan yerel değişiklikler korunmuştur.

## Tasarım

Beyaz çalışma panelleri, nötr gri zemin, ölçülü lacivert eylem rengi; solda kayıt listesi, sağda etiketli form. Hata, eksik ve inceleme durumları metinle belirtilir. Dar ekranlarda paneller alt alta geçer. Kaydedilmemiş değişiklikler için ayrılma uyarısı bulunur.

## Doğrulama

- 8 otomatik test: taslak/inceleme ayrımı, geçersiz sayılar, referans normalizasyonu, oluşturma/okuma/güncelleme, gerçek bellek içi SQLite üzerinde migration ve atomik olay kaydı, eski sürüm reddi, kullanıcı ayrımı, mükerrer kontrolü, istek boyutu ve giriş/kaynak koruması.
- TypeScript kontrolü ve yeni modüllerin ESLint kontrolü.
- Yerel tarayıcıda ekran açılışı ve giriş olmadan düzenlemenin devre dışı olması gözlendi. Giriş yapılarak tarayıcıdan kaydetme akışı henüz doğrulanmadı. API testleri oturum/kaynak doğrulayıcılarını kontrollü taklitlerle, SQL işlemlerini gerçek SQLite ile çalıştırır; Cloudflare D1 uçtan uca testi değildir.
- `0006_booking_handover.sql` yerel geliştirme veritabanına uygulandı. Canlı veritabanına uygulanmadı ve yayın yapılmadı.

## Sonraki dilimler

1. Kaynak plan eşleştirildi. Faz 0–10 numaraları korunarak eksik kabul kriterlerinin ve teslim sırasının izlenmesi.
2. Müşteri, liman, kullanıcı ve ekipman kartlarının T-MAXX kimlikleriyle doğrulanması. Bugünkü metin alanları doğrulanmış cari/liman kartı değildir.
3. Kaynak belge ekleme ve değiştirilemeyen dosya sürümleri; mevcut talimat kaydıyla açık bağlantı. Bugünkü kaynak referansı metindir, belge arşivi değildir.
4. Belge sınıflandırma ve alan bazında kaynak/güven bilgisi; booking request/confirmation/revision ayrımı.
5. Operasyon onayı ve rol matrisi; ardından kontrollü T-MAXX taslak aktarımı.
6. Cut-off, görev, VGM, belge karşılaştırma ve sonraki fazların aynı kayıt kimliklerine bağlanması.

Bugünkü kullanıcı ayrımı mevcut tek hesap/owner modeliyle uyumludur; ekip paylaşımı ve rol bazlı erişim ayrıca tasarlanmalıdır. Tam iş akışı onayı, e-posta alımı ve platform yazımı bu ilk dilimde uygulanmamıştır.

## Yüklenen plan ile uygulama eşleştirmesi

| Kaynak faz | Bugünkü karşılık | Tamamlanması gereken başlıca bölüm |
|---|---|---|
| 0 — Veri sözlüğü | Booking alan şeması ve kontrolleri | Bütün belge türleri, kaynak önceliği, rol ve onay matrisi |
| 1 — Booking devri | Manuel taslak, eksik alan kontrolü, referans tekilliği, sürüm kaydı | E-postadan otomatik devir, kart doğrulama, belge bağlantısı, onaylı T-MAXX taslağı |
| 2 — Belge işleme | Mevcut talimat okuma akışı yeniden kullanılabilir | Teklif/request/confirmation/revision ayrımı ve kaynak kanıtı |
| 3–4 — Takvim ve saha | Yeni devir kimliğine bağlanacak | Tarihler, görev sahibi, revizyon geçmişi, rezervasyon notası |
| 5–6 — VGM ve konşimento | Mevcut talimat ve konşimento kontrolleri yeniden kullanılabilir | VGM kaynağı, tolerans kuralları ve çok belgeli karşılaştırma |
| 7 — Sürüm ve onay | Booking değişiklik geçmişi ilk altyapı parçası | Belge sürümü, onay kanıtı ve final kilidi |
| 8 — Pre-alert | Henüz bu çalışmada uygulanmadı | Son onaylı belgeler, alıcı kuralları, paket kontrolü |
| 9–10 — Finans ve göstergeler | Henüz bu çalışmada uygulanmadı | Beklenen/gerçekleşen maliyet, fatura eşleştirme, ölçümler |

Bu eşleştirme fazların tamamlandığı anlamına gelmez. Kaynaktaki ilk teslimatın altı bileşeni (gelen kutusu, booking devri, belge okuma, takvim, konşimento kontrolü, pre-alert) geliştirme kapsamının ana çerçevesidir. Bir sonraki bağımlılık, e-posta/belge alımını booking devrine bağlayacak ortak belge ve kaynak modelidir. Faz 0'daki kesinleşmemiş iş kuralları yalnızca ilgili otomatik kararları bekletir.

## İkinci dilim — ortak belge arşivi

Booking ekranına Operasyon belgeleri bölümü eklendi. Kaydedilmiş devirlere PDF, PNG ve JPEG (dosya başına 10 MB) yüklenebilir. Kullanıcı belge türünü, kaynak e-posta/belge açıklamasını ve gerekiyorsa önceki sürümü seçer. Bütün sürümler indirilebilir; eski kaynak dosyanın üzerine yazılmaz. Tür seçimi kullanıcı beyanıdır: “Final HBL” seçimi, operasyon onayı veya doğrulanmış final statüsü oluşturmaz.

Veri modeli: `operation_documents` her sürüm için değişmez kimlik, booking kimliği, seri kimliği, önceki sürüm bağlantısı, sürüm numarası, tür, kaynak açıklaması, orijinal dosya adı, MIME, boyut, SHA-256, nesne deposu anahtarı, kullanıcı ve yükleme zamanı tutar. Aynı booking'deki aynı içerik yeni kayıt oluşturmaz. Farklı booking'lerde aynı belgenin bulunması şimdilik engellenmez; çoklu referans eşleştirmesi sonraki kontroldür.

Dosyalar mevcut R2 deposunda ayrı `operation-documents/` alanına yazılır. Depolama veya veritabanı hatası başarılı yükleme olarak gösterilmez. SQL yazımı başarısızsa, kaydın gerçekten oluşmadığı doğrulandıktan sonra sahipsiz nesne temizlenir. Yazma cevabı kaybolmuş ancak kayıt oluşmuşsa kaynak silinmez. Veritabanı sonucu hiç okunamıyorsa güvenli tarafta kalınarak nesne korunur; bu durum için ileride sahipsiz nesne uzlaştırma görevi gerekir.

Yeni sürüm aynı serinin güncel belgesine bağlanır. SQL tekillik kısıtları eşzamanlı yüklemelerde mükerrer kaydı ve geçmişin dallanmasını önler. Listeleme, ekleme ve indirme işlemleri booking sahibini doğrular. Güncel/önceki ayrımı türden değil sürüm ilişkisinden hesaplanır. İndirilen içerik tarayıcıda çalıştırılmak yerine ek dosya olarak sunulur.

`0007_operation_documents.sql` yalnızca yerel veritabanına uygulandı. Canlı yayın/migration yapılmadı. Belge doğrulama testleri gerçek SQLite ve taklit nesne deposuyla çalışır; canlı R2 testi değildir. Tarayıcıda oturumlu yükleme/indirme kabul testi henüz yapılmadı.

Sonraki iş: Word/Excel dosya kabulü ve içerik doğrulaması; e-posta mesaj/ek kimliği; ardından alan bazında kaynak kanıtı ve güven skoruyla veri çıkarımı. Dosya arşivi mevcut talimat okuma akışına henüz otomatik gönderilmez. Böylece booking confirmation'ın müşteri talimatı gibi işlenmesi önlenir.

## Üçüncü dilim — booking belgesi okuma ve alan onayı

Teklif, booking talebi, teyidi ve revizyon belgelerine “Bilgileri incele” akışı eklendi. Kullanıcı belgeyi okumayı başlattığında mevcut yapılandırılmış Gemini servisi kullanılır. Sekiz alan çıkarılır: müşteri, yükleyici, yükleme/boşaltma limanı, ekipman tipi/adedi, Incoterm ve navlun ödeme biçimi. Satış referansı ve operasyon sorumlusu model tarafından doldurulmaz.

Her öneri için değer, kaynak alıntısı, bir tabanlı sayfa numarası ve model güven tahmini saklanır. Kaynak metni/sayfa doğruluğu bağımsız OCR ile doğrulanmış değildir; kullanıcı orijinal dosyayla karşılaştırır. Model güveni ölçülmüş doğruluk oranı değildir. Belge türü model tarafından ayrıca önerilir; bu öneri kullanıcının sınıflandırmasını veya booking durumunu değiştirmez. “Other” sonucu alan aktarımına kapalıdır.

İnceleme tablosu mevcut değeri ve öneriyi yan yana gösterir. Hiçbir alan önceden seçilmez. Kullanıcının seçtiği alanlar açık onayla kaydedilir; booking sürümü, değişiklik görüntüsü ve kaynak belge/çıkarım kimliği, seçili alanlar, kullanıcı ve zaman aynı veritabanı işleminde yazılır. Formda kaydedilmemiş değişiklik varsa önce kaydetmek gerekir. Güncel olmayan belge sürümü veya eski booking sürümüne aktarım reddedilir. İlgisiz alanlar korunur.

Okuma sonucu belge başına saklanır. Eşzamanlı okumalar için üç dakikalık sahiplik süresi; servis çağrısında iki dakikalık zaman sınırı bulunur. Başarısız ve süresi dolmuş işlemler tekrar denenebilir. Başarılı sonuç yeniden kullanılır; arayüzdeki sonuç açma işlemi yeni model çağrısı başlatmaz. Başarılı sonucu aynı dosyada yeniden üretme/sürümleme henüz uygulanmadı.

`0008_booking_extractions.sql` yerel veritabanına uygulandı. 22 ilgili test geçti: booking ve belge arşivi regresyonları, çıkarım şeması, kaynak zorunluluğu, seçili alan aktarımı, kaynak geçmişinin atomik kaydı, eski sürüm engeli, hatalı model çıktısı, eşzamanlı okuma ve süre aşımı toparlanması. TypeScript ve değişen modüllerin ESLint kontrolleri geçti. Bu testler gerçek SQLite ve taklit model/nesne deposu kullanır; gerçek Gemini belge doğruluğu, canlı Cloudflare/R2 ve oturumlu tarayıcı akışı henüz kabul testinden geçmedi. Canlı yayın yapılmadı.

Bu dilim booking request/confirmation ayrımını koruyan bir okuma ve insan inceleme temelidir. Teklif fiyatları, çoklu ekipman satırları, cut-off çıkarımı, kart kimlikleri ve çok belgeli çelişki çözümü sonraki geliştirmelerdir. Birden fazla ekipman türünün tek tipe veya adede indirgenmemesi model talimatında belirtilmiştir; çoklu satır modeli ayrıca kurulmalıdır.

## Dördüncü dilim — kanıta dayalı karar katmanı

`document-reliability-policy.md` politika sözleşmesi eklendi. Model tahmini; kontrol puanı, doluluk ve doğrulanmamış belge gerçekliğinden ayrıldı. Kaynak hash kontrolü, güncel sürüm, tür/alan kontrolleri, kayıt ve diğer güncel belgelerle farklar sunucuda değerlendirilir. Seçilen alanlar için orijinal belge teyidi, riskli durumlarda gerekçe zorunludur. İnsan teyidi kesin engelleri aşamaz. Değerlendirmeden sonra yeni kanıt gelirse eski onay reddedilir. Karar ve politika sürümü uygulama geçmişine kaydedilir. 29 ilgili test geçti; yerel migration uygulandı. Gerçek belge/OCR doğrulaması, kalibrasyon ve oturumlu uçtan uca kabul testi açık kalır.


## Kullanıcı yönlendirmesi: yüksek kapsam, az insan müdahalesi

5 Ekim 2026: Belge kontrol politikasına `booking-evidence-v2` otomatik taslak yolu eklendi. Belgeyi okuma eylemi boş ve çelişkisiz alanları sunucunun yeniden değerlendirdiği kurallarla topluca doldurur. Dolu değerler korunur, ekipman tipi/adedi birlikte değerlendirilir, uyuşmazlıklar incelemeye ayrılır. Her uygulamanın kaynak belgesi, çıkarımı, politika/kanıt sürümü ve otomatik mi insan incelemesi mi olduğu işlem geçmişinde tutulur. Taslak değerler doğrulanmış sayılmaz.

Ekran varsayılan olarak eksik/çelişkili alanları gösterir; tüm değer ve alıntılar ayrıca açılabilir. 11 devir alanının doluluğu ve 8 alanlık belge okuma kapsamı açıkça gösterilir. Gerçek belgelerde doğruluk yüzdesi henüz ölçülmedi; konşimentonun tüm alanlarının bu yeni akışa bağlandığı iddia edilmez.

Doğrulama: 33 ilgili test, TypeScript ve değişen modüllerin ESLint kontrolü geçti. Yeni testler sekiz uygun alanın toplu doldurulması, insan teyidi uydurulmaması, mevcut verinin korunması, kaynak alıntısında bulunmayan değerin otomatik aktarılmaması, ekipman çiftinin kontrolü ve eşzamanlı kanıt değişikliğinde atomik ret senaryolarını kapsar. Gerçek model ve oturumlu tarayıcı testi yapılmadı; canlıya yayın yapılmadı.


## Faz 2 devamı — yerel kayıt onarımı ve 16 alan

Yerel liste hatası, mevcut yerel veritabanında 0003–0005 geçişlerinin uygulanmamış olmasından kaynaklanıyordu: records.manual ile record_documents, platform_steps ve platform_reviews eksikti. Veritabanı .wrangler/backups altında yedeklendi; mevcut SQL geçişleri yalnızca yerel veritabanına uygulandı. Tarayıcıda 14 Eylül tarihli bir konşimento yeniden listelendi; bu tespit tüm canlı kayıtların doğrulandığı anlamına gelmez.

Booking belgesinden okuma kapsamı 8’den 16 alana çıkarıldı. Ek bilgiler düzenlenebilir formda ayrı bir bölümde gösterilir; temel devir zorunluluklarını değiştirmez. Eski kayıtlar varsayılan boş ek alanlarla uyumludur. Taraf-adres bağlantısı korunur; kısmi otomatik aktarımla bağımlı alanın atlanması engellenir. İki ayrı belgeden tamamlayıcı verinin aynı booking’e kaynak geçmişi korunarak kaydedilmesi test edildi.

37 ilgili test, TypeScript ve değişen modüllerin ESLint kontrolü geçti. Tarayıcıda konşimento listesinin düzeldiği doğrulandı. Gerçek model doğruluk ölçümü ve çok satırlı konteyner/yük eşleştirmesinin booking-konşimento akışına bağlanması tamamlanmış değildir. Canlıya yayın yapılmadı.


## Faz 2 — konteyner/yük ilişkisinin kontrolü

Yeni `cargoLinkage` değerlendirmesi mevcut konşimento modeli ve gönderim öncesi doğrulama içinde kullanılıyor. Her mal kaleminin açık konteyner referansı kontrol edilir; boş referans tek konteyner var diye doldurulmaz. Geçersiz kontrol basamağı, bulunamayan veya tekrarlı konteyner, farklı yazım ve zayıf/kaynaksız ilişki incelemeye ayrılır. Bir konteynere birden fazla mal kalemi bağlanabilir. Bu bir belgenin doğruluğunu ispatlama mekanizması değildir.

Mal kalemi ekranı eşleşen/toplam satır sayısını ve sorunları gösterir. Konteyner düzeltmesi yük listesindeki seçeneklerden yapılır. Düzeltilmiş değer satır başlığına ve T-MAXX mal satırı seçeneklerine yansır; konteyner değiştiğinde önceki açık T-MAXX mal satırı seçimi sıfırlanır. Diğer alan düzeltmeleri korunur.

Değişiklik öncesi 32 ilgili kontrol geçti. Değişiklik sonrası yeni ilişki senaryoları, belge okuma, kullanıcı düzeltmeleri ve gönderim akışı dahil 66 test geçti. TypeScript ve değişen değerlendirme/editör/test modüllerinde ESLint geçti. Platform ayarları ve giriş akışı değiştirilmedi; canlı gönderim yapılmadı. Yeni ekran gerçek yük satırlarıyla oturumlu tarayıcıda henüz denenmedi. Gerçek belgelerde etiketli doğruluk ölçümü ve booking ile konşimento kayıtları arasındaki çok satırlı devir henüz tamamlanmış değildir; Faz 2 bütünüyle tamamlandı sayılmaz.
