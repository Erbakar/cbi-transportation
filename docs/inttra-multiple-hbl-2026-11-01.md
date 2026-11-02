# INTTRA çoklu HBL kontrolü — 1 Kasım 2026

## Bulgular

1046446 için taraf bilgilerinin INTTRA ekranında boş göründüğü bildirildi. Kayıtlı kontrol/gönderim verisi ile orijinal INTTRA kaydı (551274342) salt okunur karşılaştırıldı: 1046445 ve 1046446 için gönderen, alıcı ve notify alanları her iki kaynakta da dolu. Bu, ekranın hangi adımda boşaldığını tek başına açıklamaz.

30 Ekim revizyonu 551567711, aynı booking ve orijinal SI ile ilişkilidir; platform geçmişinde taşıyıcı yanıtı ACCEPTED. İkinci HBL'nin bu revizyondaki tarafları kullanıcının paylaştığı elle doldurulan ekranla örtüşüyor. Hiçbir talimat, adres veya revizyon değiştirilmedi ya da yeniden gönderilmedi.

Kesin uygulama kusuru: çoklu HBL oluşturulurken boş modelin DirectShipment MessageType alanı korunuyor ve yanına ConsolidatedShipment ekleniyordu. Orijinal INTTRA kaydında iki çelişen MessageType da bulunuyor. INTTRA'nın kendi form kodu yeni bir alan eklemek yerine mevcut MessageType seçimini değiştiriyor. Bu uyumsuzluk düzeltildi; bildirilen ekran boşalmasıyla nedensel ilişkisi henüz yeniden üretilmedi.

## Değişiklik

- Çoklu HBL için mevcut MessageType tek bir ConsolidatedShipment değerine dönüştürülür; taşıyıcı ve uyumluluk alanları korunur.
- Kontrol öncesi ve sonrasında her konteyner/mal kalemi/HBL eşleşmesi ile üç gerçek tarafın ayrı adres alanları karşılaştırılır. İkinci veya sonraki HBL'deki kayıp bilgi, HTTP başarılı olsa bile gönderimi durdurur.
- INTTRA'nın nesne anahtarlarını yeniden numaralandırması, sayısal kimlikleri metne çevirmesi ve serbest CompanyAddress alanını kaldırması desteklenir. Ayrı Street/City/Zip/CountryGeoId alanları esas alınır.
- Eski çoklu HBL kontrol önbelleği yeni eşleme sürümüyle yenilenir. Önceki kontrolün uyarı onayı yeni kontrol için otomatik kullanılmaz. Tek HBL akışının kontrol özeti değişmez.
- Tamamlanmış kayıtlar, mevcut gönderimler, T-MAXX, oturumlar ve bağlantı ayarları değiştirilmez.

## Doğrulama kapsamı

79 ilgili otomatik test ve TypeScript denetimi başarılı. Mevcut talimat verileriyle yerel olarak yeniden hazırlanan taslakta tek MessageType ve iki eksiksiz HBL doğrulandı; adres alanları orijinal INTTRA kaydıyla aynı kaldı. Derleme, canlı uygulamada giriş–kayıtları okuma–çıkış kontrolleri başarılı. Üç mevcut kayıt görüntüleniyor. Kayıt, teslimat, kontrol ve INTTRA adım satırları ile tüm servis bağları önceki halleriyle aynı.

Canlı sürüm: `16bea084-ef4d-472f-8cf1-b6f0dcf197c6`. Önceki sürüm `54d4698f-723c-4294-b8bd-15b610f88f70` kaynak yedeği alındı; 237 modülün yerel önceki derlemeyle aynı olduğu doğrulandı.

Yeni gerçek konşimento gönderimi, kayıtlı talimatı değiştirme ve armatöre yeniden gönderim yapılmadı. Kullanıcı daha sonra boş alanları mevcut talimatı açtığında gördüğünü belirtti.

## Mevcut talimat açılışının ek kontrolü

1 Kasım'da INTTRA tarayıcı oturumu üzerinden Company Shipping Instructions listesindeki EBKG19125349 / 551274342 kaydı View ile açıldı. Güncel 2.0 sürümünde iki HBL'nin üç tarafı da görünür. History üzerinden 27 Ekim tarihli 1.0 sürümü ayrıca açıldı: 1046446'nın gönderen, alıcı ve notify adı, sokak, bina numarası, şehir, ülke ve posta kodu burada da dolu. Bu, yalnızca API verisi değil, INTTRA'nın kendi görüntüleme ekranında doğrulandı.

Düzenleme ekranını kontrol etmek için Amend penceresi açıldı; bu işlem ilk sürüm seçili olsa da son sürümü yüklüyor. İkinci konteynerin 1046446 HBL düğmesi açıldığında üç gerçek tarafın alanları dolu: değerler 30 Ekim'deki elle düzeltilmiş sürümle aynı. Hiçbir alan değiştirilmedi, Save / Save Draft / Review / Submit kullanılmadı. HBL penceresi Cancel ile, kontrol sekmesi de kaydedilmeden kapatıldı.

Dolayısıyla eski düzenleme penceresindeki boşalma bu denemede yeniden üretilemedi. Son sürümün dolu açılması, 1 Kasım'daki gönderim türü düzeltmesinin geçmişte bildirilen boşalma sorununu kesin çözdüğünü kanıtlamaz. Bu takipte uygulama koduna veya canlı sürüme ek değişiklik yapılmadı.
