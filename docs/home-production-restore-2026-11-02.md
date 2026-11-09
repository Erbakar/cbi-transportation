# Ana sayfa birleşimi ve canlı bağlantıların korunması — 2 Kasım 2026

## Neden

Ana sayfa ile yönetim panelinin birleşimi, yanlışlıkla ayrı ChatGPT Sites ortamına yayımlandı. Bu ortamın `platform_credentials` tablosu boştu; INTTRA bağlantı hizmeti ve CMA ajan ayarları da asıl uygulamadaki gibi tanımlı değildi. Kullanıcı bu nedenle üç bağlantının da eksik olduğunu gördü. Asıl Cloudflare Worker, mevcut hesaplar ve kayıtlar yerindeydi.

## Düzeltme

Birleşik ekran mevcut `cbi-transportation` Worker'ına, `wrangler.production.json` ve `--keep-vars` ile yayımlandı. D1, R2, sırlar, kuyruk, CMA ve INTTRA hizmetleri korundu. Migration, hesap taşıma veya parola değişikliği yapılmadı. Yönetim panelinin rapor bileşenleri Ana sayfada açılır; `/dashboard` Ana sayfaya yönlenir.

- Asıl adres: https://cbi-transportation.kadirerbakar.workers.dev
- Yayınlanan sürüm: `c3b07ad4-7eab-4f37-95db-886cf8a19c0c`.
- Önceki sürüm: `baad7f93-a939-4ead-a5ca-d82f46accdc4`; kaynak modülleri özel yerel yedeğe alındı. Daha sonraki tünel güncellemeleri yeni sürüm kimliği oluşturabilir; geri dönüşte güncel bağlantı adresini koru.
- Yerel uygulama kaynağı: `e8b9a00f094c0c2e3997f2dc4c32616e8b2f26fb`.

Yanlışlıkla paylaşılan `cbi-transportation-operations.kadirerbakar.chatgpt.site` adresi, kendi ayrı kaynak deposunda yalnızca sabit asıl adrese yönlendiren küçük bir Worker'a dönüştürüldü. Önceki uygulama kaynağı ve depolama bağları korundu. Yönlendirme sorgu veya kimlik bilgisi taşımaz, eski sekmelerin API/yazma isteklerini iletmez. Sites erişimi yalnızca mevcut sahibine açık kalır.

- Sites kaynak commit'i: `2160680cd78834df2758f5f65137d58195971acd`.
- Sites deployment: `appgdep_6ae8594e2f60819199a566f2ea1ecf96`.

## Doğrulama

- Yayın öncesi ve sonrasında ayrı uygulama oturumunda giriş/çıkış ve çıkış sonrası yetki iptali başarılı. Kullanıcının mevcut oturumu korundu.
- T-MAXX ve INTTRA gerçek hesap girişleri başarılı. Üç platform kartı da hazır; CMA ajanı çevrimiçi, doğrulanmış tam listede 75 satır var.
- `records` tablosundaki 10 satır, `deliveries` tablosundaki 20 satır ve üç şifreli platform hesabının yayın öncesi/sonrası özetleri birebir aynı. Tüm servis bağları aynı.
- Konşimentolar, Ana sayfa, rapor, operasyon ve booking API okumaları başarılı. `/dashboard` 307 ile `/` adresine yönlendi.
- Chrome'da birleşik Ana sayfa ve rapor bölümünün açılması doğrulandı. Menüde ayrı yönetim paneli yok. Ana sayfada 3/3 bağlantı, T-MAXX arşivinde 366 belge, INTTRA'da 22 talimat ve son 30 güne ait CMA kayıtları görünüyor.
- Yanlışlıkla paylaşılan Sites adresi tarayıcıda asıl uygulamaya yönlendi.
- 20 raporlama testi, TypeScript denetimi ve üretim derlemesi başarılı. Ayrı yönlendirme Worker'ının iki güvenli yönlendirme testi başarılı.

Gerçek konşimento, VGM veya Pre-alert gönderimi yapılmadı. Bu doğrulama bağlantı ve mevcut kayıt okuma kapsamındadır; yeni gönderim kabul testi değildir. Özel yedek ve denetim çıktıları `.private/home-restore-2026-11-02/` altında, sürüm kontrolü dışındadır.
