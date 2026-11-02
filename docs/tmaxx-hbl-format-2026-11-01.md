# T-MAXX HBL alanları — 1 Kasım 2026

## Kapsam ve bulgular

1046445 ve 1046446 için bildirilen üç sorun düzeltildi: ambalaj seçiminin boş kalması, net ağırlığın açıklama ve ayrı alanda iki kez basılması, HBL liman adlarına ülke/konum kodlarının eklenmesi.

T-MAXX'in seçim bileşeni ambalajın görünen metnini değil `packingTypes` listesindeki `code` değerini kullanıyor. Önceki aktarımda kullanılan `PAKET` bu listede yok; geçerli karşılığı `PACKAGES`. Mevcut iki kayıt kullanıcı tarafından zaten düzeltilmiş: ambalaj PACKAGES, mal satırının net ağırlık alanı boş, yük toplamı 0, açıklamada net ağırlık, liman adlarında yalnızca TEKIRDAG ve SAN ANTONIO. Bu kayıtlar değiştirilmedi.

## Uygulanan davranış

- Yeni aktarım hazırlanırken T-MAXX'in güncel ambalaj listesi okunur. Kod, benzersiz etiket veya açık bir eş anlamlı eşlemesi kullanılır. Geçerli karşılığı olmayan veya belirsiz seçim gönderilmez; kullanıcıya alanı doğrulaması söylenir.
- Son mal açıklamasında sayısal net ağırlık varsa ayrı mal satırı alanı `null` olur. Açıklamada yoksa doğrulanmış sayısal alan kullanılır. Yükün net toplamı bu sayısal mal satırlarından hesaplanır. Kaynak belgelerdeki net ağırlık ve INTTRA açıklama biçimi korunur.
- HBL'nin liman yazısındaki yalnızca sondaki ` - ülke - konum` eki kaldırılır. Operasyonel konum kodları ve liman adının içindeki tireler korunur.
- Daha önce hazırlanmış aktarım planları değiştirilmez. Sürüm 2 işareti yalnızca yeni planlara eklenir; eski planların devamı ve mutabakatı önceki eşlemeyi kullanır.

## Doğrulama

116 ilgili otomatik test, TypeScript denetimi ve üretim derlemesi başarılı. Güncel ambalaj seçenekleri ve iki gerçek kaydın salt okunur anlık görüntüleriyle yerel aktarım planı oluşturuldu: PACKAGES, boş ayrı net ağırlık alanı, 0 yük net toplamı, açıklamada tek net ağırlık ve sade liman adları doğrulandı. Kaynak net değerleri (22893.36 ve 21979.98 kg) korundu.

Önceki canlı sürüm `16bea084-ef4d-472f-8cf1-b6f0dcf197c6` kaynak yedeği alındı; 237 modül önceki yerel derlemeyle birebir eşleşti. Veritabanı veya bağlantı ayarlarında geçiş gerekmez.

Canlı sürüm: `75f8b43a-1504-4ca8-bc97-64603094ad0e`. Yayından sonra uygulamada giriş, üç mevcut kaydın görüntülenmesi, T-MAXX pozisyonunun ve iki yükünün sunucu üzerinden okunması ve kendi test oturumundan çıkış başarılı. İlgili konşimento kaydı, teslimat satırları ve tüm servis bağları yayın öncesiyle aynı.

Gerçek bir konşimento oluşturma, güncelleme veya yeniden gönderme testi yapılmadı. Mevcut kayıtların salt okunur incelenmesi ve yerel plan doğrulaması, yeni bir gönderimin uçtan uca tamamlandığı anlamına gelmez.
