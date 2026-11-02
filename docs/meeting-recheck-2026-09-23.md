# Toplantı kararlarının yeniden kontrolü — 23 Eylül

Kaynak: toplantı transkriptinden ve ekranlardan daha önce hazırlanmış `Toplanti_Analizi_ve_Is_Plani_2026-09-23.md`; kullanıcı tarafından bildirilen Cargo Description ekranı. Bu kontrolde video baştan sona yeniden oynatılmadı. Kod, otomatik kontroller ve yerel form karşılaştırıldı; yeni canlı SI/HBL gönderilmedi.

## Bulunan ve düzeltilen eksikler

1. **Cargo Description görünümü:** Tam HS, kaynak referansları ve net ağırlık gönderime ekleniyor fakat düzenlenebilir açıklama ham metni gösteriyordu. Tam açıklama artık doğrudan bu alanda gösterilir. Ayrı tam HS/HTS girişi ve tekrarlayan açıklama önizlemesi kaldırıldı. INTTRA kısa HS/NCM/Marks dönüşümü korunur.
2. **Düzenlenmiş açıklamanın korunması:** Hazırlanan açıklama üzerinde açık kullanıcı düzenlemesi ayrı işaretlenir. T-MAXX ve INTTRA bu metni yeniden kaynak satırları eklemeden kullanır. Eski kayıtlar işaret taşımadığından mevcut tamamlama kuralından yararlanır. Kullanıcının açıklamada düzelttiği HS CODE satırı kısa HS koduna da kaynak olur.
3. **Otomatik belge türünün görünürlüğü:** Belge adedi otomatik belirlendiğinde seçim sadece “Otomatik” yazıyordu. Artık “Seaway / Express (otomatik)” veya “Original (otomatik)” görünür. Otomatik değer açık kullanıcı seçimine dönüştürülmez.

## Karar karşılaştırması

| Toplantı kararı | Kontrol sonucu |
|---|---|
| Referans penceresi, zorunlu referans, başlık ve kopyalama | Mevcut akış kodda korunuyor; bu tur yeniden canlı yükleme yapılmadı |
| MBL/gerçek HBL taraflarının ayrılması, ajente kuralı | Kural ve form mevcut; otomatik testler geçti |
| Notify boş/same-as olduğunda consignee; farklıysa koru | Ayrıştırma ve manuel uygulama kontrolleri geçti |
| Taşıma Destination / HBL final delivery ayrımı | Ayrı alanlar ve gönderim eşleştirmesi mevcut |
| ENS Carrier, Payment Other, gerçek varış bölgesi | Kurallar mevcut; belirsiz UK ayrımı kullanıcıya kalır |
| HBL sayısının konteyner sayısından türetilmemesi | Gerçek yük/konteyner eşleşmesi testleri geçti |
| HBL numarasının uydurulmaması | Mevcut numara veya kullanıcı girişi; doğrulama mevcut |
| Tam HS/ref/net açıklamada; kısa HS/NCM/Marks | Ekran eksikliği bu tur düzeltildi; form çıktısı ve dönüşüm testleri eklendi |
| Kaynak hacminin taşınması | Kodda mevcut; mevcut testler geçti |
| PP-port / PP-door / CC altı masraf dağılımı | Kural testleri geçti; kompakt tablo mevcut |
| SWB 1 ve non-negotiable yok; Original 3+3 | Mevcut kurallar korunuyor; otomatik tür adı görünür hale getirildi |
| İki bildirim alanında iki şirket adresi | Varsayılan ve doğrulama mevcut |
| Kaynakta kesin adres bilgilerini doldur; tahmin etme | Önceki adres düzeltmesi mevcut; regresyon testleri geçti |
| Eksik listesi ilgili alanı/modalı açsın | Uygulama mevcut; önceki posta kodu senaryosu doğrulandı. Tüm hata ifadeleri için kapsamlı UI doğrulaması henüz yok |
| Formda görünen metin gönderilenle aynı olsun | Cargo Description için form render ve iki platform ortak dönüşüm testi eklendi |

## Tamamlandı sayılamayan konular

- Multiple HBL gönderiminin gerçek INTTRA tarafından kabulü ve T-MAXX resmi raporundan gerçek PDF alınması canlı kabul denemesi gerektiriyor; mevcut doğrulama örnek servis verileriyle sınırlı.
- Aynı konteynerde birden fazla bağımsız T-MAXX mal satırının belirsiz eşleşmesi hâlâ durdurulur. Çok ürünün tek açıklamada korunması desteklenir; bu, her çoklu satır senaryosunun desteklendiği anlamına gelmez.
- Eksik alana yönlendirme metin/etiket eşleşmelerine dayanıyor. Tüm hata türleri için kesin alan kimliği ve kapsamlı tarayıcı testi henüz tamamlanmış değil.
- Kaynak yenilemede kullanıcı düzeltmeleri korunur; değişen kaynak referansındaki eski otomatik değerleri kullanıcı düzeltmelerinden ayıran tam kaynak takibi ayrıca geliştirilmelidir.

## Bu tur doğrulama

108 otomatik test, TypeScript kontrolü ve üretim derlemesi başarılı. Yerel tarayıcıda açıklamadaki HS/REF/VES.NO/PO değerleri, ayrı HS/HTS alanının kaldırılması ve otomatik SWB etiketinin görünmesi doğrulandı. Canlı konşimento oluşturulmadı.


## İkinci kontrol — kullanıcı tekrar inceleme isteği

Bu tur toplantı karar listesi; referans yükleme akışı, taraf kuralları, form sırası, çıktı hazırlayıcıları ve testlerle yeniden karşılaştırıldı. Yeni canlı SI/HBL gönderilmedi.

Ek bulgular ve düzeltmeler:
- Belge türü artık form ve INTTRA gönderiminde aynı karar fonksiyonundan gelir. Kayıt yeniden açıldığında ajente bayrağı yok ama HBL kapsamı mevcutsa SWB kararı gönderimde kaybolmaz. Açık ajentesiz bilgisi varsa kaynak talimat esas alınır.
- Belge türü belirsizleştiğinde önceki otomatik 1/3 adedi temizlenir. Açık kullanıcı belge türü düzeltmesi korunur.
- Net kilo alanı değiştirildiğinde açıklamadaki standart “NET WEIGHT: … KG” satırı güncellenir veya temizlenir. Serbest biçimde elle yazılmış farklı açıklamalar sessizce değiştirilmez.
- Carrier Supplied doğrulaması artık checkbox üzerinde de eksik işareti taşır; ilgili hata bu kontrole yönlenir.

112 test geçti; TypeScript ve üretim derlemesi ayrıca kontrol edildi. Önceki rapordaki canlı kabul, belirsiz çoklu mal satırı, bütün hata türlerinin kesin alan eşleştirmesi ve kaynak değişimi takibi sınırları devam ediyor. Hacim eşleştirmesi INTTRA için doğrulandı; T-MAXX tarafında ayrı hacim alanı eşleştirmesi bu incelemede doğrulanmadı. Bu nedenle bütün toplantı işlerinin eksiksiz tamamlandığı iddia edilmiyor.
