# Son haftanın platform belgeleri — 15 Ekim 2026

Ana sayfa ve booking listesine son 7 gün içinde T-MAXX dijital arşivine eklenmiş belgeler için salt okunur liste eklendi. Tarih, kaynak `createDate` alanıdır; saat dilimsiz değerler Türkiye saatidir. Bu tarih bir HBL'nin oluşturulma veya armatörün VGM kabul tarihi olarak sunulmaz.

Liste kaynak pozisyon aramasının döndürdüğü kayıtlarla sınırlıdır (kontrolde 150 pozisyon). Bu, tüm şirket geçmişinin eksiksiz tarandığı anlamına gelmez. Her pozisyon ve yük arşivi ayrı okunur; başarısız pozisyon sayısı gösterilir. Yerel kopya booking veya sahte gönderim oluşturulmaz. Belge indirme mevcut pozisyon/yük/belge kimliği kontrollerinden geçer. PDF olmayan kaynak dosyası PDF gibi etiketlenmez.

Booking listesinde raporlamada test olarak işaretli kayıtlar varsayılan olarak gizlenir. İşaretlenmemiş kayıtlar adından tahmin edilerek gizlenmez. Testleri göster seçeneği, eski detay bağlantıları ve API'nin varsayılan davranışı korunur. Hiçbir iş kaydı silinmedi.

## Kontrol sonuçları

- Yetkisiz yeni arşiv API isteği 401; oturum açma ve çıkma başarılı.
- 8 mevcut booking kaydı korunuyor; testler hariç liste 0 kayıt. Arayüzde test seçeneği açılınca 8 kayıt tekrar göründü.
- API taramasında 150 pozisyon, 87 haftalık belge, 1 okunamayan pozisyon; ayrı arayüz taramasında 86 belge, 2 okunamayan pozisyon. Sonuçlar eksiksiz kabul edilmez.
- Gerçek bir PDF indirmesi 200, 150707 bayt ve `%PDF-` imzasıyla doğrulandı.
- Mevcut konşimento listesi 200.
- TypeScript ve değişen dosyaların lint kontrolü başarılı. Yeni tarih/sahiplik testleri, mevcut T-MAXX arşiv indirme ve CMA bağlantı testleri başarılı.
- Üretime dağıtılmadı; dış platforma belge veya VGM gönderilmedi.

## Açık işler

- T-MAXX genel arşiv sayfalamasının doğrulanması: eski pozisyonlara yeni eklenen belgeler ilk 150 pozisyon dışında kalabilir. Kaynak arşiv türleri korunur; listede bulunan bütün dosyalar konşimento sayılmaz.
- INTTRA şirket geneli konşimento geçmişi mevcut API akışına dahil değil.
- CMA oturumu kullanıcı girişinden sonra tarayıcıda doğrulandı. Liste 69 kayıt gösteriyor. Eklenti okuyucusu gizli POL/POD sütunları nedeniyle eski sabit sütun sırasını reddediyordu. İzinler değiştirilmeden sütun adına göre eşleştirme düzeltildi ve regresyon testi eklendi; kullanıcıdan eklentiyi Reload ile yenilemesi istendi. Uygulama üzerinden başarılı okuma ve tüm sayfalardan haftalık VGM listesi henüz doğrulanmadı.

## Son 30 gün ve ortak sayfa tasarımı

Kullanıcı talebiyle canlı arşiv aralığı son 30 güne genişletildi (takvim ayı değil, kayan 30 günlük dönem). API tarih filtresi ve ana sayfa, booking, yönetim paneli metinleri birlikte güncellendi. Örnek iki API sayfasında önceki 7 günlük kapsamın dışında kalan 9 gerçek belge doğrulandı. Kaynak 150 pozisyon sınırı devam eder; genişleyen dönem, tam şirket arşivi kapsamı iddiası değildir.

Tüm operasyon sayfalarına ortak ekran stili, sayfa amacı açıklamaları, tutarlı başlık/kart/form/tablo görünümü eklendi. Booking ayrıntılarında dosya, VGM, belgeler, veri kontrolü, pre-alert, saha ve finans gezinmesi eklendi. Native bağlantılar ve mevcut kaydedilmemiş form korumaları korunur. Yazdırma çıktıları ekran stilinden ayrı tutuldu. Oturum koduna ve dış platform gönderim koduna müdahale edilmedi.

Tarayıcıda konşimento listesi/yeni kayıt, yeni booking, gelen belgeler, takvim, yönetim paneli ve 7 booking alt sayfasının açılışı kontrol edildi. Yönetim paneli ve pre-alert görsel olarak incelendi. TypeScript/lint ve ilgili testler başarılı. Giriş/çıkış ve konşimento API okuması başarılı. Gerçek gönderim veya canlı dağıtım yapılmadı.

## 15 October — complete history read integration

- Replaced the default 150-position tree scan with direct archive search by Istanbul calendar day, followed by the exact rolling 30-day timestamp filter. The boundary date is scanned too. Full result pages grow from 200 until a short page; an excessive day fails visibly instead of silently truncating. SeaPosition and SeaGood references are resolved; unrelated Company documents are excluded. Nullable filename found in a Company document is tolerated.
- Live UI: 31/31 archive dates, 497 documents, 354 PDFs, 79 pre-alerts, no entity-resolution failures. Existing scoped archive downloads unchanged.
- Isolated INTTRA `/history` relay uses the vendor's `submitSearch` contract. No submission allowlist expansion. Month search returned 27 records with complete=true. When the vendor's 100-result cap is reached, read daily; capped days remain explicitly incomplete.
- INTTRA history PDF requires current-user history membership, then uses the existing validated SI PDF reader. Live PDF HTTP200, 312434 bytes, `%PDF-` signature. This is SI printout, not final carrier MBL.
- CMA content reader traverses Next controls on its own background tab. Same permissions, no edit or submit. User reloaded extension. Live app: all 69 rows read, 41 submitted overall, 39 with Sending Date in the displayed month; missing-VGM bookings excluded. Source date text preserved. No PDF link exposed by this CMA list; data is displayed in-app.
- CMA requests coalesce across application tabs, with a 60-second read cache; no cross-owner access change. Completeness remains explicit. Chrome/company-account identity remains user-managed and unverified; no automatic account switch.
- Live existing records endpoint HTTP200; targeted existing consignment/PDF/amendment/T-MAXX isolation tests passed. No real submission made. Local only, no production deployment.
