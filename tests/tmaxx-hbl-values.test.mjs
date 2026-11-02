import test from 'node:test';import assert from 'node:assert/strict';import {tmaxxValueEqual} from '../lib/tmaxx-values.ts';
const source='FIRAT PLASTİK KAUÇUK SANAYİ VE TİCARET A.Ş.\nTÜRKOBA MAH. FIRAT PLASTİK CAD. NO:23\nBÜYÜKÇEKMECE - İSTANBUL / TÜRKİYE';
const saved='FIRAT PLASTIK KAUCUK SANAYI VE TICARET A.S.\nTURKOBA MAH. FIRAT PLASTIK CAD. NO:23\nBUYUKCEKMECE - ISTANBUL / TURKIYE';
test('HBL party read-back accepts the observed Turkish transliteration',()=>{
 for(const field of ['consignor','consignee','notify']){
  assert.equal(tmaxxValueEqual(field,saved,source),true);
  assert.equal(tmaxxValueEqual(field,'C G I O S U c g i o s u','Ç Ğ İ Ö Ş Ü ç ğ ı ö ş ü'),true);
 }
});
test('HBL party comparison still rejects changed names, numbers, accents and formatting',()=>{
 for(const value of [saved.replace('FIRAT','FIRAN'),saved.replace('NO:23','NO:24'),saved.replace('A.S.','AS'),saved.replace('\n',' '),saved.toLowerCase(),saved+'\n34537',null,undefined])assert.equal(tmaxxValueEqual('consignor',value,source),false);
 assert.equal(tmaxxValueEqual('consignee','Cafe','Café'),false);
});
test('transliteration never loosens references, container numbers or cargo comparisons',()=>{
 for(const field of ['hblNo','bookingNo','no','sealNo','goodDescription','quantityAndDescription'])assert.equal(tmaxxValueEqual(field,'IS23','İŞ23'),false);
});
