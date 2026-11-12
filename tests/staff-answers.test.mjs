import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleAt} from './helpers/prealert-upload-fixture.mjs';
import * as quality from '../lib/inttra-quality.ts';
export const answersLib=moduleAt('lib/mail/staff-answers.ts',{...quality},'staffAnswers,issueTarget');
const {staffAnswers,issueTarget}=answersLib;

const HBL='INTTRA: House Bill Number alanını doldurun.',ZIP='Gerçek gönderen: Posta kodu bilgisini tamamlayın.';

test('values typed after the copied notice lines are read (CBI-BFA696 reply)',()=>{
 const text='1. INTTRA: House Bill Number alanını doldurun. : 1046473\n2. Gerçek gönderen: Posta kodu bilgisini tamamlayın. : 34500\n\nDöviz olarak düzenlemiş olduğumuz faturalar…\n\nSaygılarımla';
 assert.deepEqual(staffAnswers(text,[HBL,ZIP]).map(a=>[a.path.join('.'),a.value]),[['houseBillNumber','1046473'],['partyOverrides.shipper.postalCode','34500']]);
});
test('numbered short answers and free "name : value" pairs are read',()=>{
 assert.deepEqual(staffAnswers('1) 1046473\n2) 34500',[HBL,ZIP]).map(a=>a.value),['1046473','34500']);
 assert.deepEqual(staffAnswers('posta kodu : 34500 HBL NO : 1046473',[HBL,ZIP]).map(a=>[a.path.join('.'),a.value]),[['houseBillNumber','1046473'],['partyOverrides.shipper.postalCode','34500']]);
});
test('unclear or invalid values are skipped; quoted text is ignored',()=>{
 assert.deepEqual(staffAnswers('1. yok\n> 2. Gerçek gönderen: Posta kodu bilgisini tamamlayın. : 34500',[HBL,ZIP]),[]);
 assert.deepEqual(staffAnswers('posta kodu: '+ 'x'.repeat(30),[ZIP]),[]);
 assert.deepEqual(staffAnswers('Teşekkürler, ekte.',[HBL,ZIP]),[]);
});
test('a short name matching two asked items is not guessed',()=>{
 const two=[ZIP,'Gerçek alıcı: Posta kodu bilgisini tamamlayın.'];
 assert.deepEqual(staffAnswers('posta kodu: 34500',two),[]);
 assert.deepEqual(staffAnswers('2. : 10115',two).map(a=>a.path.join('.')),['partyOverrides.consignee.postalCode']);
});
test('HBL n and party address items map to their fields; other issues are not answerable',()=>{
 assert.deepEqual(issueTarget('HBL 2: House Bill Number alanını doldurun.'),['houseBills',1,'number']);
 assert.deepEqual(issueTarget('Gerçek notify: Şehir bilgisini tamamlayın.'),['partyOverrides','notify','city']);
 assert.equal(issueTarget('INTTRA: Taşıyıcı seçimini tamamlayın.'),null);
});

const CS='Gerçek alıcı: Bina / sokak numarası bilgisini tamamlayın.',CR='Gerçek alıcı: İl / bölge bilgisini tamamlayın.',NS='Gerçek notify: Bina / sokak numarası bilgisini tamamlayın.';
test('an answer to an EARLIER notice is matched by the copied question, not by its number (CBI-06858D)',()=>{
 const reply=['1. INTTRA: Teslim bölgesi seçimini tamamlayın. : FELIXSTOWE',`2. ${CS} 12`,`3. ${CR} Nottinghamshire`,'4. Gerçek alıcı: Ülke bilgisini tamamlayın. ENGLAND - UK',`5. ${NS} 7A`,'6. Gerçek notify: Ülke bilgisini tamamlayın. ENGLAND - UK'].join('\n');
 assert.deepEqual(staffAnswers(reply,[CS,CR,NS]).map(a=>[a.path.join('.'),a.value]),[['partyOverrides.consignee.streetNumber','12'],['partyOverrides.consignee.state','Nottinghamshire'],['partyOverrides.notify.streetNumber','7A']]);
});
test('values that belong to another address part are refused (the real CBI-06858D reply files nothing)',()=>{
 const reply=['1. INTTRA: Teslim bölgesi seçimini tamamlayın. : FELIXSTOWE',`2. ${CS} NG24 2NH NEWARK`,`3. ${CR} LONG HOLLOW WAY`,'4. Gerçek alıcı: Ülke bilgisini tamamlayın. ENGLAND - UK',`5. ${NS} NG24 2NH NEWARK`,'6. Gerçek notify: Ülke bilgisini tamamlayın. ENGLAND - UK'].join('\n');
 assert.deepEqual(staffAnswers(reply,[CS,CR,NS]),[]);
 assert.deepEqual(staffAnswers('1) NEWARK',[CS]),[],'a building number needs a digit');
 assert.deepEqual(staffAnswers('1) 2-6',[CS]).map(a=>a.value),['2-6']);
});
