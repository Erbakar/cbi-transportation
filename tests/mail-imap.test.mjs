import test from 'node:test';
import assert from 'node:assert/strict';
import {openImap,ImapError,decodeWords,imapDate,parseAddress} from '../lib/mail/imap.ts';
import {fakeImap,header} from './helpers/fake-imap.mjs';

test('reads headers with literals in small chunks, using only read-only commands',async()=>{
 const server=fakeImap({chunk:7,messages:[
  {uid:3,header:header({from:'=?UTF-8?B?QnVyw6dlIEVz?= <BurceEs@cbitransport.com>',subject:'=?UTF-8?Q?Kon=C5=9Fimento_talimat=C4=B1?=',id:'<a@x>'}),structure:'(("text" "plain" NIL NIL NIL "7bit" 1 1 NIL NIL NIL NIL)("application" "pdf" ("name" "talimat.pdf") NIL NIL "base64" 100 NIL ("attachment" ("filename" "talimat.pdf")) NIL NIL) "mixed" NIL NIL NIL NIL)',flags:'\\Seen'},
  {uid:9,header:header({subject:'VGM'})},
 ]});
 const imap=await openImap(server,{user:'automation@cbitransport.com.tr',password:'secret'});
 const box=await imap.examine();assert.deepEqual(box,{uidValidity:7,uidNext:10,exists:2});
 const uids=await imap.search('UID 1:*');assert.deepEqual(uids,[3,9]);
 const [first,second]=await imap.headers(uids);await imap.logout();
 assert.equal(first.uid,3);assert.equal(first.fromName,'Burçe Es');assert.equal(first.fromAddress,'burcees@cbitransport.com');
 assert.equal(first.subject,'Konşimento talimatı');assert.equal(first.attachments,1);assert.equal(first.seen,true);
 assert.equal(first.internalDate,'2026-11-09T07:15:00.000Z');assert.equal(first.sentAt,'2026-11-09T07:14:00.000Z');assert.equal(first.messageId,'<a@x>');
 assert.equal(second.attachments,0);assert.equal(second.subject,'VGM');
 // Never SELECT, STORE, COPY, MOVE, EXPUNGE, APPEND or a FETCH without PEEK.
 for(const c of server.commands){assert.doesNotMatch(c,/^(SELECT|STORE|UID STORE|COPY|UID COPY|MOVE|UID MOVE|EXPUNGE|APPEND|DELETE)\b/);if(/FETCH/.test(c))assert.match(c,/BODY\.PEEK\[/);}
});

test('rejected login is an auth error that never contains the password',async()=>{
 const server=fakeImap({password:'other'});
 await assert.rejects(openImap(server,{user:'u',password:'Gizli!*Parola'}),e=>e instanceof ImapError&&e.code==='auth_failed'&&!e.message.includes('Gizli'));
});

test('unexpected greeting and closed connection fail cleanly',async()=>{
 await assert.rejects(openImap(fakeImap({greeting:'* BYE go away'}),{user:'u',password:'secret'}),e=>e.code==='protocol_error');
 const closed={readable:new ReadableStream({start(c){c.close();}}),writable:new WritableStream()};
 await assert.rejects(openImap(closed,{user:'u',password:'secret'}),e=>e.code==='connection_closed');
});

test('header helpers decode Turkish encodings, addresses and IMAP dates',()=>{
 assert.equal(decodeWords('=?ISO-8859-9?Q?=DEirket_=FDhracat?='),'Şirket ıhracat');
 assert.equal(decodeWords('=?UTF-8?B?w4dhbMSxxZ9tYQ==?= =?UTF-8?B?IHBsYW7EsQ==?='),'Çalışma planı');
 assert.deepEqual(parseAddress('"Es, Borga" <BorgaEs@CBItransport.com>'),{name:'Es, Borga',address:'borgaes@cbitransport.com'});
 assert.deepEqual(parseAddress('ops@example.com'),{name:'',address:'ops@example.com'});
 assert.equal(imapDate('01-Jan-2027 00:30:00 +0300'),'2026-12-31T21:30:00.000Z');assert.equal(imapDate('garbage'),'');
});
