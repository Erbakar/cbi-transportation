# T-MAXX entegrasyonları — 8 Ekim 2026

Durum: Yerel geliştirme ve otomatik kontroller tamamlandı; bütün entegrasyonlar kapalı değildir. Bu çalışma canlıya alınmadı. Gerçek ERP kayıt/gönderim kabulü yapılmadı.

## Bu çalışmada eklenenler

- T-MAXX booking güncellemesinden kullanılmayan adres, telefon, plaka, yükleme/boşaltma saha tarihi alanları çıkarıldı. Eski hazırlanmış planlar da güncel alan listesine göre yeniden kontrol edilir. Ozan Kaman'ın açıklamasına göre saha/şoför bilgileri aktarılmıyor; konteyner kaydı aktarılıyor.
- Bağlı yüke konteyner numarası, mühür ve tip için oluşturma/güncelleme servisi ve Nakliye ve saha ekranı eklendi. Önizleme, sürüm/aidiyet/kilit/test dosyası kontrolleri, kalıcı tek-gönderim kaydı ve geri okuma doğrulaması var. VGM ve ağırlık alanları değiştirilmez. Sonucu belirsiz gönderimler tekrar edilmez; operatörün T-MAXX kaydını incelemesi gerekir.
- Finans ekranı T-MAXX'in yerel uygulamasının kullandığı costAndRevenue servisinden bağlı yükün finans satırlarını okur. Para birimi, işaret, durum ve kilit bilgileri korunur. Tekrarlanan grup koleksiyonları tekrar toplanmaz. Fatura oluşturma/muhasebeleştirme yapılmaz.
- Ana sayfa ve yönetim paneline bağlı ilk 50 booking için canlı ERP görünümü eklendi. Bu bölüm tüm şirket raporu değildir; mevcut yerel kartlar korunmuştur ve ERP muhasebe toplamı sayılmaz.
- Belge yönetimi ve pre-alert ekranlarına bağlı yük + ortak pozisyon arşivi ve mevcut HBL PDF şablonları eklendi. Başka yüklerin belgeleri bu görünümden indirilmez. MBL oluşturma/onayı armatör sisteminde kalır. İndirme; onay veya gönderim olarak işaretlenmez.

## Doğrulama

- Tam test paketi: 445/445 geçti. Sonradan eklenen mevcut konteyner güncelleme/çakışan yeniden adlandırma testiyle ilgili paket 7/7 geçti (toplam 446 test).
- TypeScript, değişen uygulama dosyalarının lint kontrolü, production build başarılı.
- Gerçek T-MAXX GET: finans yanıtı 10 temel satırla şemaya uydu; konteyner tipi listesi 22 kayıt döndürdü. Bu sonuçlar yazma kabulü değildir.
- Yerel giriş, Nakliye ve saha ekranı, bağlantısız dosyada kayıt engeli ve finans ekranı tarayıcıda kontrol edildi.
- 0021 yalnız yerel veritabanına uygulandı. Önce özel dizine SQLite yedeği alındı; önceden mevcut 50 tablonun içeriği aynı kaldı. Üretim migrasyonu yapılmadı.

## Kapanış için kalanlar

1. VGM: armatör web sitesi adresi/hesabı ve gerçek gönderim-makbuz iş akışı gerekiyor. Paket indirme hâlâ gönderim değildir.
2. HBL draft/final onayı ve pre-alert: kullanılan T-MAXX ekranı/işlem durumu netleşmeli. Arşiv belgesi veya yerel onay, ERP onayı sayılmaz. Otomatik e-posta gönderimi eklenmedi.
3. Finans yazma: mevcut kayıtları okuma ile masraf/fatura oluşturma, onaylama ve muhasebeleştirme farklıdır. Kullanılacak işlem ve ekran netleşmeden otomatik yazma eklenmedi.
4. Rapor: şirket genelindeki tüm ERP kayıtlarının sayfalı raporu ve eski yerel kartların ERP kaynaklı karşılıkları henüz tamamlanmadı; mevcut yeni görünüm bağlı bookinglerle sınırlı.
5. Konteyner gerçek kayıt kabulü; armatör gönderimi ve muhasebe/onay kabulü; ardından ayrıca canlı yayınlama.

Canlı ortamda sahte kayıt veya test konşimento gönderimi yapılmadı. T-MAXX ve INTTRA hesap/bağlantı ayarları değiştirilmedi.

## 9 Ekim devamı

- Ana sayfa ve yönetim panelindeki ana görünüm artık ERP kaynaklı; yerel hesaplar açılabilir geçmiş bölümünde korunuyor. Onay/dosya durumları bilinmediğinde yerel veriden ERP durumu üretilmiyor.
- İlk 50 bağlı dosya sınırı kaldırıldı. Sahibe göre filtrelenen, booking kimliğiyle sıralanan 10 kayıtlık sayfalar son sayfaya kadar okunuyor. Bu, şirketin bağlanmamış tüm ERP dosyalarının raporu değildir.
- Tekil pozisyonların belge/VGM son teslimleri 24/4 saat uyarılarıyla gösteriliyor; geçmiş tarihe otomatik “iş tamamlanmadı” anlamı verilmez.
- Eksik ERP okumaları sıfır finans sayılmaz; hata ve eksik özet gösterilir.
- 448 test geçti; TypeScript/lint/build başarılı. Gerçek T-MAXX konteyner tipi GET isteği 200 döndürdü. Yerel giriş ve yeni ana sayfa tarayıcıda doğrulandı; mevcut bookinglerin hiçbiri ERP yüküne bağlı olmadığı için dolu raporun uçtan uca kabulü yapılamadı.
- VGM site/erişim bilgisi, HBL onay/pre-alert ekranı ve finans yazma kapsamı hâlâ bekleniyor; bunlar tamamlandı sayılmıyor. Gerçek dış kayıt ve canlı yayın yapılmadı.
