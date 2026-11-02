import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {createRequire} from 'node:module';
const bundled=await build({entryPoints:['lib/notification-message.ts'],bundle:true,write:false,platform:'node',format:'cjs'}),compiled={exports:{}};
new Function('require','module','exports',bundled.outputFiles[0].text)(createRequire(import.meta.url),compiled,compiled.exports);
const {notificationMessage:notice}=compiled.exports;
test('saved PDF and confirmed archive transfer are different user-visible stages',()=>{
 const waiting=notice('PDF güvenle kaydedildi. T-MAXX arşivi erişilebilir olduğunda otomatik aktarılacak; bu sayfayı kapatabilirsiniz.');
 assert.equal(waiting.tone,'info');assert.match(waiting.title,/bekleniyor/);assert.match(waiting.description,/yeniden yüklemeniz gerekmez/);
 const complete=notice('PDF, T-MAXX Pre-alert arşivine kaydedildi ve geri okunarak doğrulandı.');assert.equal(complete.tone,'success');assert.match(complete.title,/tamamlandı/);assert.doesNotMatch(complete.description,/geri okunarak/);
});
test('ambiguous and pending operations cannot be presented as successfully transferred',()=>{
 for(const message of ['PDF kaydedildi. Otomatik aktarım bekleniyor.','Gönderim sonucu belirsiz. Tekrar gönderilmedi.','Aktarım doğrulanamadı.','İşlem tamamlanamadı.','Talimat kaydedildi. Belge kontrolü başlıyor.'])assert.notEqual(notice(message,'success').tone,'success',message);
});
test('position detection asks the user to review; uncertain matches ask for a manual position',()=>{
 const found=notice('Pozisyon belgedeki konşimento bilgileriyle bulundu.');assert.equal(found.tone,'success');assert.match(found.description,/Kontrol edip kaydedin/);
 const missing=notice('Belgeden tek bir pozisyon doğrulanamadı. Pozisyon numarasını girerek devam edebilirsiniz.');assert.equal(missing.tone,'warning');assert.match(missing.description,/Pozisyonu bul/);
 const manual=notice('Pozisyon tekil olarak bulunamadı. Tam T-MAXX referansını girin.','error');assert.equal(manual.tone,'warning');assert.match(manual.description,/Tam pozisyon numarasını girip/);assert.doesNotMatch(manual.description,/tekil|PDF/);
});
test('existing documents explain that no second record was created',()=>{
 const n=notice('T-MAXX’teki mevcut Pre-alert ile eşleştirildi; belge yeniden yüklenmedi.');assert.equal(n.tone,'success');assert.match(n.description,/İkinci bir kayıt oluşturulmadı/);
});
test('database, authentication details, raw JSON, English errors and stack traces do not reach the user',()=>{
 for(const message of ['MongoSocketOpenException: 127.0.0.1:27017 Connection refused','D1_ERROR: SQL SELECT * FROM secrets','TypeError: Cannot read properties','HTTP 503 Service Unavailable','500','{"error":"internal","password":"secret"}','Authorization: Bearer secret','password=secret','https://internal.example/api?token=secret','new_provider_code','Request failed','[object Object]']){
  const n=notice(new Error(message),'error');assert.ok(n);assert.equal(n.tone,'error');assert.doesNotMatch(n.description,/secret|127\.0\.0\.1|Mongo|D1_ERROR|TypeError|HTTP 503|\{\"|Bearer|internal\.example|new_provider_code|Request failed|object Object/);
 }
});
test('network failures do not claim failure to write or recommend blind resend',()=>{
 for(const message of ['Failed to fetch','request timed out']){const n=notice(message,'error');assert.match(n.description,/kayıt durumunu kontrol edin/);assert.doesNotMatch(n.description,/gönderilmedi|yeniden yükleyin|tekrar gönderin/);}
});
test('business details and deliberate warning severity are preserved',()=>{
 const text='Özet eksik: S.E.26.08.00568 dosyası okunamadı. Listeyi yenileyin.';assert.deepEqual(notice(text,'warning'),{tone:'warning',title:'Kontrolünüz gerekiyor',description:text});
 assert.match(notice('Konteyner numarası 4 harf ve 7 rakam olmalı.','warning').description,/4 harf ve 7 rakam/);
 assert.equal(notice(''),null);assert.equal(notice(null),null);
});
