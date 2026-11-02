# T-MAXX aktarım farkları ve kullanıcı düzeltmesi

## Canlı bulgu

S.E.26.09.00670 için INTTRA SI 548509629 başarılı. T-MAXX aktarımı ilk konteyner güncellemesinde belirsiz kalmış. Salt okunur kontrolde konteyner brüt ağırlığı 0; mal/yük kap adedi ve ağırlıkları 0; HBL ve booking alanları boş. Aktarım planı 788 kap, 23110 kg brüt, 22636.8 kg net, HBL 1046362 içeriyor. 21 alanın 17'si farklı. Bu bir ondalık gösterim farkı değil.

## Değişiklik

- Kayıt ayrıntılarında mevcut T-MAXX değerleri otomatik okunur; planlanan değerlerle karşılaştırma ve düzenleme tablosu açılır.
- Alan düzeltmeleri önce önizlenir; mal satırlarından hesaplanabilen kap/ağırlık toplamları türetilir. Kayıt kimlikleri bu ekranda değişmez.
- Onay yalnız T-MAXX'in mevcut PUT kayıtlarını günceller. INTTRA payload, referans ve başarılı durumuna dokunmaz.
- İnceleme ve uygulama arasında mevcut kayıt değişirse yeniden inceleme gerekir. Her yazma sonrası kayıt yeniden okunur; tüm alanlar doğrulanmadan başarı gösterilmez.
- Her düzeltme adımı günlüğe kaydedilir, beklenen plan önceden saklanır. Bağlantı kesilirse yeniden karşılaştırma yapılır; yeni POST/HBL oluşturma belirsizliği bu yolla körlemesine tekrarlanmaz.
- Normal aktarımda beklenmeyen kaydetme yanıtı alınırsa aynı PUT kaydı tekrar okunur. Alanlar doğruysa işlem devam eder. Kanonik sayısal biçim farkları eşdeğer kabul edilir; belirsiz yerel sayı biçimleri tahmin edilmez.

## Doğrulama ve sınır

119 test geçti, TypeScript ve üretim derlemesi başarılı. Canlı inspect ve preview uçları 21 alan / 17 fark döndürdü; blocker yok. Yerel tarayıcıda karşılaştırma tablosu ve önizleme sonrası onay düğmesi doğrulandı. Bu geliştirme sırasında canlı apply çağrılmadı; mevcut yükün T-MAXX aktarımı kullanıcının ekrandaki onayını bekler. T-MAXX'in önceki kaydetme yanıtının içeriği eski günlükte tutulmadığı için platformun ilk isteği neden kaydetmediğine dair kesin bir sebep iddia edilmiyor.

## 12:07 ekran geri bildirimi

Genel T-MAXX hata bağlantısı, INTTRA başarılı olduğu için ana form bulunmadığında boşa düşüyordu. Bağlantı artık mevcut düzeltme bölümüne kaydırır ve odaklar; alan anahtarı/etiketi varsa ilgili düzeltme alanını vurgular. Bölüm hedefinde başlangıca kaydırılır.

Geniş tablonun yerine etiketli alan kartları kullanıldı. Sayılar tek satırlı girişlere taşındı. Boş/0 mevcut değerler “Doldurulacak”; dolu ve farklı değerler “Mevcut değer değişecek”; eşleşenler “Eşleşiyor” olarak ayrıldı. Bu, platformun aktarım hatasının ortadan kalktığı anlamına gelmez; farkların kullanıcıya hata gibi sunulmasını düzeltir. Tarayıcıda bağlantı odağı ve yeni alan düzeni kontrol edildi; TypeScript ve derleme başarılı.
