# INTTRA ülke eşleştirmesi — 27 Ekim 2026

`37f32df0-acae-48f5-b5d9-79ab1e9dcd30` kaydında iki HBL'nin gönderen posta
kodları kaydedilmişti. Kontrol, kaynak ülke `TÜRKİYE` ile INTTRA'nın
`TURKEY` seçeneğini eşleştiremediği için aktarım öncesinde duruyordu.

Form, tek HBL ve çoklu HBL aktarım hazırlığı artık aynı ülke eşleştiricisini
kullanıyor. Türkçe karakterler, harf büyüklüğü ve çevre boşlukları
normalleştiriliyor; `Türkiye`, `Turkiye`, `Turkey`, `TR` ve `TUR` aynı
ülkeyi ifade ediyor. Ülkenin kimliği ve gönderilecek adı güncel INTTRA
listesinden alınıyor; sabit bir ülke kimliği üretilmiyor.

Mevcut açık seçimler korunuyor. Birden fazla eşleşme, tanınmayan ülke,
eksik seçenek ve yalnız benzer ülke adları otomatik kabul edilmiyor.
Ham belge alanı ve manuel girişler değiştirilmiyor.

## Doğrulama

- 639 otomatik test, TypeScript kontrolü ve üretim derlemesi geçti.
- Tek/çoklu HBL testleri kaynak ülke, adres, posta kodu ve manuel
  değişikliklerin korunmasını; belirsiz seçeneklerin engellenmesini kapsıyor.
- Gerçek kayıtta yalnız `check` çalıştırıldı. Sonuç `ready`, uyarılar `[]`.
  Kaynak ülke hâlâ `TÜRKİYE`; güncel platform karşılığı `TURKEY / TR` ve
  `101078`. İki HBL'nin `34537` posta kodu ve tüm manuel girişleri korundu.
- Kap 1.515, brüt 45.770 kg, net 44.873,34 kg; iki konteyner ve HBL
  eşleşmeleri korundu. Diğer üç kayıt değişmedi.
- Canlı tarayıcıda “Aktarıma hazır” ve etkin “Platformlara aktar” görüldü.
- Giriş/çıkış, çıkış sonrası korunan erişimin 401 dönmesi ve T-MAXX/INTTRA
  hazır bağlantıları doğrulandı. Dağıtım bağlantıları ve ayarlar değişmedi.
- Gerçek aktarım, SI review/submit veya HBL oluşturma yapılmadı. İki
  platform teslimi hâlâ `waiting`; hazır durumu taşıyıcı kabulü değildir.

## Dağıtım

Önceki sürüm `4730ba9f-b4de-4055-852b-66d1e01090aa`, yeni sürüm
`0e98444c-2d81-4f58-b666-3d7b6520575b`. Önceki 237 modül canlı kaynaktan
yedeklendi ve yerel önceki derlemeyle eşleşti. Ortam ayarları korunarak
dağıtıldı. Veri geçişi yapılmadı. Kaynak kopyaları, önce/sonra kayıtları ve
test sonuçları `.private/country-match-fix-2026-10-27/` içinde tutuluyor.
