# Belge mantık katmanı ve güvenilirlik politikası

Kapsam: denizyolu ihracat FCL booking devri. Politika: `booking-evidence-v3`. Tarih: 5 Ekim 2026.

## Güncel kapsam — Faz 2 genişlemesi

16 belge alanı desteklenir: önceki 8 alan ve booking numarası, gemi, sefer, yükleyici adresi, alıcı adı/adresi, notify adı/adresi. Formda 11 temel devir alanı ve 8 isteğe bağlı ek alan vardır; ek alanların boşluğu eski devirleri eksik duruma düşürmez. Kaynak alıntısı 3000, alan değeri 2000 karaktere kadar kabul edilir; kısa alanların kendi 200 karakter sınırı ayrıca uygulanır. Eski 8 alanlık okuma sonuçları yeni alanlar null olacak şekilde açılır, geçmişe bilgi uydurulmaz. Önbellekteki eski sonuç kendiliğinden yeniden model çağrısı yapmaz.

Taraf adı kaynakta bulunmuyorsa veya çözümlenmemişse adres otomatik doldurulmaz. Birlikte doldurulması gereken ad/adres ve ekipman tipi/adedi istemcinin kısmi alan seçimiyle ayrılamaz. Aynı booking içindeki ikinci güncel belge boş alanları tamamlayabilir; farklı değerler incelemeye bırakılır. Her uygulama kendi belge/çıkarım kaynağını korur.

37 test geçti; eski sekiz alanlı sonuçların açılması, 16 alanın taslağa doldurulması, taraf-adres ilişkisi, iki belgeden tamamlama ve eşzamanlı değişiklikler kapsanıyor. TypeScript ve değişen modüllerin ESLint kontrolü geçti. Gerçek belgelerle doğruluk ölçümü yapılmadı. Çok satırlı konteyner/yük verilerinin mevcut konşimento modeline bağlanması sonraki iştir. Aşağıdaki v2 açıklamalarındaki 8/11 sayıları önceki kapsamın tarihsel açıklamasıdır.

## Amaç ve kavramlar

Modelin verdiği 0–1 güven değeri, doğruluk olasılığı veya belgenin gerçeklik sertifikası değildir. Belgenin tutarlı görünmesi, düzenleyicisinin doğrulandığı anlamına gelmez. Bu nedenle ekranda dört ayrı bilgi korunur:

1. **Model tahmini:** Sadece modelin kendi belirsizlik sinyali. Kontrol puanını artırmaz. 0,80 altı değer, aktarımdan önce gerekçe ister; bu eşik ölçülmüş doğruluk oranı değildir.
2. **Kontrol puanı:** Deterministik kurallardan üretilen açıklanabilir operasyonel indeks. Otomatik onay eşiği yoktur.
3. **Alan kapsamı:** Devir formundaki 11 alanın doluluğu, belgeden okunabilen 8 alan, otomatik doldurulabilecek alanlar ve incelemeye kalan alanlar ayrı ölçülür. Eksik bilgi, yanlış bilgiyle aynı şey değildir. Bu sayılar tüm konşimento veya tüm proje kapsamı olarak sunulmaz.
4. **Kaynak ve gerçeklik durumu:** Alıntı/sayfa bağımsız doğrulaması ve düzenleyici kimliği doğrulaması ayrı tutulur. Bugün ikisi de otomatik olarak doğrulanmış sayılmaz.

## Karar sırası

Yetkili kullanıcının booking ve belge ilişkisi doğrulanır. Arşivdeki dosya okunur; SHA-256, yükleme anındaki hash ile karşılaştırılır. Güncel sürüm, beyan edilen tür, model türü, alan biçimi, mevcut booking değerleri ve diğer güncel belgelerin başarılı okumaları kontrol edilir. Alanlar `missing`, `blocked` veya `review` olur. Modelin yüksek güveni bu sırayı değiştiremez.

