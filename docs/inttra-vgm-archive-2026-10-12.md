# INTTRA VGM ve operasyon arşivi — 12 Ekim 2026

## Kapsam

İlk faz INTTRA kullanan armatörler. Diğer armatör portalları sonraki fazda. Finans yazma kapsamda kalır; finans departmanı yanıtını bekler.

## Yerelde geliştirilen arşiv akışı

Belge yönetimine HBL müşteri onayı, pre-alert ekranına pre-alert arşiv yükleme alanı eklendi. Desteklenen dosyalar PDF/PNG/JPEG, en fazla 10 MB; e-postanın PDF çıktısı kullanılabilir. EML üretimi veya e-posta gönderimi bu alanın işi değildir.

Türler güncel T-MAXX kataloğundan DOM (Müşteri Draft Onay Maili) ve PRA (Pre Alert) kodlarıyla tekil olarak çözülür. Türler bulunamazsa, dosya bağlı değilse veya hedef kilitliyse aktarım durur. Yerel dosya korunur; ağ sonucu belirsizse aynı yükleme tekrar edilmez. Arşivi salt okunur kontrol ederek kurtarma mevcut mekanizmayla yürütülür.

Arşivleme konşimento onayı, final seçimi veya e-posta gönderimi oluşturmaz. Konşimento/HBL/MBL işleyişi ve ortak aktarım servisleri değiştirilmedi. INTTRA relay’e yalnız sabit hesap-menüsü GET isteğini yapan /vgm-access yolu eklendi. Önce ayrı yerel test sürecinde mevcut SI seçenek okuması ve yeni menü okuması doğrulandı; sonra mevcut yönetilen relay yeniden başlatıldı. SI izinli yolları, gönderim gövdesi ve belge üretimi değiştirilmedi.

## VGM engeli

Mevcut kayıtlı INTTRA hesabıyla kimlik doğrulama ve web oturumu başarılı. 12 Ekim tarihli salt okunur `auth/menus/menu-items` yanıtında Shipping Instructions ve Bill of Lading mevcut; eVGM öğesi yok. Bunun kesin nedeni menü yanıtından anlaşılamaz; hesap yöneticisi ürün aboneliği ve kullanıcı yetkisini doğrulamalı.

Uygulamaya hesabın menüsünü salt okunur kontrol eden VGM erişim düğmesi eklendi. Menüde VGM belirse bile gönderim sözleşmesi/alanları ve alındı doğrulaması henüz tamamlanmadığından otomatik gönderim kapalı kalır. Bu çalışma VGM gönderim entegrasyonunun tamamlandığı anlamına gelmez. Mevcut MBL/SI gönderim yolu üzerinden VGM gönderilmeye çalışılmadı.

Resmî referanslar:
- https://www.inttra.com/wp-content/uploads/inttra-resources/INTTRA%20evgm%20Quick%20Start%20Guide.pdf
- https://www.inttra.com/wp-content/uploads/2019/02/MyAdmin-User-Mgmt-Guide.pdf

## Kontroller

455 test başarılı; TypeScript, değişen dosyaların lint kontrolü ve üretim derlemesi başarılı. Gerçek VGM/konşimento veya T-MAXX arşiv belgesi gönderilmedi. Canlı yayın ve veri migrasyonu yapılmadı. Tarayıcı ekran kontrolü tarayıcı URL güvenlik politikası engeli nedeniyle tamamlanamadı; bu engel dolanılmadı. Gerçek arşiv yazma kabulü bekliyor.

## Mevcut bağlantının onarımı ve servis kabulü

Kontrolde mevcut tünel servisi durmuş, dış adresi DNS üzerinde çözümlenemiyordu; yerel relay sağlık kontrolü 200 idi. Mevcut .env ve relay yapılandırması özel dizine yedeklendi, önceden kurulu yönetilen tünel yeniden başlatıldı. Servis yeni adresi mevcut yöntemiyle yerel ayarlara ve canlı Worker INTTRA_RELAY_URL sırrına eşitledi. Uygulama kodu canlıya yayımlanmadı; bağlantı adresi onarıldı.

Yerel servis üzerinden giriş/çıkış, mevcut konşimento listesi ve operasyon arşivi GET 200; VGM erişim GET 200, available=false, submissionEnabled=false. Böylece güncel uygulama hesabında da menü eksikliği doğrulandı. Yerel pilot booking bağlı olmadığı için gerçek arşiv yazma yapılmadı.
