# CMA CGM bağlantısı — 14 Ekim 2026

## Durum

Otomatik CMA CGM oturumu **kurulmadı**. Yerel uygulamanın sunucusundan Customer Hub adresine yapılan GET, 403 döndü (JavaScript isteyen koruma sayfası). Parola bu istekte gönderilmedi. Kullanıcının Chrome oturumunun açık olması, sunucu oturumunun kanıtı değildir. Koruma aşılmadı, tarayıcı çerezleri kopyalanmadı. Desteklenen giriş yöntemi veya CMA tarafından sağlanan entegrasyon erişimi doğrulanmadan gönderim açılmamalı.

Şirket hesabı mevcut AES-GCM formatıyla, kullanıcıya ait `cma-cgm` anahtarında **yerel** veritabanına kaydedildi. Şifreli kaydın kaynak dosyadaki değerlerle eşitliği doğrulandı; geçici dosyadaki açık bilgiler temizlendi. Üretime dağıtım/hesap aktarımı yapılmadı.

## Değişiklikler

- `/api/carriers/cma-cgm`: oturum sahibi bazında durum, şifreli hesap kaydı ve kimlik bilgisi göndermeyen erişim kontrolü. Değiştiren isteklerde aynı kaynak kontrolü ve gövde sınırı uygulanır.
- VGM ekranında ayrı CMA hesabı bölümü. Durum hiçbir zaman yalnız HTTP 200 veya kayıtlı parola üzerinden bağlı/aktarılabilir sayılmaz.
- T-MAXX/INTTRA hedefleri, ayarları ve konşimento gönderim kodu değiştirilmedi. Eski oturumlar CMA hesabı kaydı sırasında silinmez.
- Daha önce hazırlanan pre-alert pozisyon hedefi değişikliğinin 0022 şeması, çalışan yerel DB'de eksikti. Yedek alındı, yalnız ek sütunlar/güncelleme uygulandı; eski arşiv satırlarının tüm eski sütunları önce/sonra karşılaştırılarak korundu. Arşiv GET tekrar 200 verdi. Üretim şeması değiştirilmedi.

## Toplantıdan doğrulananlar

- CMA VGM formu: booking, konteyner, VGM (elle giriliyor), dara, ölçü birimi, SM1/SM2 yöntemi, imzalayan kişi, varsa sertifika.
- Kullanıcının yaptığı gönderim ekranda gönderildi/onay bekliyor sonucunu verdi; bu sonuç armatör kabulü değildir.
- Pre-alert T-MAXX dijital arşivinde pozisyon altında: `PRA - Pre Alert`, `618.pdf`, `SeaPosition`, pozisyon ID 451034953, belge ID 451299049. “Yük Evrakı mı?” Hayır. HBL onayı için mevcut yük hedefi korunur.
- Gönderim anının tam ağ kaydı/HAR mevcut değil. Otomatik login, VGM gönderme ve sonuç sorgulama sözleşmesi doğrulanmış sayılmaz.
- Finans otomasyonu kullanıcının toplantı sırasındaki talimatıyla kapsamdan çıkarıldı; mevcut finans kayıtlarına müdahale edilmedi.

## Kontroller

- 465 otomatik test başarılı; bunlara CMA şifreleme, kullanıcı yalıtımı, mevcut oturumların korunması ve sahte bağlantı başarısı üretmeme testleri dahil.
- TypeScript kontrolü ve üretim derlemesi başarılı.
- Yerel giriş/çıkış, kayıt ve booking listesi, T-MAXX ve INTTRA gerçek oturum açma kontrolleri başarılı. T-MAXX port okuması başarılı.
- Önceden bilinen INTTRA eVGM erişim eksikliği devam ediyor.
- Gerçek konşimento, VGM veya arşiv gönderimi yapılmadı. Bu kontroller uçtan uca canlı gönderim kabul testi değildir.

## Ayrı arka plan tarayıcısı kontrolü

Kullanıcının arka plan tarayıcısı talebi üzerine, kurulu Chrome standart Puppeteer ayarlarıyla ayrı ve geçici bir oturumda başlatıldı. Kullanıcının normal Chrome profili ve INTTRA tarayıcısı kullanılmadı. Customer Hub gezinmesi HTTP 403 döndürdü; giriş alanı bulunmadı. Parola gönderilmedi, CAPTCHA çözülmedi, koruma gizleme/aşma ayarları uygulanmadı ve tarayıcı kapatıldı. Bu deneme bağlantı başarısı değildir.

INTTRA girişinin mevcut uygulaması API/SSO üzerinden çalışır (`inttra-session.mjs`); `inttra-document.mjs` yalnız mevcut INTTRA oturumuyla belge çıktısını ayrı tarayıcıda üretir. Dolayısıyla INTTRA'nın tarayıcı kullanması, CMA girişinin aynı yöntemle çalıştığının kanıtı değildir.

Resmî alternatif kontrolü:
- https://api-portal.cma-cgm.com/faq — VGM gönderimi için API desteği şu anda belirtilmiyor; web/marketplace öneriliyor.
- https://www.cma-cgm.com/products-services/ecommerce/edi-api-channels/EDI-catalog — VGM için EDIFACT VERMAS üzerinden EDI destekleniyor. Şirketin EDI bağlantısı/onboarding bilgileri mevcut değil. Bu alternatif otomatik olarak etkinleştirilmedi.

Bu takipte uygulama kodu, çalışan bağlantı ayarları ve konşimento kayıtları değiştirilmedi.

## Açık Chrome oturumuyla deneme — 14 Ekim 2026, 17:06 Türkiye saati

Kullanıcının açık CMA oturumunu kullanma talebiyle aynı Chrome profilinde ayrı bir sekme açıldı. Orijinal VGM sonuç sekmesi korunarak `/ebusiness/vgm/declaration` açıldı: booking, konteyner, VGM, gross weight, kişi, yöntem ve sertifika alanları erişilebilirdi. Form doldurulmadı/gönderilmedi.

Sayfadaki “Consult VGM dashboard” bağlantısı üzerinden `/ebusiness/vgm` açıldı. Liste yüklendi, “Showing 1 to 10 of 65” görüldü; booking, cutoff, VGM status, container, tare, integrated VGM, signature, sending date ve incoming channel sütunları okundu. Böylece mevcut, oturum açılmış Chrome üzerinden form ve kayıt okuma erişimi doğrulandı.

Bu sonuç yeni/boş headless profilinin 403 sonucundan farklıdır; farkın yalnız hangi çerez veya tarayıcı sinyalinden kaynaklandığı belirlenmedi. Açık oturumla erişim mümkün olduğu için önceki notlardaki dış erişim izninin tek çözüm olduğu yorumu kesin değildir.

Bu deneme Codex'in yetkilendirilmiş tarayıcı aracıyla yapıldı. CBI sunucusunun aynı oturumu otomatik kullanabildiği anlamına gelmez. Uygulama için ayrıca dar kapsamlı yerel tarayıcı bağlantısı, oturum sona ermesi davranışı ve gönderim/okuma doğrulaması gerekir. Çerezler dışarı çıkarılmadı; T-MAXX/INTTRA kodu, ayarları ve oturumları değiştirilmedi. Gerçek VGM/konşimento gönderimi yapılmadı.