- **Kesin engel:** Dosya yok, dosya hash uyuşmazlığı, bütünlük kontrolü yapılamıyor, eski belge sürümü, desteklenmeyen belge türü veya geçersiz alan değeri. İnsan teyidi engeli aşamaz.
- **Otomatik taslak:** Boş, geçerli, güncel, türü tutarlı, model uyarısı içermeyen, mevcut kayıtla ve okunmuş diğer güncel belgelerle çelişmeyen alanlar taslağa doldurulur. Model güveni en az 0,80 olmalı ve değer normalize edilmiş kaynak alıntısında bulunmalıdır. Ekipman tipi/adedi birlikte çözümlenmeli. Bu kontroller bağımsız kaynak doğrulaması değildir; otomatik kayıt `automatic_draft` ve `sourceStatus=unverified` taşır, insan teyidi listesi boş kalır.
- **Kaynak incelemesi:** Kullanıcı bir istisnayı çözmek veya bir alanı doğrulanmış olarak aktarmak istediğinde seçtiği alanın değeri, alıntısı ve sayfasını orijinal dosyada kontrol eder; belgenin doğru booking'e ait olduğunu teyit eder. Otomatik taslak doldurma için bütün alanların tek tek seçilmesi istenmez.
- **Gerekçeli inceleme:** Mevcut booking veya diğer güncel belgelerle fark, belge türü uyuşmazlığı, modelin bildirdiği sorun ya da düşük model güveni. En az 15 karakter açıklama zorunludur. Bu uzunluk koşulu açıklamanın doğruluğunu kanıtlamaz; denetim kaydı sağlar.

Belge okuma eylemi uygun alanları topluca taslağa kaydeder. Aynı sonucu yeniden açmak dolu alanların üzerine yazmaz. Sonraki belgeler boş kalan alanları tamamlayabilir; farklı değerler istisna olarak bırakılır. İnsan incelemesi sonrası yalnızca seçilen istisnalar kaydedilir. Bu işlem taşıyıcı teyidi, final belge onayı, release izni veya T-MAXX/INTTRA aktarımı değildir.

## Puan hesabı

| Boyut | Azami ham katkı | Şart |
|---|---:|---|
| Dosya bütünlüğü | 25 | Dosyanın SHA-256 değeri arşiv kaydıyla aynı |
| Güncel sürüm | 15 | Belgenin yerine geçmiş yeni sürüm yok |
| Tür tutarlılığı | 15 | Beyan ve model türü aynı ve desteklenen tür |
| Alan biçimleri | 15 | Dolu alanlar arasında geçerli alan oranı |
| Bağımsız kaynak doğrulaması | 20 | Henüz mevcut değil; katkı 0 |
| Tutarlılık | 10 | En az bir dolu alan, kayıt/diğer güncel belge farkı ve model sorunu yok |

Bağımsız kaynak doğrulaması bulunmadığı sürece `kontrol puanı = round(ham toplam × 0,75)`, üst sınır 60. Kesin belge engeli varsa puan 0. Bu ağırlıklar ilk sürümde operasyonel önceliklendirme içindir; istatistiksel kalibrasyonla öğrenilmiş değildir. Tek dolu doğru biçimli alanla 60 alınabilir; bunun yanında doluluk açıkça `1/8` gösterilir. Böyle bir dosya eksiksiz veya doğruluğu %60 olan dosya diye yorumlanmaz.

## Belgeler arası farklar

Aynı booking'e bağlı, güncel sürüm olan ve başarılı okuma sonucu bulunan diğer belgelerin aynı adlı alanları karşılaştırılır. Karşılaştırma Unicode normalizasyonu, boşluk sadeleştirme ve Türkçe büyük harf dönüşümü kullanır. Farklı liman kodu/adı veya farklı şirket yazılışı otomatik eşit sayılmaz. Teyit, talep ve revizyon arasındaki fark gerçek bir değişiklik olabilir; kaynak üstünlüğü varsayılmaz. Farkın diğer belge kimliği, türü ve değeri ekranda gösterilir.

Aynı içerikli belge tekrarları yeni kanıt sayılmaz. Okunmamış belgeler, uyumlu kanıt sayılmaz. Birden fazla belgenin aynı değeri vermesi puanı katlayarak yükseltmez. Bağımsız kaynak/doğru dosya eşleşmesi henüz ispatlanmadığı için belge çoğunluğu otomatik onay sağlamaz.

## Eşzamanlılık ve denetim izi

Booking veri sürümü ile kanıt sürümü ayrıdır. Yeni belge eklendiğinde ve başarılı çıkarım kaydedildiğinde veritabanı tetikleyicileri kanıt sürümünü artırır. Değerlendirmeden önce/sonra sürümler kontrol edilir; farklıysa yeniden inceleme istenir. Kullanıcının gördüğü kanıt sürümü ve politika sürümü kaydetme isteğinde zorunludur. Sunucu bütünlük, sürüm ve farkları yeniden hesaplar; istemcinin puanını veya kararını kabul etmez.

