# KNS / MSC talimat akışı kontrolü — 27 Ekim 2026

Güncel durum: Kullanıcının mühür ve taşıyıcı konteyneri teyidi hakkındaki
talimatı uygulandı. İki mühür alanı boş olan canlı taslak `ready` durumunda;
eksik alan listesi boş. Gerçek gönderim yapılmadı. Ayrıntılar:
[İsteğe bağlı mühür değişikliği](optional-seals-2026-10-27.md).

Test, gerçek platform gönderimine kadar tamamlanmış sayılmaz. Belge yükleme,
okuma, T-MAXX pozisyon/yük eşleştirme, INTTRA seçeneklerini okuma ve gönderim
verisini hazırlama aşamaları incelendi. Gerçek HBL/MBL gönderimi yapılmadı.

## Kapsam ve kaynak

- T-MAXX: `se261000754` → `S.E.26.10.00754`.
- Booking: `EBKG19125349`; MBL: `MEDUJX351995`; taşıyıcı: MSC.
- Kaynaklar: kullanıcı mesajı ve KNS TAL (1).pdf / KNS TAL (2).pdf.
- CBI taslağı: `9541e28c-2ed7-40a6-821b-dbd1098ba844`.
- Canlı taslak: https://cbi-transportation.kadirerbakar.workers.dev/bills?record=9541e28c-2ed7-40a6-821b-dbd1098ba844

| Konteyner | HBL | Paket | Brüt kg | Net kg |
| --- | --- | ---: | ---: | ---: |
| MSNU8644653 | 1046445 | 744 | 23320 | 22893.36 |
| MSMU5684659 | 1046446 | 771 | 22450 | 21979.98 |
| Toplam | | 1515 | 45770 | 44873.34 |

## Düzeltilen sorunlar

1. Kısa T-MAXX referansı girişte, kaynak sorgusunda ve mükerrer kayıt
   kontrolünde aynı standart biçime dönüştürülüyor. Yalnız biçim değişince
   booking/MBL gibi girilmiş bilgiler silinmiyor. Gerçek referans değişiminde
   bulunmayan INTTRA alanları eksik bir nesneye dönüştürülmüyor.
2. Ayrı konteynerlere ait HBL toplamları birbirleriyle çelişki sayılmıyor.
   Eksiksiz ve çakışmayan konteyner kapsamları toplanıyor; aynı kapsamdaki
   çelişkiler, eksik/çakışan kapsamlar ve farklı genel toplamlar durduruluyor.
3. Aynı isimli limanlar arasında T-MAXX ülke/liman koduyla seçim yapılıyor.
   Bu kayıtta `CLSAI` ile Şili / San Antonio seçildi. Belirsiz eşleşme otomatik
   seçilmiyor.
4. T-MAXX'in mevcut HBL sorgusunda dönen başarılı boş yanıtı, Content-Type
   başlığı olmasa da HBL henüz yok olarak yorumlanıyor. Bu istisna yalnız
   ilgili GET adresine ait; HTML giriş sayfaları ve diğer hatalar reddediliyor.

## Bu taslakta kaynakla karşılaştırılarak yapılan düzeltme

PDF'lerde beyaz zemine beyaz yazılmış `PVC PROFILE` ve `401693002200`
satırları var. Otomatik okuyucu bu görünmeyen metni de alabiliyor veya HS
alanını boş bırakabiliyor. Görünen sayfalar kontrol edilerek bu taslağın ürün
açıklamaları ve HS kodları düzeltildi. Orijinal belgeler korunuyor.

MSMU5684659 için görünen kodlar: `391620000000`, `392590800000`,
`830249000000`. MSNU8644653 için: `391620000000`.

Bu kayıt düzeltmesi, görünmeyen PDF metinlerini her belgede otomatik ayıklayan
genel bir çözüm değildir. Görsel kontrol ihtiyacı devam ediyor.

## Doğrulama ve sınırlar

- 613 otomatik test başarılı; TypeScript ve üretim derlemesi başarılı.
- Gerçek T-MAXX ve INTTRA hesaplarıyla yeniden giriş başarılı.
- CBI giriş/çıkış başarılı; çıkış sonrası korunan veri isteği 401 döndü.
- Önceden bulunan iki tamamlanmış kaydın görünümü test öncesiyle aynı.
- Canlı taslak yeniden okunup kaydedildi; toplamlar ve HBL eşleşmeleri doğru.
- Gerçek verilerle hazırlık eksik mühür/teyit alanlarında duruyor.
- Ayrı yerel tanılama kopyasında `TEST-ONLY-*` mühürleri, `99999` posta kodu,
  FCL ve taşıyıcı mühür sahibi varsayımlarıyla T-MAXX aktarım planı ve INTTRA
  verisi hazırlandı. Bu örnek değerler canlı taslağa veya platformlara yazılmadı.
- INTTRA review/submit, T-MAXX kaydetme ve HBL oluşturma çalıştırılmadı.
  Armatör kabulü, gerçek yazma sonuçları ve belge geri indirme doğrulanmadı.

## İlk kontrolden sonra tamamlananlar

Kullanıcı FIRAT posta kodunu **34537** olarak bildirdi. İki HBL için ortak
gönderen adresine kaydedildi ve canlı kontrol tekrar çalıştırıldı; iki posta
kodu uyarısı kalktı. Diğer kayıtların değişmediği doğrulandı.

- Kullanıcı mühür numaralarının zorunlu olmamasını istedi; bu zorunluluk
  kaldırıldı. Mühür girilmediğinde mühür sahibi de istenmiyor.
- FCL / Carrier Supplied akışında ayrı teyit kutusu kaldırıldı.

Canlı taslak `ready` durumunda; iki platformun sonucu `waiting`.
Gerçek gönderim, proje kuralı gereği ayrıca kullanıcı talimatı gerektirir.

## Geri dönüş ve kanıtlar

Başlangıç canlı sürümü `9695c7bb-78df-457f-bb19-059a8f0a9434` idi.
İlk testin sonunda dağıtılan sürüm: `3c89532c-6e89-459d-93d2-c425c2c5ee5d`.
Sonraki mühür değişikliği yukarıdaki güncel durum bağlantısında kayıtlıdır.
236 dağıtım modülünün yerel önceki derlemeyle aynı olduğu doğrulandı ve
özel çalışma klasörüne yedeklendi. Hesaplar, bağlantı adresleri, sırlar ve
veritabanı yapısı değiştirilmedi; dağıtımda mevcut değişkenler korundu.

Özel test çıktıları, kaynak inceleme verileri ve ekran görüntüsü
`.private/kns-e2e-2026-10-27/` içinde tutulur; sürüm kontrolüne dahil edilmez.
