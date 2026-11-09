# Canlı yayın hedefi

Üst dizindeki mevcut işlevleri koruma kuralları geçerlidir.

- Asıl canlı uygulama: `https://cbi-transportation.kadirerbakar.workers.dev`.
- Yayın yapılandırması: `wrangler.production.json`; Worker `cbi-transportation`, D1 `cbi-transportation-db`, R2 `cbi-transportation-documents`.
- `.openai/hosting.json` içindeki Sites projesi ayrı bir ortamdır. Bu kimliği çalışan uygulamanın yayın hedefi kabul etme. O adres 2 Kasım 2026 itibarıyla asıl uygulamaya yönlendirir; Sites deposuna normal uygulama derlemesini yayımlama.
- Uygulama güncellemesinde mevcut veritabanı, dosyalar, platform hesapları, sırlar, INTTRA bağlantı hizmeti, CMA ajanı ve Pre-alert kuyruğu korunur. Yerel `.env.local` değerlerini topluca canlıya kopyalama; özellikle güncel tünel adresini eski bir değerle değiştirme.
- Önce canlı sürümü ve servis bağlarını doğrula, geri dönüş sürümünü kaydet. Kontroller başarılıysa `npm run build`, ardından `npx wrangler deploy --config wrangler.production.json --keep-vars` kullan. Ekran değişiklikleri için migration veya veri taşıma yapma.
- Yayından sonra ayrı bir test oturumunda giriş/çıkış, otomatik platform bağlantıları ve mevcut kayıtları kontrol et. Test için gerçek konşimento veya VGM gönderme. Ayrıntılar: `docs/home-production-restore-2026-11-02.md`.
