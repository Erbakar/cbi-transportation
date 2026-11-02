# İsteğe bağlı mühür — 27 Ekim 2026

Kullanıcı mühür numarasının zorunlu olmamasını ve standart FCL / taşıyıcı
konteyneri için ayrıca teyit istenmemesini istedi.

## Davranış

- Formdaki mühür alanı isteğe bağlı. Boş bırakmak için ayrıca kutu işaretlemek
  gerekmiyor. Kaynakta bulunan bir mührü özellikle kullanmama seçeneği korunuyor.
- Eksik mühür numarası doğrulamayı durdurmuyor; girilmiş ama kaynağı belirsiz
  mühür değerleri hâlâ kontrol ediliyor.
- Mühür yoksa INTTRA verisinde `ContainerSeals` boş nesne. Yerine geçecek
  sahte mühür değeri üretilmiyor. Mühür varsa sahibi seçilmeli.
- T-MAXX aktarım planında eksik mühür için `sealNo` değişikliği üretilmiyor.
  Kaydetme öncesi yeniden okunan mevcut mühür korunuyor. Yalnız açıkça
  seçilen mühür kullanmama işlemi mevcut değeri boşaltıyor.
- Desteklenen FCL / Carrier Supplied akışı otomatik uygulanıyor; ayrı teyit
  kutusu ve engelleyici kontrol kaldırıldı. Eski kayıtların `standardFcl`
  alanı biçim uyumluluğu için korunuyor ve hazırlanırken normalleştiriliyor.

## Doğrulama

618 otomatik test, TypeScript kontrolü ve üretim derlemesi başarılı.
Testler mühürsüz tek/çoklu kayıtları, mevcut mührün korunmasını, önizleme
sonrası değişen mühürleri ve verilmiş belirsiz mühürlerin engellenmesini içerir.

Gerçek `S.E.26.10.00754` taslağı ve gerçek platform seçenekleri kullanılarak,
örnek mühür ya da posta kodu eklemeden T-MAXX aktarım planı ve INTTRA verisi
hazırlandı. Canlı uygulamada `check` işlemi sonrası durum `ready`, eksikler
`[]`, iki mühür de `null`. Booking, MBL, HBL eşleşmeleri, ürün düzeltmeleri ve
`34537` posta kodu korundu. Önceden bulunan iki tamamlanmış kayıt değişmedi.

CBI giriş/çıkış doğrulandı; çıkış sonrası korunan veri isteği 401 döndü.
Canlı kontrol T-MAXX ve INTTRA bağlantılarını kullandı; ikisi de hazır.
Tarayıcıda isteğe bağlı mühür alanları ve aktif aktarım düğmesi görüldü.

INTTRA review/submit, T-MAXX kaydetme ve HBL oluşturma yapılmadı. Hazır
durumu armatörün talimatı kabul ettiğinin veya gerçek aktarımın kanıtı değildir.

## Dağıtım

- Önceki sürüm: `3c89532c-6e89-459d-93d2-c425c2c5ee5d`.
- Yeni sürüm: `86519332-029a-4719-b273-d570cdc3a60b`.
- Önceki 237 dağıtım modülü yerel önceki derlemeyle karşılaştırılıp yedeklendi.
- Hesaplar, bağlantı ayarları ve veri yapısı değiştirilmedi; mevcut dağıtım
  bağlantıları korundu.
- Özel test çıktıları ve ekran görüntüsü:
  `.private/optional-seals-2026-10-27/` (sürüm kontrolü dışında).
