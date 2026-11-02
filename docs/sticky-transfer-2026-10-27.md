# Sabit talimat işlem çubuğu — 27 Ekim 2026

“Platformlara aktar” düğmesi, “Kaydet ve kontrol et” ile aynı sabit alt
çubuğa taşındı. Kaydetme ikincil, aktarım birincil düğme olarak gösteriliyor.
Duruma bağlı açıklama da bu çubukta. Eski ayrı aktarım satırı kaldırıldı.

Aktarımın mevcut `submitRecord` işleyicisi ve kaydedilmemiş değişiklik,
işlem sürmesi, eksik/engelli kayıt kontrolleri korundu. Kaynak yüklenirken
iki düğme de devre dışı. Alanların kilitli olduğu kısmi aktarımlarda mevcut
aktarım devam davranışı korunuyor; aktarım düğmesi genel form kilidine
bağlanmadı. Dar ekranlar için çubuk ve düğmelerin satır düzeni uyarlandı.

TypeScript, üretim derlemesi ve ilgili 43 mevcut test geçti. Canlı
tarayıcıda form ortasına kaydırılarak iki düğmenin de aynı alt çubukta
göründüğü doğrulandı. Aktarım düğmesine basılmadı; kayıt veya platform
işlemi oluşturulmadı. Dört mevcut kayıt ve ortam bağlantıları değişmedi.

Önceki dağıtım `0e98444c-2d81-4f58-b666-3d7b6520575b`; yeni dağıtım
`b4f21294-3dc1-4fa3-89c6-4b7cf0510fa7`. Önceki 237 modülün canlı kopyası
ve kaynak yedekleri `.private/sticky-transfer-2026-10-27/` içinde tutuldu.