Kaydetme sırasında booking sürümü ve kanıt sürümü atomik olarak karşılaştırılır. Değerlendirme ile kayıt arasında yeni kanıt gelirse işlem reddedilir. Booking güncellemesi, booking geçmişi ve çıkarım uygulama kaydı tek SQL işlemindedir.

Uygulama kaydındaki `decision` şu kanıtları tutar: politika sürümü, puan bileşenleri, engeller, alan kararları ve farklar, booking/kanıt sürümü, insanın teyit ettiği alanlar, kontrol gerekçesi ve doğrulama yöntemi. Aynı satır belge/çıkarım kimliğini, kullanıcıyı, zamanı ve sonuç booking sürümünü içerir. Eski uygulama kayıtlarında karar bilgisi null kalır; geçmiş kayıtlar doğrulanmış gibi doldurulmaz.

## Doğrulama ve uygulama sınırları

33 ilgili otomatik test, TypeScript ve değişen modüllerin ESLint kontrolleri geçti. Testler kontrollü model cevapları, gerçek bellek içi SQLite ve taklit dosya deposu kullanır. Yüksek model güveninin engeli aşamaması, dosya bütünlüğü, eski sürüm, kaynak teyidi, gerekçeli fark onayı, belgeler arası fark ve kayıt anında yeni kanıt gelmesi test kapsamındadır. `0009_document_policy.sql` yerel veritabanına uygulandı. Canlıya yayın yapılmadı.

**Henüz tamamlanmış sayılmayan kabul işleri:** Gerçek örnek belgelerde alan bazında doğruluk ölçümü ve eşik kalibrasyonu; bağımsız PDF/OCR alıntı-sayfa doğrulayıcısı; düzenleyici kimliği/dijital imza doğrulaması; rol bazlı çift kontrol; T-MAXX kart ve kaynak önceliği kuralları; oturumlu tarayıcıda gerçek belgeyle uçtan uca test. Bu yetenekler varmış gibi puan verilmez veya otomatik onay yapılmaz.

Kalibrasyon veri seti hazırlanırken belge türü, alan, gerçek değer, kaynak sayfası, okuma sonucu ve insan kararı ayrı etiketlenmeli; aynı dosyanın sürümleri eğitim/doğrulama bölümlerine dağılmamalıdır. Öncelikli ölçüt yanlış alanın kabul edilmesi ve kritik uyuşmazlığın kaçırılmasıdır; yalnızca ortalama alan doğruluğuna bakılmaz. Yeni ağırlık/eşik veya otomatik karar yolu ayrı politika sürümü, regresyon testi ve ölçülmüş kabul kriteri gerektirir.

## Kapsamı büyütme ve başarı ölçütü

Başarı hedefi, uygulanabilir operasyon alanlarında yüksek doğrulukla otomatik doldurma ve düşük insan iş yüküdür. Kontrol puanı başarı ölçütü yerine geçmez. Ölçümlerde en az şu ayrım korunmalı: uygulanabilir alan sayısı, belgede gerçekten bulunan alan sayısı, doğru otomatik doldurulan alan sayısı, yanlış doldurulan kritik alanlar ve insanın müdahale ettiği alan sayısı. Dolu alan sayısı tek başına doğru otomasyon oranı değildir.

Bugünkü uygulama booking devrindeki 8 belge alanıyla sınırlıdır. Satış referansı, operasyon sorumlusu ve kaynak referansı formun diğer 3 alanıdır; belge metninden varsayılmaz. Konşimento, taraf adresleri, konteyner satırları ve yük kalemleri mevcut uygulamanın daha geniş alan modeline sahiptir; bu yeni booking politikası henüz bu modelin tümüne bağlanmış değildir. Kapsam 100 alanmış gibi başarı oranı üretilmez.

Bağımsız alıntı/sayfa doğrulaması ve gerçek belge ölçümleri tamamlanana kadar otomatik doldurulan değerler taslaktır. İnsan tarafından gözden geçirilmiş alan ile sadece modelden aktarılmış alan aynı statüde gösterilmez. Sonraki fazlarda alan kataloğu, belge rolü, uygulanabilirlik, birim dönüşümü ve çok satırlı yük/konteyner eşleştirmesi birlikte genişletilmelidir; boş değer yerine tahmin yazılmaz.
