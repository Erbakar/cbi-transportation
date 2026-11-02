# Faz 9 — Muhasebe, Masraf ve Dosya Kârlılığı

Tarih: 8 Ekim 2026. Durum: yerel geliştirme ve kabul kontrolleri tamamlandı. Canlıya alınmadı.

## Teslim edilen kapsam

Booking kaydındaki **Dosya finansı** bağlantısı; liste ve toplamlarla açılan, ayrı yeni beklenen maliyet / gerçekleşen gider / müşteri geliri formları olan çalışma alanına gider. Mevcut onaylanmış teklif satırları para birimi bazında forma alınabilir. Kaynağı değişmiş teklif yeniden doğrulanmadan önerilmez.

Kaynak PDF, pozisyon, taraf ve düzenleyen kimliği, fatura numarası, hizmet/masraf kodu, tarih/vade, döviz/kur ve kur kaynağı, vergi, muhasebe şirketi, elektronik fatura türü/UUID ve proje/departman kaydedilir. Kullanıcı belge eşleşmesini ayrıca onaylar. Taşıyıcı, kara nakliye, terminal/gümrük, dokümantasyon, VGM, agent/destination ve revizyon/iptal giderleri açıklama ve hizmet kodu satırlarıyla girilebilir.

Beklenen ve gerçekleşen maliyetler yan yana gösterilir. Kısmi faturalar toplanır; aynı dövizdeki eşleşmiş kalemlerde fiyat ve kur etkisi ayrıştırılır. Farklı dövizli eşleşmede ayrıştırma yapılmadığı açıkça gösterilir. Brüt kâr vergi hariç gelir eksi giderdir; vergiler ayrıca gösterilir. Para birimi bazındaki net tutarlar korunur.

Eksik fatura, teklif dışı gider, maliyet farkı, yansıtılmamış gider, gelirsiz dosya, hedef altı marj ve değişmiş kaynak belge sorumluya bağlı finans görevlerine dönüşür. Görev gerekçeyle açıklanabilir; kaynak/finans bilgisi değiştiğinde yeniden inceleme gerekir.

Mükerrer fatura numarası/düzenleyen, elektronik UUID veya aynı belge; aynı kullanıcıya ait başka dosyalarda da engellenir. Yanlış pozisyon engellenir. Kayıtlar silinmez; gerekçeli iptal ve alacak notu geçmişi saklanır. Bağlı kayıtlar varken üst kaydın iptali engellenir. Eşzamanlı değişiklikler işlem ve geçmişin birlikte kaydını bozmaz.

## Doğrulama

- Değişiklik öncesi 333; sonrasında **348/348 otomatik test** geçti.
- TypeScript kontrolü, değişen TypeScript/React dosyalarının lint kontrolü ve üretim derlemesi geçti.
- Yerel HTTP kabul testi: açıkça sentetik işaretlenmiş üç PDF ve bir test booking'i kullanıldı. Beklenen 3.000 TRY, gider 3.520 TRY, gelir 4.500 TRY, brüt kâr 980 TRY. Fark 520 TRY = fiyat 300 + kur 220. Gider vergisi 704, gelir vergisi 900 TRY.
- Gerçek yerel API üzerinde mükerrer kayıt 409 ve yanlış pozisyon 422 ile reddedildi.
- Tarayıcıda finans formu, tarih girişi, tablonun görünümü ve fark görevini gerekçeyle kapatma doğrulandı; açıklamanın sunucuda kalıcı olduğu ayrıca kontrol edildi.
- Giriş/çıkış, altı mevcut konşimento kaydının (biri önceki sentetik test) listelenmesi, T-MAXX ve INTTRA bağlantılarının bağlı yanıtı doğrulandı.
- Önceki pre-alert testinin revizyon bekleyen durumu ve gönderim kanıtı geçmişi korundu.
- Önceki yedekle karşılaştırmada **163 iş/yapılandırma satırı aynen korundu**. Geçici oturum ve bağlantı oturumları bu karşılaştırmanın dışında tutuldu.
- Gerçek konşimento, e-posta, fatura veya muhasebe gönderimi yapılmadı. Bağlantı kontrolü gerçek gönderim uçtan uca testi olarak değerlendirilmez.

Kanıtlar: `.private/phase9-2026-10-08/` altında test/derleme günlükleri, kabul betiği, sentetik belgeler ve sonuçlar; `output/phase9-2026-10-08/finance-verified.png` ekran görüntüsü.

## Sınırlar ve devreye alma

Fatura eşleştirmesi kaynak PDF'ye dayanan kullanıcı onaylı girişle yapılır. Otomatik fatura okuma, canlı kur servisi, T-MAXX muhasebe yazımı, e-Fatura gönderimi, tahsilat veya ödeme bu teslimatta yoktur. Bir fatura bir operasyon dosyasına aittir; çoklu dosyaya fatura paylaştırma desteklenmez. Kârlılık kaydedilen faturalarla sınırlıdır ve eksik fatura varsa geçicidir.

`0017_finance.sql` yalnız yerel veritabanına uygulandı. Değişiklik öncesi yerel yedek `.private/phase9-2026-10-08/before.sqlite` konumundadır. Canlı sistem bu çalışma kapsamında değiştirilmedi. Yeni migration, API ve arayüz birlikte dağıtılmalıdır; canlıya geçiş ayrı çalışma olarak yapılmalıdır. Sonradan eklenen verilerin üzerine eski yedek yazılmamalıdır.
