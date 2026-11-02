# INTTRA booking doğrulaması — 1 Kasım 2026

## Bulgular

`EBKG19125349` için eski SI `review` servisi `10136` uyarısını döndürüyor.
INTTRA My Bookings ekranı ve güncel booking servisi ise aynı kaydı onaylı
gösteriyor: INTTRA referansı `2121554905`, MSC `800541`, CBI `856675`,
MBL `MEDUJX351995`, konteynerler `MSNU8644653` ve `MSMU5684659`.
Arama yanıtında kayıt `channel=EDI`, `nonInttraBooking=true`,
`coreBooking=false` olarak işaretli. Bu, iki servisin sonuçlarının farklı
olduğunu gösterir; INTTRA'nın iç arama uygulamasının nedeni doğrulanmış değildir.

## Düzeltme

- Yalnızca `10136` geldiğinde mevcut bağlantı hizmeti üzerinden güncel booking
  kaydı salt okunur sorgulanır. Hesap veya bağlantı adresi değiştirilmez.
- Tek bir kesin booking/taşıyıcı eşleşmesi, hesaba ait onaylı güncel sürüm,
  MBL ve konteyner kümesi birlikte doğrulanır. EDI kayıtlarında sürüm numarası
  hep 1 olabildiği için güncellik denetiminde denetim kaydının zamanı kullanılır.
- Doğrulanan `10136` aktarımı durduran uyarılardan çıkarılır. Orijinal uyarı
  ve doğrulama kanıtı aktarım adımı günlüğünde saklanır. Gönderilecek SI yükü
  değiştirilmez. Diğer uyarılar mevcut açık onay akışında kalır.
- Sorgu başarısızsa, kayıt iptalse, birden fazla eşleşme varsa veya bilgiler
  uyuşmuyorsa uyarı korunur. Genel amaçlı dış servis erişimi eklenmemiştir.
- Eski ön kontroller yeni doğrulama sürümüyle yenilenir; eski onay yeni
  veya değişmiş uyarılara taşınmaz. Tamamlanmış kayıtlar değiştirilmez.

## Doğrulama

Gerçek kayıtla gönderim öncesi kontrol başarılı: ham yanıtta `10136` mevcut,
ikincil kontrolde booking doğrulandı, kalan uyarı sıfır, iki HBL'nin bütünlük
kontrolü başarılı. Gerçek gönderim veya T-MAXX kaydı yazma işlemi yapılmadı.
725 test, TypeScript kontrolü, değişen çalışma kodunda lint ve derleme geçti.
Üretim öncesi kaynak/ayar/veri kopyaları `.private/inttra-booking-warning-2026-11-01/`
altında tutulur; sırlar sürüm kontrolüne eklenmez.
