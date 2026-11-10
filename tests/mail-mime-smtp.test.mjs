import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleAt} from './helpers/prealert-upload-fixture.mjs';
import {decodeWords,utf8Base64,automatedMail} from '../lib/mail/imap.ts';
import {names,validate} from '../lib/domain.ts';
import {fakeSmtp} from './helpers/fake-smtp.mjs';

const {sendSmtp,buildReply,validAddress,SmtpError}=moduleAt('lib/mail/smtp.ts',{utf8Base64},'sendSmtp,buildReply,validAddress,SmtpError');
const {parseMail,replyText,headerParam}=moduleAt('lib/mail/mime.ts',{decodeWords},'parseMail,replyText,headerParam');
const {customerRequests,requestText}=moduleAt('lib/mail/requests.ts',{names},'customerRequests,requestText');
const enc=s=>new TextEncoder().encode(s);

test('multipart mail yields the text and real attachments, including encoded Turkish names',()=>{
 const pdf=Buffer.from('%PDF-1.7\nfixture').toString('base64');
 const raw=['From: Burçe <burcees@cbitransport.com>','Subject: =?UTF-8?B?VGFsaW1hdA==?=','Content-Type: multipart/mixed; boundary="b1"','','--b1','Content-Type: multipart/alternative; boundary="b2"','','--b2','Content-Type: text/plain; charset=utf-8','Content-Transfer-Encoding: quoted-printable','','Ekte konşimento talimat=C4=B1 var.=','Booking: EBKG1','--b2','Content-Type: text/html; charset=utf-8','','<p>HTML</p>','--b2--','--b1','Content-Type: application/pdf; name="x.pdf"',"Content-Disposition: attachment; filename*=utf-8''Konşimento%20talimatı.pdf".replace('ş','%C5%9F').replace('ı','%C4%B1'),'Content-Transfer-Encoding: base64','',pdf,'--b1','Content-Type: image/png; name="logo.png"','Content-Disposition: inline; filename="logo.png"','Content-Transfer-Encoding: base64','','iVBORw0KGgo=','--b1--',''].join('\r\n');
 const mail=parseMail(enc(raw));
 assert.equal(mail.text,'Ekte konşimento talimatı var.Booking: EBKG1');
 assert.deepEqual(mail.attachments.map(a=>[a.filename,a.mime]),[['Konşimento talimatı.pdf','application/pdf'],['logo.png','image/png']]);
 assert.equal(new TextDecoder().decode(mail.attachments[0].bytes),'%PDF-1.7\nfixture');
 assert.equal(parseMail(enc('Content-Type: text/html; charset=utf-8\r\n\r\n<div>Brüt&nbsp;ağırlık<br>12.000 kg</div>')).text,'Brüt ağırlık\n12.000 kg');
 assert.equal(headerParam('attachment; filename="a \\"b\\".pdf"','filename'),'a "b".pdf');
});

test('reply text keeps only the new answer above the quoted original',()=>{
 assert.equal(replyText('Brüt ağırlık 12.400 kg\nMühür: ML123\n\nOn Mon, 9 Nov 2026 CBI wrote:\n> Sayın ilgili\n> 1. Brüt ağırlık'),'Brüt ağırlık 12.400 kg\nMühür: ML123');
 assert.equal(replyText('Seal ML1\n\nFrom: automation@cbitransport.com.tr\nSent: Monday\nSubject: Re'),'Seal ML1');
 assert.equal(replyText('Seal ML1\n-----Original Message-----\nold'),'Seal ML1');
 assert.equal(replyText('Mühür ML1\n9 Kas 2026 Pzt 10:00 tarihinde CBI şunu yazdı:\nold'),'Mühür ML1');
});

test('auto-replies, bounces and lists are recognised so they never get an answer',()=>{
 const h=o=>new Map(Object.entries(o));
 assert.equal(automatedMail(h({'auto-submitted':'auto-replied'}),'a@x.com'),true);
 assert.equal(automatedMail(h({'auto-submitted':'no'}),'a@x.com'),false);
 assert.equal(automatedMail(h({precedence:'bulk'}),'a@x.com'),true);
 assert.equal(automatedMail(h({'list-id':'<x>'}),'a@x.com'),true);
 assert.equal(automatedMail(h({}),'MAILER-DAEMON@x.com'),true);
 assert.equal(automatedMail(h({subject:'Otomatik yanıt: Talimat'}),'a@x.com'),true);
 assert.equal(automatedMail(h({subject:'Re: Talimat'}),'a@x.com'),false);
});

