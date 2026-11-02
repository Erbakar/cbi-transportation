# Günlük operasyon ana sayfası — 8 Ekim 2026

Yerel geliştirme tamamlandı. Eski bölüm bağlantıları yerine günlük operasyon özeti gösterilir; sol menü ve ayrıntılı Yönetim Paneli korunur.

- Açık dosya, bugün teslimi olan iş, gecikmiş iş ve VGM/draft onayı bekleyen tekil dosya kartları.
- Açık dosyaların tamamlanmamış takvim işleri: gecikme, son 4 saat, sonraki 24 saat, bugünün saat belirtilmemiş işleri ve tarih/saat kontrolü gereken kayıtlar. Bugün görevin kendi saat dilimine göre hesaplanır; saat uydurulmaz. Tamamlanmış/iptal işler ve kapalı dosyalar dahil edilmez. Zaman göstergeleri dakikada bir güncellenir.
- Booking teyidi, VGM, draft ve pre-alert bekleyen dosyalara karttan geçiş; seçilen grubun ilgili çalışma ekranına bağlantı.
- Son güncellenen 5 booking dosyası. Güncelleme sıralaması booking, takvim, raporlama, belge, saha, finans, belge yaşam döngüsü, pre-alert ve VGM onay kayıtlarındaki tarihlerden oluşur; gezinme/ziyaret geçmişi değildir.
- Kaydedilmiş döviz kurlarıyla TRY gelir/gider/brüt kâr ve yansıtılmamış gider kalemleri. Vergi hariç, kapalı dosyalar dahil; eksik faturalarda sonuç geçicidir. Tutar hassasiyeti korunur.
- Test profilli booking'ler varsayılan olarak hariç; kullanıcı isteğiyle önizlenebilir. Veri yoksa boş durum; finans kaydı yoksa tutar yerine “Henüz kayıt yok”. Hatalı dosyalar sıfır diye gizlenmez, eksik özet uyarısı çıkar.

Yeni `/api/home` uç noktası yalnız okur, sahiplik ve sayfalama uygular. Durum ve finans hesaplarında mevcut dashboard API'si kullanılır. Veritabanı şeması veya kayıtlar değiştirilmedi; platform gönderim veya bağlantı ayarları değiştirilmedi. Özet booking dosyalarını kapsar; bağlantısız eski konşimentolar hâlâ Konşimentolar bölümündedir.

## Doğrulama

375/375 test, TypeScript, değişen dosyalarda lint ve üretim derlemesi geçti. Yeni 7 test zaman dilimi/gün sınırı, 4/24 saat sıralaması, saat belirtilmeyen işler, tamamlanan/kapalı kayıtların dışlanması, son 5 sıralaması ve salt okunur/sahiplikli sayfalamayı kapsar.

Tarayıcıda varsayılan boş görünüm, test dosyalarıyla dolu görünüm, 7 açık dosya, draft kartından ilgili 7 dosyaya süzme ve 980 TRY örnek kâr doğrulandı. Son durumda test filtresi kapalı bırakıldı.

Yerel API kontrolünde oturumsuz erişim 401, giriş/çıkış, mevcut 6 konşimentonun görünmesi, T-MAXX ve INTTRA bağlı yanıtları doğrulandı. Kontrol öncesi/sonrası iş ve yapılandırma tablolarının özeti birebir aynı (geçici oturum tabloları hariç). Gerçek gönderim yapılmadı; canlıya dağıtılmadı.

Kanıtlar: `.private/home-2026-10-08/` altında test/derleme günlükleri, `verify.mjs`, `result.json`; `output/home-2026-10-08/home-preview.png` test verili önizleme.
