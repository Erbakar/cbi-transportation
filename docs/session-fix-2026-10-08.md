# Konşimento oturum düzeltmesi — 8 Ekim 2026

Yerel /bills sayfasında geçerli oturumla `useWorkspaceUser` içinde “Oturum gerekli.” hatası yeniden üretildi. Layout sağlayıcısı ve konşimento tüketicisinin ortak oturum context tanımı `components/workspace-session.ts` modülüne taşındı; shell dosyası artık yalnız bileşen dışa aktarıyor. Eksik sağlayıcı denetimi ve sunucu yetkilendirmesi korundu.

Doğrulama: doğrudan /bills yükleme, ana sayfadan menüyle geçiş, yeni konşimento ekranı, çıkış (menüsüz giriş ekranı), yeniden giriş ve mevcut S.E.26.09.00670 ayrıntısı tarayıcıda açıldı. Altı mevcut kayıt listelendi; T-MAXX ve INTTRA otomatik bağlantıları Aktif görüldü. Brüt 23110 kg, posta kodu 8820000 ve taşıyıcı mühür sahibi ayrıntıda görüldü. Hiçbir kayıt kaydedilmedi veya platforma gönderilmedi.

375/375 test, TypeScript kontrolü, değişen dosyalarda lint ve üretim derlemesi başarılı. Kontroller localhost:5174 üzerinde; canlıya dağıtım ve gerçek konşimento gönderimi yapılmadı.
