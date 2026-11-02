# T-MAXX booking oluşturma ve güncelleme — 8 Ekim 2026

Yerel geliştirme hazır. Gerçek T-MAXX kayıt oluşturma/güncelleme kabulü henüz yapılmadı; gerçek sisteme test kaydı veya belge gönderilmedi. Canlıya dağıtılmadı.

## Kapsam
Booking ayrıntısında T-MAXX kayıt formu: mevcut eşleşmede güncel pozisyon/yükü okur; eşleşme yoksa T-MAXX'in kendi yeni kayıt şablonlarını getirir. Şube, firma, liman, gemi, operasyon/satış sorumlusu kartları ve taşıma/ödeme/Incoterm seçenekleri T-MAXX'ten alınır. Serbest yazılan eski yerel taslak adları tahminle kart kimliğine çevrilmez.

Yeni kayıt desteği denizyolu ihracat FCL pozisyonu ve ona bağlı tek yük ile sınırlıdır. Pozisyon/yük numarasını T-MAXX verir. Kaydetmeden önce alanlar önizlenir. Güncellemede tam özgün kayıt gövdesi korunur, yalnız izin verilen alanlar değiştirilir; değişiklik olmayan kayıt gönderilmez. Yeni kayıtta güncel şablonun diğer varsayılanları korunur. Başarı, dönen kimliklerin ve alanların tekrar okunarak doğrulanmasına bağlıdır.

Adres kartları, konteyner/ekipman satırları, HBL/MBL numaraları, maliyet ve faturalar bu forma dahil değildir. Adres bağlı bir taraf kartı değişikliği, eski adresi farklı firmaya taşımamak için engellenir; firma ve adres birlikte T-MAXX'te düzenlenmelidir. Mevcut konşimento gönderim modülleri değiştirilmedi. Bu adım bütün operasyon sayfalarının entegrasyonunu tamamlamaz.

## Güvenlik ve tutarlılık
- Booking sahibi ve sürümü, uzak kayıt kimliği/referansı/sürümü, pozisyon-yük ilişkisi, firma ve operasyon/finans kilitleri denetlenir.
- Kart kimliği, firma ve pasiflik durumu önizlemede ve gönderimden önce denetlenir.
- Test işaretli dosyalar gerçek ERP yazmasına kapalıdır.
- Yeni müşteri/satış referansı için uzak mükerrer sorgusu hem önizlemede hem gönderimden önce yapılır. Aynı kullanıcı/referans için eşzamanlı yerel oluşturma planları tekilleştirilir. T-MAXX'in başka istemcilerinden aynı anda oluşturmayı atomik engelleme garantisi yoktur.
- Kalıcı işlem günlüğü tek gönderimi sağlar. Pozisyon oluşup yük adımında yanıt kaybolursa pozisyon kimliği korunur; işlem belirsiz kalır, yeniden gönderim veya yeni plan engellenir. Otomatik kurtarma henüz yoktur; T-MAXX'te kontrol gerekir.
- Gönderilmemiş önizleme iptal edilebilir. Açık oluşturma işlemi varken başka bir yüke manuel bağlama engellenir.

## Kanıt ve dağıtım
411 otomatik test geçti. Yeni testler oluşturma sırası/ebeveyn kimliği, değişmeyen alanların korunması, eski sürüm, kilit/yanlış kimlik/başka firma, adres güvenliği, kartın sonradan pasifleştirilmesi, sahiplik/test dosyası, mükerrer sorgu, paralel gönderim, kayıp yanıt, hatalı geri okuma ve iptali kapsar. Yazma testleri taklit ERP ile çalışır; gerçek kayıt yazıldığının kanıtı değildir. TypeScript, değişen dosyaların ESLint kontrolü ve üretim derlemesi geçti. Genel ESLint taraması bu adımda değiştirilmeyen tmaxx-recovery.tsx ve inttra-snapshot.ts dosyalarındaki iki hata ve output altındaki eski ekran yedeğinin iki hatası nedeniyle temiz değil; ayrıntılar özel lint-source.log içinde.

Gerçek salt okunur kontroller: yerel giriş/çıkış, otomatik platform bağlantısı, konşimento ve booking listeleri 200; yeni kayıt formu 4 T-MAXX sözlüğü ve mevcut operasyon sorumlusuyla açıldı. Şube/kullanıcı/şirket kartı simple kimlikleri/firma ilişkileri doğrulandı. Arayüzde gerçek şube araması ve kaydetmeden değişiklikleri bırakma denendi.

0020_tmaxx_booking_runs.sql yalnız yerel veritabanına uygulandı. Öncesi: `.private/tmaxx-booking-write-2026-10-08/before-0020.sqlite`. Oturum tabloları hariç önceki 44 tablo aynı; yeni işlem ve adım tablolarında sıfır kayıt var. Canlıya ileride dağıtırken 0019 ve 0020 migration'ları birlikte gereklidir; mevcut canlı sürüm bunları içermiyor.

Sıradaki geliştirme: gelen evrakın mevcut T-MAXX yüküne bağlanması ve belirsiz belge işlemlerinin kanıtlı kurtarılması. Ardından takvim/saha, VGM/onay, pre-alert, finans ve raporlar için entegrasyon planı sürer.
