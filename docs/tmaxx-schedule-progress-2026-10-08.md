# Takvim/saha T-MAXX entegrasyonu ve VGM hedefi — 8 Ekim 2026

Bu adım tamamen kapatılmadı. Kullanıcı şoför/plaka, konteyner hareketleri ve saha olaylarının tutulduğu T-MAXX ekranını sordu; yanıt beklediğini belirtti. Doğru işlem karşılığı bilinmeden CRM görevi veya konteyner olayı oluşturulmadı.

## Tamamlanan yerel geliştirme
- Booking takvimi, genel operasyon takvimi ve saha ekranında bağlı T-MAXX pozisyon/yükü açılışta canlı okunur; son okuma zamanı gösterilir. Yenileme başarısızsa eski sonuç başarı olarak tutulmaz. Genel görünüm ilk 50 bağlı dosyayı üçlü gruplarla okur; sınır aşımı ve dosya bazlı hatalar görünür.
- ETD/ATD/ETA/ATA, belge/VGM/terminal son teslimi, konteyner giriş tarihi ve yükleme/boşaltma tarihleri T-MAXX'ten gelir. Gerçek kayıtta dolu alanlar `etd` ve `eta`; önceki ortak okuyucunun boş `etdDate`/`etaDate` yardımcı alanlarını okuması düzeltildi.
- Kullanıcının açık tercihi: saat dilimi Europe/Istanbul. Saat dilimsiz T-MAXX tarihleri Türkiye saati olarak değerlendirilir. Son 24 saat ve kritik son 4 saat uyarıları hesaplanır; gerçekleşen tarih varsa ilgili tahmini tarih gecikme olarak gösterilmez. Uyarı hesabı açık ekranda dakikada bir güncellenir; dış veri yeni okumayla yenilenir. Tarih biçimi geçersizse saat varsayılmaz.
- Doğrulanmış tarih alanları ve yükün yükleme/boşaltma adresi, irtibat telefonu, konteyner teslim alma yeri, yükleme/boşaltma nakliyeci plakası ortak önizleme/sürüm kontrollü ERP yazma günlüğüne eklendi. Kaydetme sonrası geri okunur; diğer alanlar korunur. Adres kartına bağlı serbest adres değişimi engellenir. Kesin şoför/hareket/olay eşlemesi yapılmış gibi sunulmaz.
- Canlı konteyner numarası, tipi ve mühürleri saha panelinde okunur; bu adım konteyner olaylarını veya mühürleri yazmaz. Pozisyon/yük/firma/ebeveyn kimliği ve kayıt sürümleri denetlenir.
- Mevcut yerel görev ve saha taslakları korunur ve ayrı olduğu belirtilir; bu eski kayıtlar otomatik T-MAXX CRM görevi haline getirilmez.

## VGM düzeltmesi
Ozan Kaman'ın kullanıcı tarafından iletilen açıklamasına göre VGM sonucu armatör web sitesine girilir. T-MAXX yalnız konteyner/yük kaynağı olabilir; VGM son teslim tarihi ile VGM sonucu farklıdır.

VGM ekranı ve dışa aktarılan paketin amacı bu hedefe göre düzeltildi. Paket `destination: carrier_website`, `transmitted: false` içerir. Uygulama onayı armatör teslim kanıtı değildir. Otomatik armatör VGM gönderimi ve armatör alındı kaydı bu çalışma içinde uygulanmadı. Yeni ERP alan izin listesine VGM sonucu eklenmedi; bunu göndermeye çalışan istek testle reddediliyor.

## Kontroller ve sınırlar
Gerçek S.E.26.09.00670 / YK.S.E.26.09.00801 kaydında yeni okuma servisi beş GET ile 13 dolu tarih ve bir konteyner okudu. Test bağlama yalnız özel salt okunur deneme içinde kullanıldı; yerel booking'e gerçek yük bağlanmadı. Gerçek oluşturma, tarih güncelleme, VGM veya belge gönderimi yapılmadı.

Yerel giriş/çıkış, konşimento listesi, eski operasyon takvimi, yeni T-MAXX takvimi, saha ve VGM uçları HTTP 200. Gerçek T-MAXX yazma kabulü bekliyor. 435 otomatik test geçti; TypeScript, değişen kaynaklarda ESLint ve üretim derlemesi başarılı. Oturum tabloları dışında önceki 46 tablo aynı kaldı. VGM ekranında armatör hedefi tarayıcıda doğrulandı; görüntü output/tmaxx-schedule-2026-10-08/vgm-carrier.png. Yeni migration yok; canlıya dağıtım yapılmadı. Günlükler `.private/tmaxx-schedule-2026-10-08` altında.

Kalan: şoför/hareket/olay ekran adı ve iş akışı yanıtı, ona göre hedef servis/kimlik/durum eşlemesi, yazma günlüğü ve kabul kontrolleri. Bu yanıt gelmeden takvim/saha adımı bütünüyle tamamlandı denmemeli.
