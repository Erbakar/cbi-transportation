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
test('transliteration never loosens identifiers or untransformed pack descriptions',()=>{
 for(const field of ['hblNo','bookingNo','no','sealNo','goodDescription'])assert.equal(tmaxxValueEqual(field,'IS23','İŞ23'),false);
});
test('HBL text ignores only T-MAXX layout (line endings, repeated spaces, typographic quotes); a real difference is shown',async()=>{
 const {tmaxxTextDiff}=await import('../lib/tmaxx-values.ts');
 const sent="Maersk Lojistik Hizmetleri Anonim Şirketi  A.Ş ON BEHALF OF   ARÇELIK AS.\nKARAAGAC CAD. NO:2-6 \nCURRY’S NEWARK CAMPUS\n";
 assert.equal(tmaxxValueEqual('consignor',"Maersk Lojistik Hizmetleri Anonim Sirketi A.S ON BEHALF OF ARCELIK AS.\r\nKARAAGAC CAD. NO:2-6\r\nCURRY'S NEWARK CAMPUS",sent),true);
 assert.equal(tmaxxValueEqual('consignor',"Maersk Lojistik Hizmetleri Anonim Sirketi A.S ON BEHALF OF ARCELIK AS.\nKARAAGAC CAD. NO:2-7\nCURRY'S NEWARK CAMPUS",sent),false);
 assert.equal(tmaxxValueEqual('consignee','CURRYS GROUP','CURRYS GROUP LIMITED'),false);
 assert.match(tmaxxTextDiff('KARAAGAC CAD. NO:2-7','KARAAGAC CAD. NO:2-6'),/20\. karakterden sonra T-MAXX "C CAD\. NO:2-7", beklenen "C CAD\. NO:2-6"/);
 assert.match(tmaxxTextDiff(null,'X'),/boş/);
});
