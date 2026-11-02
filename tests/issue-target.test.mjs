import test from 'node:test';import assert from 'node:assert/strict';import {issueTarget} from '../lib/issue-target.ts';
test('INTTRA warning links reach the approval section',()=>{assert.equal(issueTarget('INTTRA 10136: NOTICE: Booking Number was not found').selector,'#inttra-review');});
test('missing fields resolve to stable controls, with row, role and HBL scope',()=>{
 for(const [message,selector] of [['INTTRA: Belge düzenleme yeri seçimini tamamlayın.','[data-field-label="Belge düzenleme yeri"]'],['Belge tipi: belgede bulunamadı.','[data-field-label="MBL belge türü"]'],['Mal kalemi 2: net ağırlık brütten büyük olamaz.','[data-cargo-index="1"] [data-field-key="netWeightKg"]'],['Mal kalemi 3: T-MAXX mal satırını seçin.','[data-cargo-index="2"] [data-field-key="tmaxxPackId"]'],['Konteyner 2: Mühür numarası eksik veya belirsiz.','#container-seal-1'],['HBL 2: House Bill Number alanını doldurun.','#hbl-number-1']])assert.equal(issueTarget(message).selector,selector,message);
 const party=issueTarget('HBL 2: Gerçek alıcı: Posta kodu bilgisini tamamlayın.');assert.equal(party.party,'consignee');assert.equal(party.billIndex,1);assert.equal(party.selector,'[data-party="consignee"] [data-field-key="postalCode"]');
 assert.equal(issueTarget('INTTRA: masraf satırı 3 için tür, ödeme koşulu ve ödeyen tarafı tamamlayın.').selector,'[data-charge-index="2"]');assert.equal(issueTarget('Bağlantı hatası').section,'source');
});

test('unscoped platform package errors target the actual cargo selector',()=>{assert.equal(issueTarget('Ambalaj: platform karşılığı tekil değil (PAKET).').selector,'[data-cargo-index="0"] [data-field-key="packageType"]');assert.equal(issueTarget('Konteyner tipi T-MAXX listesinde tekil eşleşmiyor.').selector,'#container-type-0');});
