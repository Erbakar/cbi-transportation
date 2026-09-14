# CBI Transportation

Talimat yükleme, anlamsal alan çıkarma, T-MAXX/HBL ve INTTRA/MBL talimat aktarım uygulaması. Landing page yoktur. Kullanıcı adı/şifreyle giriş, kalıcı D1 kayıtları ve özel R2 dosyaları vardır.

## Çalışan bölümler

- PDF, DOC, DOCX, PNG, JPEG sürükle-bırak yükleme, içerik imzası ve 10 MB sınırı.
- PBKDF2 şifre doğrulama, HttpOnly oturum, çıkışta iptal, giriş deneme sınırı, aynı-kaynak yazma kontrolü.
- Talimat listesi, arama/durum filtreleri, alan kaynakları, ayrıntı ve platform bazında sonuç.
- Aynı dosyayı yeniden yüklemede mevcut kayda yönlendirme, düzeltilmiş belge revizyonları.
- Responses API ile JSON Schema çıkışı, anlamsal alan ayrımı, çoklu konteyner ve mal kalemlerini koruma.
- Eksik alan, düşük güven, yarım adres, description/ağırlık karışması, net/brüt, kap ve ağırlık toplamları, konteyner kontrol basamağı doğrulamaları.
- Tüm hedefler hazır olmadan yazmayan ön kontrol, atomik işlem kilidi, platform başına sonuç, booking/konteyner bazında mükerrer koruması.
- Belirsiz yanıtı otomatik tekrar yazmama, doğrulanmış sorgu sözleşmesiyle mevcut kaydı uzlaştırma.

## Henüz doğrulanmayan dış bağımlılıklar

Gerçek platform yazma entegrasyonu tamamlanmadı. T-MAXX ve INTTRA giriş ve oluşturma servis sözleşmeleri, gerekli alanlar/kod listeleri ve başarı yanıtları oturum açılmış ekranlardan doğrulanmalıdır. `PLATFORM_CONTRACTS=[]` halinde uygulama açıkça bağlantı bekler; sahte başarı üretmez. T-MAXX portalı mevcut örnekte HTTP olduğu için güvenli HTTPS erişimi veya güvenli bağlantı çözümü gerekir. INTTRA portalının çerez/SSO giriş akışı ayrıca çözülmelidir; mevcut JSON token adaptörü desteklenmeyen SSO akışını taklit etmez.

Gemini `gemini-3.1-flash-lite`, Hubpixel ile aynı yetkilendirilmiş Google projesi üzerinden kullanılır. 605 talimat.pdf ile gerçek model isteği başarılı oldu; ürün açıklaması ayrı alana çıkarıldı. Gemini okuma yolu PDF, PNG, JPEG ve WebP kabul eder. DOC ve DOCX belgelerinin metni sunucuda çıkarılarak aynı modele gönderilir. REMA TIP TOP örnek DOC ile gerçek okuma testi başarılıdır; okunamayan veya şifreli belgeler aktarılmaz. Modelin kendi güven puanı doğruluk kanıtı değildir; kaynak ve alan kuralları ikinci kontrolü sağlar. Canlı pilotta operasyondan onaylı beklenen sonuçlarla ayrıca karşılaştırılmalıdır.

## Yerel kullanım

1. `npm run install:ci`
2. `node scripts/configure-admin.mjs` yalnızca ayar yoksa `.env.local` ve `.private/ilk-giris.txt` oluşturur.
3. `.env.local` içine Gemini anahtarı ve doğrulanmış platform sözleşmelerini ekleyin. Anahtarları sohbet, Git veya tarayıcı depolamasına koymayın.
4. `npm run build`, ardından eksik yerel D1 migration dosyalarını README altındaki komutla sırayla uygulayın.
5. `npm run dev`.

Yerel migration örneği:

```
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_supreme_grey_gargoyle.sql
```

Her migration yalnızca bir kez uygulanır. İkinci migration `0001_high_vertigo.sql` aynı yöntemle uygulanır. Canlı migration'lar Sites yayını tarafından uygulanır.

## Servis sözleşmeleri

`lib/server/platforms.ts` içindeki Contract tipi, sunucu ayarından okunan doğrulanmış bağlantı sözleşmesini tanımlar. Kullanıcı belgesi URL, kimlik bilgisi veya endpoint belirleyemez. `verified` yalnızca gerçek giriş/create/lookup istekleri incelendikten sonra açılmalıdır.

- `origin`: HTTPS platform servis kökü.
- `auth`: doğrulanmış JSON giriş yolu, gerekiyorsa giriş şablonu, `$env:TMAXX_USERNAME` gibi sunucu sırlarına referanslar, token yanıt yolu ve çerez gereksinimi.
- `create`: gerçek yol/metot, gerçek hedef şema, platforma özgü zorunlu alanlar, tam başarı değeri ve kayıt referansı yolu.
- `body`: `$field:shipperName`, `$number:grossWeightKg` gibi deterministik alan eşlemeleri. Çoklu satırlar için `{"$each":"containers","template":{...}}` veya `cargoLines`.
- `lookup`: belirsiz sonucun tekrar yazmadan doğrulanması için yol, referans ve kaynak alanlarıyla tam eşleşme kuralları.
- Platform kodları ve HBL/MBL taraf rolleri sözleşme tarafından doğrulanmalı. Model eksik MBL taraflarını HBL'den kopyalamaz.

Yeni platformlar `PLATFORM_CONTRACTS` içine ayrı kimlikle eklenir. Varsayılan hedefler T-MAXX/HBL ve INTTRA/MBL'dir. Henüz gerçek JSON sözleşmesi bulunmadığı için bu depoda örnek endpoint uydurulmamıştır.

## Doğrulama

- `npx tsc --noEmit`
- `node --experimental-strip-types --test tests/domain.test.mjs`
- Yerel sunucu ve başlangıç hesabı ile `node tests/http-smoke.mjs`. Test yalnızca yerel uygulamada verilen PDF'yi yükler ve revizyon oluşturur; model anahtarı bulunmadığına dair beklenen güvenli duruşu test eder. Gerçek platformlara istek göndermez. Kaynak dosya yolları bu çalışma bilgisayarına aittir.

WebMCP, destekleyen tarayıcılarda yalnızca kayıt arama aracı sunar. Sunucu her istekte oturum kontrolünü korur. WebMCP tarayıcı kontratı ayrıca doğrulanmalıdır.

Model dosya girişi: https://developers.openai.com/api/docs/guides/file-inputs
Yapılandırılmış çıktı: https://developers.openai.com/api/docs/guides/structured-outputs

## Kendi Cloudflare hesabında elle yayınlama

`wrangler.production.json` bağımsız CBI Workers, D1 ve özel R2 kaynaklarını tanımlar. Git entegrasyonu veya otomatik yayınlama iş akışı kurulmaz. GitHub push işlemi yayınlama tetiklemez.

- `npm run db:migrate:cloudflare`: yalnızca gerekli veritabanı şeması güncellemeleri.
- `npm run deploy:cloudflare`: derleme ve açıkça istenen sürümü yayınlama.
- APP_PASSWORD_HASH, ENCRYPTION_KEY, GEMINI_API_KEY ve PLATFORM_CONTRACTS sunucu secrets olarak yüklenir.
- Mevcut Sites veritabanı ve dosyaları bu ayrı hesaba kendiliğinden taşınmaz.
