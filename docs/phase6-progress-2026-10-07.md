# Faz 6 — başlangıç teslimi, 7 Ekim 2026

Güncelleme: Yerel geliştirme ve yerel kabul tamamlandı. Güncel kapsam ve doğrulamalar için `phase6-completion-2026-10-07.md` dosyasına bakın. Aşağıdaki metin ilk başlangıç tesliminin tarihsel kaydıdır. Canlıya alınmadı.

## Çalışan bölüm
- Booking ayrıntısından erişilen `/booking/[id]/control` ön kontrol ekranı.
- 39 kritik alan için kaynak sütunları, kaynak açıklamaları/sayfa/model okuma güveni ve fark filtresi.
- Kayıtlı booking, mevcut T-MAXX saha kaynağı, güncel belgelerin mevcut booking okumaları.
- Eksik kaynak ve tek kaynağın eşleşme olarak sunulmaması; rota, müşteri, booking, konteyner farklarının kritik gösterilmesi.
- CBI iş kuralı tanımlanmadan taraf/navlun farklarına otomatik normal kararı verilmemesi.
- Geçerli son VGM onaylarının konteyner bazında ayrı gösterilmesi; eski/iptal onayların dışlanması.
- Uygulama verilerine yazmayan, sahiplik ve oturum kontrollü GET servisi. Şema/geçiş gerektirmez.

## Doğrulama
- 280 test geçti (6 yeni alan karşılaştırma testi).
- TypeScript, değişen yeni dosyalarda lint, üretim derlemesi geçti.
- Yerel tarayıcıda mevcut açık test booking ile ekran ve fark filtresi doğrulandı.
- API: anonim 401, oturumlu 200, olmayan booking 404, iptal VGM onayının dışlanması kontrol edildi; ayrı test oturumu kapatıldı.
- Gerçek platform bağlantısı bu değişiklikte yeniden denenmedi; kayıtlı kaynak görüntüsü kullanılır. Gerçek gönderim yapılmadı.
- Veritabanı iş kayıtlarında, bağlantı ayarlarında, aktarım servislerinde değişiklik yok.

## Fazın kapanması için kalanlar
1. Talimat, taşıyıcı SI, HBL/MBL ve sea waybill için kapsamlı alan okuma; belge bağlamı ve konteyner/yük satırı kimlikleri.
2. Kaynak sürümüne bağlı, gerekçeli kalıcı kullanıcı kararları ve açık tanımlı CBI istisna kuralları.
3. Cut-off/gerekli belge gönderimi, draft-final onayı ve pre-alert eski sürüm kontrolleri.
4. Booking ile konşimento kaydının doğrulanmış bağlantısı; mevcut gönderim/düzeltme/kurtarma yollarında yalnızca onaylı güncel verinin aktarımı. Eski çalışan kayıtlar korunmalı; tüm yazma yolları incelenmeli.
5. Kaynak değişikliği/eşzamanlı işlem/iptal onayı ve başka kullanıcı erişimi testleri, gerçek belgelerle yerel kabul, ayrı canlıya alma.

Bu ön kontrol ekranındaki “Değerler aynı” sonucu bir aktarım onayı değildir. Belge türünün listede olması, içeriğinin okunmuş olduğu anlamına gelmez. VGM ağırlıkları farklı konteynerler arasında kıyaslanmaz. Üretim halen önceki canlı sürümdedir.
