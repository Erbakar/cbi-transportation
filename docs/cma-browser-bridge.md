# Yerel CMA tarayıcı bağlantısı

## Hazırlanan akış

CBI ana sayfasında T-MAXX, INTTRA ve CMA bağlantı kartları bulunur. Sayfa açılışı dış platformlarda yeni oturum oluşturmaz; mevcut sunucu oturumunun süresini ve CMA yerel servis durumunu gösterir. Kartlar oturumun hazır olmasını gönderim başarısı olarak sunmaz.

CMA için ayrı yerel servis `127.0.0.1:18745` üzerinde çalışır. T-MAXX/INTTRA relay servisi ve bağlantı yöntemi değiştirilmez. Kullanıcıya bağlı sunucu ayarı, rastgele erişim anahtarı, Host ve Origin kontrolleri kullanılır. Kimlik bilgileri ve token istemci sayfasına dönmez. Servis yalnız okuma işi kabul eder.

Chrome eklentisi yalnız CMA sitesi ve yerel servis erişimini ister. Çerez, debugger veya bütün sitelere erişim izni istemez. Uygulamadaki okuma düğmesi, eklentiye VGM dashboard okuma işi bırakır. Eklenti aynı Chrome profilinde pasif bir geçici sekme açar, ilk liste sayfasının 9 sütununu okur ve yalnız açtığı sekmeyi kapatır. Orijinal CMA sekmesi ve diğer platform sekmeleri değiştirilmez. Herhangi bir VGM gönderimi, form doldurma veya arşiv yazma kodu yoktur.

Sonuç ilk sayfa olarak etiketlenir; toplam sayı ile getirilen satır sayısı ayrıdır. Armatör hesabının platformda kaydedilmiş şirket hesabıyla eşleşmesi bu sürümde doğrulanmaz. Bu nedenle VGM gönderimi kapalıdır. Sonuç ve eklenti kalp atışı eskidiğinde bağlı görünümü geçersizleşir.

## Kurulumun son adımı

Hazırlık: `node scripts/cma-bridge/setup.mjs` (özel paket `.private/cma-browser/extension` içinde oluşturulur). Paket kurulum anahtarı içerdiği için paylaşılmamalı ve sürüm kontrolüne eklenmemelidir.

Chrome'da yerel eklentinin yüklenmesi için kullanıcı onayı gerekir; bu, CMA site verilerine kalıcı erişim izni verir. Onaydan sonra `chrome://extensions` üzerinden Geliştirici modu → Paketlenmemiş öğe yükle → özel extension klasörü seçilir. Kurulum doğrulanmadan bu iş tamamlandı sayılmaz.

Yerel servis: `node scripts/cma-bridge/server.mjs`. Uygulama yalnız aynı bilgisayardaki servisle konuşur; üretim sunucusundan kullanıcının bilgisayarına bağlantı veya canlı dağıtım bu kurulumda yapılmaz. Chrome/servis kapalıysa bağlantı bekliyor görünür. Eklentinin ilk kalp atışı en geç yaklaşık 30 saniyede gelir; okuma 55 saniyede zaman aşımına uğrar. Eklenti açılmadan uçtan uca uygulama okuma doğrulanamaz.

## Kaldırma

Chrome'dan yalnız CBI CMA eklentisini kaldırın ve yalnız CMA yerel servisini durdurun. Yerel `.env.local` içindeki `CMA_BROWSER_KEY` ve `CMA_BROWSER_OWNER` alanlarını kaldırabilirsiniz. Diğer platform hesaplarına/oturumlarına dokunulmaz.

## 14 Ekim 2026 doğrulaması

- Ana sayfa Chrome'da görsel olarak kontrol edildi. T-MAXX ve INTTRA için “Oturum hazır”, CMA için “Yerel bağlantı bekliyor” doğru gösterildi.
- Yeni durum API'si oturumsuz isteği 401 ile reddetti; oturumlu kullanıcıya üç kart döndü.
- Yerel uygulama → CMA servisi gerçek çağrısında `extension_offline` alındı. Bu, servise erişildiğini ama eklentinin henüz kurulmadığını gösterir.
- Mevcut konşimento ve booking kayıtlarını okuma, giriş/çıkış, T-MAXX ve INTTRA oturum açma kontrolleri başarılı.
- 468 testlik tam seri başarılı; sonradan eklenen iki sahiplik/yönlendirme testi de başarılı. TypeScript kontrolü başarılı. Yeni/değiştirilen dosyalarda lint kontrolü uygulandı.
- Chrome eklentisinin kurulumu için kullanıcı onayı istendi; henüz yanıt yok. Eklenti yükleme ve uygulamadan gerçek CMA VGM okuma kabul testi tamamlanmış değildir.
- Gerçek VGM/konşimento gönderilmedi; üretime dağıtım yapılmadı.

## 15 Ekim 2026 kurulum sonrası kontrol

- Kullanıcı eklentiyi Chrome'a yükledi. Yerel uygulamanın oturumlu CMA durum isteği `extensionOnline: true` döndürdü.
- Uygulamadan VGM okuma isteği eklenti üzerinden tamamlandı, ancak `state: unavailable`, `connected: false` ve sıfır satır döndü. Bu sonuç başarılı VGM veri okuması sayılmaz.
- Aynı Chrome profilinde VGM sayfası ayrıca açıldığında CMA kimlik doğrulama giriş ekranına yönlendi; geçerli açık oturum bulunmadı. Kullanıcının CMA oturumunu yeniden açmasından sonra uçtan uca okuma tekrar doğrulanmalı.
- Yerel geliştirme sunucusundaki mevcut derleme hatası servis yeniden başlatılarak giderildi. Uygulama girişi 200, mevcut 6 konşimento kaydı okuma 200, T-MAXX ve INTTRA bağlantı doğrulamaları başarılı, test oturumu çıkışı 200.
- Konşimento veya VGM gönderilmedi; iş kayıtları ve bağlantı ayarları değiştirilmedi. Üretime dağıtım yapılmadı.

### Eklenti Reload sonrası

Kullanıcı eklentiyi yenilediğini bildirdi. Uygulama okuma isteği yine `unavailable` döndü. Yeni bir kontrollü okuma sırasında eklentinin açtığı geçici sekme doğrudan incelendi: `auth.cma-cgm.com` üzerindeki Welcome / Email / Password / Log in ekranındaydı. Bu nedenle sorun yalnız sütun eşleşmesi değildir; yeni arka plan sekmesinin geçerli oturuma erişimi doğrulanmamıştır. VGM okuması veya gönderimi başarılı sayılmaz. Bu kontrolde iş kaydı ve konşimento akışı değiştirilmedi.
