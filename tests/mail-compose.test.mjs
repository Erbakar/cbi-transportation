import test from 'node:test';import assert from 'node:assert/strict';
import {moduleAt} from './helpers/prealert-upload-fixture.mjs';
const {acceptComposed}=moduleAt('lib/server/mail-compose.ts',{runtime:()=>({})},'acceptComposed');
const ask=[{tr:'Brüt ağırlık',en:'Gross weight'},{tr:'Konteyner tipi',en:'Container type'}];
const req={kind:'request',tag:'CBI-ABC123',round:1,maxRounds:3,ask,senderRequests:''};
const j=(tr,en)=>JSON.stringify({tr,en});
const good=n=>({intro:'CBI-ABC123 talimatınız için teşekkürler.',items:[...Array(n)].map((_,i)=>`Soru ${i+1}?`),closing:'Lütfen yanıtlayın.'});
test('a composed request must keep the tag and exactly one numbered line per item',()=>{
 const out=acceptComposed(req,j(good(2),good(2)));assert.match(out,/^Sayın İlgili,\n\nCBI-ABC123[^\n]*\n\n1\. Soru 1\?\n2\. Soru 2\?\n/);assert.match(out,/----------\n\nDear Sir or Madam,/);
 assert.equal(acceptComposed(req,j(good(3),good(2))),null,'an extra item');
 assert.equal(acceptComposed(req,j(good(1),good(1))),null,'a dropped item');
 assert.equal(acceptComposed(req,j({...good(2),intro:'Talimatınız için teşekkürler, sağolun.'},good(2))),null,'tag missing');
 assert.equal(acceptComposed(req,j({...good(2),closing:'Bkz. https://evil.test'},good(2))),null,'links are never sent');
 assert.equal(acceptComposed(req,'not json'),null);
});
test('a composed confirmation must carry every platform and reference verbatim',()=>{
 const c={kind:'confirm',tag:'CBI-ABC123',created:[{platform:'tmaxx',kind:'hbl',reference:'YK.S.E.26.11.00001'},{platform:'inttra',kind:'mbl',reference:'551274342'}],senderRequests:''};
 const t={intro:'CBI-ABC123 talimatınız işlendi.',items:['HBL: T-MAXX, YK.S.E.26.11.00001','MBL: INTTRA, 551274342'],closing:'Teşekkürler.'};
 assert.match(acceptComposed(c,j(t,t)),/\n- HBL: T-MAXX, YK\.S\.E\.26\.11\.00001\n- MBL: INTTRA, 551274342\n/);
 assert.equal(acceptComposed(c,j({...t,items:['HBL: T-MAXX, YK.S.E.26.11.00001','MBL: INTTRA, 551274343']},t)),null);
});