test('SMTP uses STARTTLS before AUTH, dot-stuffs the body and closes',async()=>{
 const server=fakeSmtp();
 const data=buildReply({from:'automation@cbitransport.com.tr',fromName:'CBI Transportation',to:['ops@customer.com'],cc:['burcees@cbitransport.com'],subject:'Re: Talimat [CBI-ABC123]',messageId:'<m1@cbitransport.com.tr>',inReplyTo:'<c1@customer.com>',references:['<c1@customer.com>'],text:'.dot line\nİkinci satır'});
 await sendSmtp(server.socket(),{host:'mail.test',user:'automation@cbitransport.com.tr',password:'secret',from:'automation@cbitransport.com.tr',recipients:['ops@customer.com','burcees@cbitransport.com'],data});
 const c=server.log.commands;assert.equal(server.log.tls,true);
 assert.ok(c.indexOf('STARTTLS')<c.indexOf('AUTH PLAIN ***'));assert.deepEqual(c.filter(x=>x.startsWith('RCPT')),['RCPT TO:<ops@customer.com>','RCPT TO:<burcees@cbitransport.com>']);
 assert.match(server.log.data,/^Subject: =\?UTF-8\?B\?|Subject: Re: Talimat \[CBI-ABC123\]/m);assert.match(server.log.data,/^In-Reply-To: <c1@customer\.com>$/m);assert.match(server.log.data,/^Auto-Submitted: auto-replied$/m);
 const body=Buffer.from(server.log.data.split('\r\n\r\n')[1].replace(/\r\n/g,''),'base64').toString();assert.equal(body,'.dot line\r\nİkinci satır');
 assert.ok(server.log.closed>=1);
});

test('SMTP failures report whether the message may have been delivered',async()=>{
 const send=(o,opts={})=>sendSmtp(fakeSmtp(o).socket(),{host:'h',user:'u',password:'secret',from:'a@x.com',recipients:['b@y.com'],data:'Subject: x\r\n\r\nx',...opts});
 await assert.rejects(send({password:'other'}),e=>e instanceof SmtpError&&e.code==='auth_failed'&&e.phase==='before_data');
 await assert.rejects(send({rejectRecipient:'b@y.com'}),e=>e.code==='recipient_rejected'&&e.phase==='before_data');
 await assert.rejects(send({failAt:'message'}),e=>e.code==='message_rejected'&&e.phase==='after_data');
 await assert.rejects(send({failAt:'message-close'}),e=>e.phase==='after_data');
});

test('header injection and invalid addresses are refused',()=>{
 assert.throws(()=>buildReply({from:'a@x.com',fromName:'A',to:['b@y.com\r\nBcc: c@z.com'],cc:[],subject:'s',messageId:'<m@x>',inReplyTo:'',references:[],text:'t'}));
 assert.equal(validAddress('ops@customer.com'),true);assert.equal(validAddress('a b@x.com'),false);assert.equal(validAddress('x@y'),false);
 assert.equal(utf8Base64('ş'),'xZ8=');
});

test('check messages become a customer list; CBI-only items stay with staff',()=>{
 const f=(value,confidence=1)=>({value,source:value?'PDF':'',confidence});
 const ex={fields:{description:f('MACHINE PARTS'),packageCount:f('10'),packageType:f('PALLET'),grossWeightKg:f(null),bookingNumber:f(null),shipperName:f('A'),shipperAddress:f('Street ...'),consigneeName:f('B'),consigneeAddress:f('Addr'),notifyName:f('C'),notifyAddress:f('Addr'),mblShipperName:f(null),mblShipperAddress:f('x'),mblConsigneeName:f('x'),mblConsigneeAddress:f('x'),mblNotifyName:f('x'),mblNotifyAddress:f('x'),loadPort:f('Ambarli'),dischargePort:f('Hamburg',.5),vessel:f(null),voyage:f('1'),containerNumber:f(null),containerType:f(null),freightPayment:f(null),blType:f('Express')},issues:[],documentType:'instruction',containerCount:2,cargoLineCount:0,cargoLines:[],containers:[{containerNumber:f('MSKU1234565'),containerType:f('40HC'),sealNumber:f(null)},{containerNumber:f('TGHU1234567'),containerType:f(null),sealNumber:f('S2')}]};
 const issues=[...validate(ex),'Belge çelişkisi · loadPort: Ambarli / Mersin','INTTRA ön kontrol: taraf kodu bulunamadı.'];
 const {ask,staff}=customerRequests(issues);
 const tr=ask.map(a=>a.tr);
 assert.ok(tr.includes('Brüt ağırlık (kg)'));assert.ok(tr.includes('Navlun ödeme şekli (prepaid / collect)'));assert.ok(tr.some(t=>t.startsWith('Gönderici açık adresi')));assert.ok(tr.some(t=>t.startsWith('Boşaltma limanı – lütfen teyit')));
 assert.ok(tr.includes('Konteyner 2 – Konteyner tipi'));assert.ok(tr.some(t=>t.startsWith('Yükleme limanı – belgelerde farklı')));
 assert.ok(!tr.some(t=>/MBL|Gemi/.test(t)),'MBL parties and vessel come from T-MAXX and are never asked');
 assert.ok(staff.some(s=>s.startsWith('MBL gönderen')));assert.ok(tr.includes('Booking numarası'),'CBI senders are asked for the booking');assert.ok(staff.includes('INTTRA ön kontrol: taraf kodu bulunamadı.'));
 assert.ok(ask.every(a=>a.en&&!a.en.includes('undefined')));
 const text=requestText({tag:'CBI-ABC123',round:1,ask,maxRounds:3});
 assert.match(text,/CBI-ABC123 numarasıyla/);assert.match(text,/Dear Sir or Madam/);assert.match(text,/1\. /);assert.doesNotMatch(text,/operasyon ekibimiz/);
 assert.match(requestText({tag:'CBI-ABC123',round:3,ask,maxRounds:3}),/operasyon ekibimiz dönüş yapacaktır/);
});
