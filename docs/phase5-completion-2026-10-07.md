# Faz 5 — VGM ve ağırlık kontrolü
Tarih: 7 Ekim 2026

Durum: Yerel VGM belge okuma, kontrol, onay ve veri paketi geliştirmesi tamamlandı. Canlıya alınmadı; gerçek operasyon belgesiyle kullanıcı kabulü yapılmadı. Canlı sistem Faz 2 sürümündedir; Faz 3–5 yerelde hazırdır.

## Kapsam
- Booking detayından VGM ekranına erişim; mevcut belge deposuna PDF/PNG/JPEG aslı ve sürüm ilişkisiyle yükleme.
- Belge numarası, tartım tarihi/saati, konteyner, dara, yük brüt/payload, VGM, tartım firması/yetkilisi, araç, plaka ve terminal okuması.
- Her OCR alanında kaynak alıntısı, sayfa ve model güveni. Çok konteynerli belgelerde ayrı satırlar; birimsiz/kararsız değerler otomatik tamamlanmaz.
- kg, ton ve lb açık birimleri kg'ye dönüştürülür; gram hassasiyetinde tam sayı hesap kullanılır. Net yük veya araç darası konteyner dara/yük brüt alanı yerine kullanılmaz.
- Beklenen VGM = yük brüt + konteyner darası. Ayrıca bağımsız sevkiyat yük ağırlığıyla kontrol yapılır. T-MAXX konteyner yük ağırlığı varsa referans değeri aynı olmalıdır; yoksa kullanıcı bağımsız kaynak açıklamasıyla girer.
- Konteyner kontrol hanesi, aktif saha kaydı ve seçili T-MAXX pozisyon/yük kaynağı eşleşmesi zorunlu. Birden çok eşleşme reddedilir.
- Kullanıcı tolerans tercihi bu çalışma sırasında yanıtlanmadığından varsayılan 0 kg kullanıldı. Eşik onay formunda değiştirilebilir ve onay kopyasında saklanır. Bu değer operasyon içi kontrol eşiğidir; mevzuat veya armatör/liman toleransı değildir.
- Tolerans üzeri fark, VGM'nin daradan küçük olması ve gelecekte tartım engellenir.
- Hiçbir OCR sonucu otomatik onaylanmaz. Belge ve düşük güvenli alanlar için açık kontrol beyanı ve gerekçe gerekir.
- Kaynak dosya bütünlüğü onay ve dışa aktarmada yeniden doğrulanır. Yeni belge/okuma, booking veya saha değişikliği eski onayı kullanılamaz yapar.
- Onay geçmişi ve gerekçeli geri alma; en son onayın geri alınması eski onayı yeniden etkinleştirmez.
- Bütün aktif konteynerlerde geçerli onay varsa ayrı VGM, yük brüt ve dara alanları içeren kaynak ilişkili JSON paketi hazırlanır.

## Aktarımın sınırı
Paket cbi.vgm.reviewed.v1 uygulama içi veri sözleşmesidir. T-MAXX/INTTRA için onaylı değerleri hazırlar; platformların gerçek VGM API istek şeması olarak sunulmaz. Mevcut konşimento yük brüt alanının üzerine VGM yazılmaz. Doğrudan VGM platform gönderimi ve platformun kabul yanıtı bu fazda doğrulanmadı veya uygulanmadı; ayrı VGM alan eşlemesi/servis doğrulaması gerektirir. Gerçek VGM gönderimi yapılmadı.

## Kanıtlar
- Başlangıçtaki 254 test geçti. Son durumda 274 test geçti; 20 yeni VGM testi.
- TypeScript, değişen dosyaların lint kontrolü ve üretim derlemesi başarılı.
- Testler: gram hassasiyeti, tolerans sınırı, bağımsız yük ağırlığı, birim dönüşümü, düşük güven, konteyner eşleşmesi, belge bütünlüğü/değişimi, sahiplik, okuma kilidi, eşzamanlı kaynak değişikliği, onay geri alma ve tüm konteynerler için onay şartı.
- Yeni FAZ5-KABUL-20261007 test kaydında T-MAXX S.E.26.09.00670 / YK.S.E.26.09.00801 salt okunur olarak eşleştirildi. Mevcut gerçek booking/konşimento kayıtları değiştirilmedi.
- Açıkça sentetik ve gönderim için geçersiz işaretli PDF üretildi ve görsel olarak kontrol edildi. Gerçek okuma servisi konteyner, 23.110 kg yük, 3.750 kg örnek dara ve 26.860 kg örnek VGM alanlarını doğru okudu. Örnek dara/VGM gerçek tartım olarak yorumlanamaz.
- Tarayıcıda 1 kg farkın 0 kg toleransı aştığı, onayın engellendiği, düzeltilmiş test değerinin onaylandığı ve veri paketinin hazırlandığı doğrulandı.
- Test onayı kabul sonunda geri alındı. Sonraki dışa aktarım 409 ile engellendi; aktif sentetik VGM onayı bırakılmadı.
- 22 tablodaki önceki 68 iş/veri satırı yedekle birebir aynı. Oturumlar/oturum önbellekleri ve veritabanı metadata'sı bu karşılaştırmadan ayrı tutuldu.
- Yedek ve özel kabul kanıtları: .private/phase5-2026-10-07/.
- Ekran kanıtı: output/phase5-completion-2026-10-07/vgm-screen.png.

## Kalan kabul ve dağıtım işleri
- Gerçek tartım belgesi ve operasyon sorumlusu ile tolerans/kaynak doğrulaması.
- Gerekiyorsa doğrudan VGM platform alanlarının ve kabul sözleşmesinin ayrıca doğrulanması.
- Canlı yedek ve henüz uygulanmamış 0011, 0012, 0013 geçişleri; canlı giriş–çıkış, otomatik bağlantı ve mevcut kayıt kontrolleri.
- INTTRA bağlantısı ve mevcut konşimento gönderim akışı bu fazda tekrar gerçek platform üzerinde çalıştırılmadı. Oturum, servis adresi ve bağlantı yapılandırmaları değiştirilmedi.
- Ekranda son 100 okuma ve 200 onay gösterilir. Onayların geçerliliği uygulamada kayıtlı son kaynak sürümüne dayanır; T-MAXX kaynak yenilemesi kullanıcı tarafından başlatılır.
