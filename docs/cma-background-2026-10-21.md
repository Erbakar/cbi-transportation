# CMA sekmesiz bağlantı kontrolü — 21 Ekim 2026

Kullanıcı, Chrome'da geçici sekme açılmadan CMA bağlantısı ve proxy seçeneğinin değerlendirilmesini istedi.

## Gerçek sonuç

Ayrı, geçici profilli ve görünmez Chrome ile CMA `/ebusiness/account/edit` adresine erişim denendi. 2026-10-21T18:21:14.691Z kontrolü HTTP 403 döndürdü (`access_blocked`). Kimlik bilgileri gönderilmedi, oturum kurulmadı, VGM gönderilmedi. Kullanıcının Chrome profili kullanılmadı; geçici profil kapatılıp silindi.

Bilgisayarın sistem proxy yapılandırmasında etkin proxy yok. Onaylı şirket proxy adresi verilmediği için proxy üzerinden gerçek bağlantı test edilmedi. Proxy'nin CMA erişim engelini çözeceği iddia edilemez.

## Hazırlanan kontrol

`scripts/cma-bridge/probe.mjs` yalnız bağlantı teşhisi içindir; üretim iş kuyruğundan iş almaz. İsteğe bağlı `CMA_PROXY_URL` ile HTTP/HTTPS/SOCKS5 şirket proxy'si üzerinden aynı kontrol yapılabilir. Adres içinde kullanıcı adı, şifre, sorgu veya yol kabul edilmez. Proxy kimlik doğrulaması bu kontrolde desteklenmez. Oturum, çerez, sayfa içeriği ve hesap bilgileri raporlanmaz. Giriş ekranının erişilebilir olması hesap doğrulaması sayılmaz.

CMA, kuyruk ve konşimento akışıyla ilgili 75 test geçti. Bu testler gerçek otomatik CMA girişinin veya gönderimin çalıştığının kanıtı değildir.

## Sonraki koşul

- Şirketin onaylı proxy'si varsa önce salt okunur erişim testi yapılmalı; başarılı olursa ayrı hizmette giriş/oturum sürekliliği ayrıca doğrulanmalı.
- Sekmesiz kalıcı entegrasyon için CMA EDI/VERMAS erişimi değerlendirilmelidir. CMA'nın API SSS sayfası VGM gönderimini desteklemediğini belirtiyor; eBusiness açıklaması doğrudan EDI/VERMAS yolunu belgeliyor.
- Kaynaklar: https://api-portal.cma-cgm.com/faq ve https://www.cma-cgm.com/news/1199/cma-cgm-ebusiness-platform-is-now-fully-operational-to-handle-your-vgm-submission?cat=ebusiness

Çalışan T-MAXX, INTTRA, CMA eklentisi, üretim ayarları ve konşimento kodu değiştirilmedi. Bu kontrol aracı canlı uygulamaya dağıtılmadı. Mevcut eklentinin geçici sekme davranışı henüz kaldırılmadı; doğrulanmış bir alternatif olmadan otomatik bağlantı çalışıyor diye sunulmamalı.
