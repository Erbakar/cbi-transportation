import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validate,containerValid,minimumFields,overall} from '../lib/domain.ts';
function good(){const fields=Object.fromEntries(minimumFields.map(k=>[k,{value:'Doğrulanmış bilgi',source:'Belge kaynak metni',confidence:.99}]));Object.assign(fields,{description:{value:'16 MPA -130 mm3 Abrasion Moulded Edge Rolled Conveyor Belt',source:'16 MPA -130 mm3 Abrasion Moulded Edge Rolled Conveyor Belt',confidence:.99},grossWeightKg:{value:'23500',source:'23.500 KG BRÜT',confidence:.99},netWeightKg:{value:'23320',source:'23.320 KG NET',confidence:.99},packageCount:{value:'6',source:'6 PACKAGES',confidence:.99},containerNumber:{value:'ARKU8360679',source:'ARKU836067-9',confidence:.99}});return {fields,issues:[],documentType:'instruction',containerCount:1,cargoLineCount:1,containers:[fields],cargoLines:[fields]};}
test('Talimat örneğinde ürün teknik özellikleri description olarak korunur',()=>assert.deepEqual(validate(good()),[]));
test('Description ağırlık satırları içerirse aktarım durur',()=>{const x=good();x.fields.description.value+=' NO. OF PACKAGES//NET WEIGHT: 6 PACKAGES / 23.320 KG NET';assert.ok(validate(x).some(s=>s.includes('ayrıştırma')||s.includes('Ayrıştırma')))});
test('Tekrarlanan kap sayısı toplanırsa kalem toplamı doğrulaması engeller',()=>{const x=good();x.cargoLines=[structuredClone(x.fields)];x.fields.packageCount.value='12';assert.ok(validate(x).some(s=>s.includes('toplamı')))});
test('Net ağırlık brütten büyükse reddedilir',()=>{const x=good();x.fields.netWeightKg.value='24000';assert.ok(validate(x).some(s=>s.includes('büyük olamaz')))});
test('Eksik MBL tarafları HBL ile doldurulmaz',()=>{const x=good();x.fields.mblConsigneeName.value=null;assert.ok(validate(x).some(s=>s.includes('MBL alıcı')))});
test('Eksik kaynak veya düşük güven engeller',()=>{const x=good();x.fields.bookingNumber.confidence=.6;assert.ok(validate(x).some(s=>s.includes('Booking')))});
test('Konteyner kontrol basamağı',()=>{assert.equal(containerValid('ARKU836067-9'),true);assert.equal(containerValid('ARKU8360678'),false)});
test('Belirsiz sayı biçimi reddedilir',()=>{const x=good();x.fields.grossWeightKg.value='23.500,00';assert.ok(validate(x).some(s=>s.includes('sayısal biçim')))});
test('Taslak talimat yerine aktarılamaz',()=>{const x=good();x.documentType='draft';assert.ok(validate(x).some(s=>s.includes('talimat olarak')))});
test('Yarım adresi tahmin etmez',()=>{const x=good();x.fields.notifyAddress.value='Route de Jorf Las...';assert.ok(validate(x).some(s=>s.includes('yarım')))});
test('Kısmi başarı tamamlandı değildir, belirsizlik yeniden yazmaya uygun değildir',()=>{assert.equal(overall([{status:'created'},{status:'failed'}]),'failed');assert.equal(overall([{status:'created'},{status:'unknown'}]),'unknown');assert.equal(overall([{status:'created'},{status:'created'}]),'complete')});
