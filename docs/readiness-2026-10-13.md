# 14 Ekim toplantısı öncesi hazırlık — 13 Ekim 2026

## Tamamlanan işler

- HBL müşteri onayı / pre-alert arşiv ekranında boş dosya, 10 MB sınırı, uzantı ve dosya imzası gönderim öncesinde kontrol ediliyor. Mevcut sunucu kontrolü korunuyor.
- Dosya seçimi sırasında eski doğrulama sonucu yeni seçimi ezemiyor; farklı booking veya arşiv amacına geçildiğinde form sıfırlanıyor.
- Aktarım devam ederken ikinci istek engelleniyor. Hata yanıtından sonra kayıt listesi yeniden okunuyor; liste okunamazsa aktarım kontrolleri kapalı kalıyor.
- Doğrulanmış / bekleyen / sonucu belirsiz kayıt sayıları, sürüm ve Türkiye saatine göre doğrulama zamanı gösteriliyor. Listeyi elle yenileme eklendi.
- Başarı mesajı yalnız açık `synced` ve uzak kayıt kimliğiyle gösteriliyor; eksik yanıt başarı olarak sunulmuyor. Mevcut belirsiz sonuçta tekrar göndermeme ve salt okunur kurtarma korunuyor.
- Gerçek belge yaşam döngüsü ve pre-alert servislerini aynı geçici veritabanı ve belge deposunda çalıştıran ortak test eklendi. Onaylı HBL/MBL pakete giriyor; HBL okuması değişince eski paket indirme/gönderim kaydı engelleniyor; kontrol listesini yeniden kaydetmek tek başına eski onayı geçerli kılamıyor. Harici kontrol değerlendirmesi test verisidir.
- Yerel uygulama 5174 portunda yeniden başlatıldı.
- Tekrar çalıştırılabilen `scripts/readiness-check.mjs` eklendi. Yalnız yerel uygulamaya bağlanır; mevcut kayıtları okur, platform oturumlarını kontrol eder, kendi oturumunu kapatır. İş kaydı oluşturmaz. Eksikler varsa sıfırdan farklı çıkış kodu verir. Sırları ve kayıt içeriklerini rapora yazmaz.

## INTTRA bağlantı onarımı

Kontrol öncesinde mevcut tünel durmuş ve yapılandırılmış adres çözümlenemiyordu. Mevcut yerel relay çalışıyordu. Önce ayarlar özel dizine yedeklendi, kurulu servis yeniden başlatıldı.

Kayıtlarda çok sayıda tünel yeniden başlatması ve launchd üzerinde `pended nondemand spawn = inefficient` görüldü. Tünel alt süreci artık ana servisi kapatmadan, 15 saniyeden başlayıp en fazla 5 dakikaya çıkan aralıklarla yeniden deneniyor. Beş dakika kararlı çalıştıktan sonra bekleme sıfırlanıyor. Bilinçli kapatma yeniden başlatmıyor. Bu davranış zamanlayıcı ve alt süreç taklitleriyle test edildi; uzun süreli uyku/ağ kesintisi kabulü yapılmadı.

Bağlantı yöntemi, hesaplar ve anahtarlar değiştirilmedi. Kurulu servisin mevcut mekanizması yeni bağlantı adresini yerel ayarlara ve canlı Worker sırrına eşitledi. Uygulama kodu canlıya yayımlanmadı. Bu bağlantı hâlâ bilgisayardaki relay ve tünele bağlıdır; kesintisiz barındırma garantisi değildir.

## Doğrulama sonuçları

- 460/460 otomatik test başarılı.
- TypeScript kontrolü, değişen dosyaların lint kontrolü ve uygulama derlemesi başarılı.
- Yerel servis kontrolü: 23 başarılı, 2 tamamlanmamış kontrol.
- Başarılı: giriş/çıkış, oturumsuz erişim engeli, mevcut konşimentolar ve booking listesi; ana sayfa, rapor, operasyonlar; booking belgeleri, faz 2, takvim, saha, VGM, kontrol, yaşam döngüsü, pre-alert, finans ve arşiv servislerinin okunması.
- Gerçek platformda başarılı: T-MAXX ve INTTRA oturumları, T-MAXX liman kartı sorgusu, INTTRA mevcut SI seçenek okuması; relay'de izin verilmeyen hedefin reddi.
- Gerçek konşimento, VGM, belge, konteyner, masraf veya fatura gönderilmedi. İş kayıtlarına veri geçişi uygulanmadı.
- Tarayıcı görsel kabulü yapılmadı. API kontrolleri ekran etkileşimlerinin veya gerçek platform yazmalarının kabulü değildir.

## Açık maddeler

1. INTTRA hesabının menüsünde eVGM yok; gerçek VGM gönderimi ve alındı doğrulaması henüz uygulanmış değil. Erişim ve işlem ekranı doğrulanmalı.
2. Kontrol edilen yerel booking T-MAXX yüküne bağlı değil. Doğru gerçek yük eşlemesi ve arşiv aktarım/geri okuma kabulü toplantıda yapılmalı. Rastgele eşleme yapılmadı.
3. Finans kayıt oluşturma kapsamda kalıyor; finans departmanının alanlar ve işlem sorumluluğu açıklaması bekleniyor.
4. Gerçek booking/konteyner yazma, HBL/MBL gönderimi ve bütün zincirin gerçek dosyada kabulü henüz bu kontrollerin sonucu değildir.
5. Son yerel geliştirmeler canlıya yayımlanmadı. Gerçek işlem kabulü ve yayın ayrı adımlardır.

Özel kontrol kayıtları `.private/readiness-2026-10-13/` altında. Ayar yedekleri gizlidir; paylaşılmamalıdır.
