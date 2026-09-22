# Pozisyondan taraf ve ödeme hazırlama

22 Eylül 2026 operatör kuralları:

- Kesin T-MAXX pozisyon referansı ve konteyner seti doğrulanır.
- `abroadAgent` varsa, yalnızca seçili `abroadAgentAddress` kartı okunur. Kartın `company.id` değeri acenteyle eşleşmelidir. MBL consignee ve notify için acentenin görünen adı ve adres kartının `address.addressDetail` alanı kullanılır. HBL gerçek tarafları korunur.
- `abroadAgent` açıkça null ise yalnız MBL hazırlanır. MBL shipper gerçek gönderenden, consignee ve notify gerçek alıcıdan alınır. Eksik acente özelliği null olarak yorumlanmaz. Eksik/eşleşmeyen adres kartı aktarımı durdurur.
- Kaynak sorgusu kayıt oluşturmaz. Kesin referanstaki limanlar kullanılır; gemi, sefer, booking, HBL ve MBL numarası varsa boş alanlara getirilir.
- Kaynak alma sırasında MBL masrafları pozisyondaki `freightPayment` üzerinden operatörün onayladığı şablonla hazırlanır. PP ve varışta kapı teslim yoksa ilk üç satır Prepaid–Forwarder, son üç satır Collect–Consignee olur. CC için ilk iki satır Prepaid–Forwarder, kalan dört satır Collect–Consignee olur. Tanınmayan/boş navlun kodunda mevcut form değiştirilmez.
- Pozisyon navlunu PP ve Move Type varışta kapı teslim (3 veya 4) ise ilk beş masraf Prepaid–Forwarder, Additional Charges Collect–Consignee olur. Kapıdan limana (2) bu istisnaya girmez.
- Formdaki kaydedilen masraflar gönderilir; gönderim anında görünmeden değiştirilmez. Move Type değiştirildiğinde kaynaklar yeniden getirilebilir.
- HBL navlun koşulu ana talimattan gelir; MBL pozisyon ödeme koşuluyla karıştırılmaz.
- HBL notify boş/hiç yoksa veya “same as consignee” ise gerçek alıcının güncel adı, tam adres/iletişim bilgileri ve yapılandırılmış adres bileşenleri notify için de kullanılır. Açıkça verilen farklı notify korunur (CANNING örneğinde notify ECONOMY FREIGHT SERVICES LTD). Yönlendirme ile ayrı adres birlikte verilmişse ya da okuma belirsizse kullanıcı kontrolü istenir.
- Çıkış her zaman Port olur. Yükün `placeOfDeliveryCity` alanı doluysa Port–Door (3), null ise Port–Port (1) getirilir. Çıkış ve teslim konumları bu kurala göre INTTRA sözlüğünden eşleştirilir. Eksik alan şeması null kabul edilmez.
- Mühür boş bırakılacaksa her konteyner için açık seçim gerekir. Uydurma `NO` veya başka bir numara gönderilmez. INTTRA seal koleksiyonu boş olur; taşıyıcı servisi yine zorunlu tutarsa hata kullanıcıya gösterilir.

Adres sorgusu yalnız GET `/api//marketing/def/addressCard/{id}` için genişletildi. Başka pazarlama/kart yazma uçları açılmadı.
