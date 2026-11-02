import test from 'node:test';import assert from 'node:assert/strict';
import {setup} from './helpers/prealert-upload-fixture.mjs';
test('PDF plus position creates standalone PRA archive on position, verifies bytes, and never creates booking',async()=>{const s=setup(),saved=await s.api.createPrealert('alice',s.form());const result=await s.api.syncPrealert(saved.id,'alice');assert.equal(result.status,'synced');assert.equal(result.remoteId,100);assert.equal(s.sql.prepare('SELECT count(*) n FROM booking_handovers').get().n,0);assert.equal((await s.api.prealertList('alice'))[0].state,'synced');assert.equal(s.sent.filter(r=>r.method==='POST').length,2);assert.ok(s.sent.every(r=>!r.url.includes('seaGood')&&!r.url.includes('Waybill')));});
test('double click is idempotent; repeat sync makes no remote writes',async()=>{const s=setup(),[a,b]=await Promise.all([s.api.createPrealert('alice',s.form()),s.api.createPrealert('alice',s.form())]);assert.equal(a.id,b.id);await s.api.syncPrealert(a.id,'alice');await s.api.syncPrealert(b.id,'alice');assert.deepEqual(s.counts(),{uploadCount:1,linkCount:1});assert.equal(s.objects.size,1);});
test('owner isolation covers list, local PDF and write access',async()=>{const s=setup(),a=await s.api.createPrealert('alice',s.form());assert.equal((await s.api.prealertList('bob')).length,0);await assert.rejects(s.api.prealertFile(a.id,'bob'));await assert.rejects(s.api.syncPrealert(a.id,'bob'));assert.equal(s.sent.length,0);});
test('locked positions, missing PRA definition and invalid PDF prevent archive creation',async()=>{for(const mode of ['locked','type','pdf']){const s=setup(),f=s.form();if(mode==='locked')s.state.locked=true;if(mode==='type')s.state.types=[];if(mode==='pdf')f.set('file',new File(['not pdf'],'prealert.pdf'));await assert.rejects(s.api.createPrealert('alice',f));assert.equal(s.objects.size,0);assert.equal(s.sent.length,0);}});
test('unknown upload or link response never resends; original PDF remains downloadable',async()=>{for(const mode of ['failUpload','failLink']){const s=setup(),a=await s.api.createPrealert('alice',s.form());s.state[mode]=true;assert.equal((await s.api.syncPrealert(a.id,'alice')).status,'pending');const before=s.counts();s.state[mode]=false;assert.equal((await s.api.syncPrealert(a.id,'alice')).status,'pending');assert.deepEqual(s.counts(),before);assert.equal((await s.api.prealertFile(a.id,'alice')).filename,'prealert.pdf');}});
test('mismatched remote PDF never reports success; later verification reuses completed steps',async()=>{const s=setup(),a=await s.api.createPrealert('alice',s.form());s.state.wrongFile=true;assert.equal((await s.api.syncPrealert(a.id,'alice')).status,'pending');s.state.wrongFile=false;assert.equal((await s.api.syncPrealert(a.id,'alice')).status,'synced');assert.deepEqual(s.counts(),{uploadCount:1,linkCount:1});});

test('existing position PRA with identical bytes is linked without any remote writes, including repeat',async()=>{const s=setup(),a=await s.api.createPrealert('alice',s.form());s.state.existing=[{id:77,entityId:12,size:[...s.objects.values()][0].byteLength,type:'PRA - Pre Alert',filename:'different-name.pdf'}];const r=await s.api.syncPrealert(a.id,'alice');assert.equal(r.matchedExisting,true);assert.equal(r.remoteId,77);assert.deepEqual(s.counts(),{uploadCount:0,linkCount:0});assert.equal((await s.api.prealertList('alice'))[0].remote_id,77);assert.equal((await s.api.syncPrealert(a.id,'alice')).matchedExisting,true);});
test('same name/size with different contents cannot falsely match',async()=>{const s=setup(),a=await s.api.createPrealert('alice',s.form());s.state.existing=[{id:77,entityId:12,size:[...s.objects.values()][0].byteLength,type:'PRA - Pre Alert',filename:'prealert.pdf'}];s.state.wrongFile=true;const r=await s.api.syncPrealert(a.id,'alice');assert.notEqual(r.matchedExisting,true);assert.equal(r.status,'pending');});
test('load-level or different type documents never become position PRA matches',async()=>{const s=setup(),a=await s.api.createPrealert('alice',s.form());s.state.existing=[{id:77,entityId:13,size:[...s.objects.values()][0].byteLength,type:'PRA - Pre Alert'},{id:78,entityId:12,size:[...s.objects.values()][0].byteLength,type:'DOM - Draft'}];assert.equal((await s.api.syncPrealert(a.id,'alice')).remoteId,100);assert.deepEqual(s.counts(),{uploadCount:1,linkCount:1});});

test('unreadable existing candidate stops upload rather than risking a duplicate',async()=>{const s=setup(),a=await s.api.createPrealert('alice',s.form());s.state.existing=[{id:77,entityId:12,size:[...s.objects.values()][0].byteLength,type:'PRA - Pre Alert'}];s.state.failExisting=true;assert.equal((await s.api.syncPrealert(a.id,'alice')).status,'pending');assert.deepEqual(s.counts(),{uploadCount:0,linkCount:0});});

test('archive outage is understandable without exposing internal server details',async()=>{const s=setup(),a=await s.api.createPrealert('alice',s.form());s.state.archiveDown=true;const r=await s.api.syncPrealert(a.id,'alice');assert.equal(r.status,'pending');assert.match(r.message,/arşiv servisine erişilemiyor/);assert.doesNotMatch(r.message,/Mongo|27017|127\.0/);assert.equal(s.counts().linkCount,0);});
test('legacy pending message is clarified without changing stored history',async()=>{const s=setup(),a=await s.api.createPrealert('alice',s.form());const old='T-MAXX aktarımı doğrulanamadı. PDF korundu.';s.sql.prepare("UPDATE prealert_uploads SET state='pending',message=? WHERE id=?").run(old,a.id);assert.match((await s.api.prealertList('alice'))[0].message,/yeniden yüklemeyin/);assert.equal(s.sql.prepare('SELECT message FROM prealert_uploads WHERE id=?').get(a.id).message,old);});
test('unknown upload can reconcile a later visible matching archive without resending',async()=>{const s=setup(),a=await s.api.createPrealert('alice',s.form());s.state.failUpload=true;assert.equal((await s.api.syncPrealert(a.id,'alice')).status,'pending');s.state.failUpload=false;s.state.existing=[{id:77,entityId:12,size:[...s.objects.values()][0].byteLength,type:'PRA - Pre Alert'}];assert.equal((await s.api.syncPrealert(a.id,'alice')).remoteId,77);assert.deepEqual(s.counts(),{uploadCount:1,linkCount:0});});

test('native upload works without depending on the legacy archive list service',async()=>{const s=setup(),a=await s.api.createPrealert('alice',s.form());assert.equal((await s.api.syncPrealert(a.id,'alice')).status,'synced');assert.deepEqual(s.counts(),{uploadCount:1,linkCount:1});assert.equal((await s.api.prealertFile(a.id,'alice')).filename,'prealert.pdf');});

test('archive failures retain safe diagnostics without allowing an uncertain request to resend',async()=>{const s=setup(),a=await s.api.createPrealert('alice',s.form());s.state.archiveDown=true;await s.api.syncPrealert(a.id,'alice');const row=s.sql.prepare("SELECT status,result FROM prealert_upload_steps WHERE document_id=? AND step='upload'").get(a.id);assert.equal(row.status,'unknown');assert.deepEqual(JSON.parse(row.result).failure,{status:400,kind:'archive-unavailable'});assert.doesNotMatch(row.result,/Mongo|127\.0|27017|fixture|PDF/);s.state.archiveDown=false;assert.equal((await s.api.syncPrealert(a.id,'alice')).status,'pending');assert.deepEqual(s.counts(),{uploadCount:1,linkCount:0});});


test('native uploader metadata includes the same firm/version relations and exact original bytes',async()=>{
 const s=setup(),a=await s.api.createPrealert('alice',s.form());assert.equal((await s.api.syncPrealert(a.id,'alice')).status,'synced');
 const encoded=new Request('http://localhost',{method:'POST',headers:s.state.uploadRequest.headers,body:s.state.uploadRequest.body}),form=await encoded.formData(),entity=JSON.parse(form.get('entity'));
 assert.deepEqual([...form.keys()],['file','entity']);assert.deepEqual(Buffer.from(await form.get('file').arrayBuffer()),Buffer.from([...s.objects.values()][0]));
 assert.deepEqual(entity.user,{id:1,version:3,firm:entity.firm});assert.deepEqual(entity.page,{id:50,version:2,firm:entity.firm,name:'Deniz Pozisyon'});assert.deepEqual(entity.type,{id:8,version:4,firm:entity.firm,name:'PRA - Pre Alert '});assert.equal(entity.sourceType,'SeaPosition');assert.equal(entity.entityid,12);
});
test('explicit connection refusal can recover through the existing record without losing attempt history',async()=>{
 const s=setup(),a=await s.api.createPrealert('alice',s.form());s.state.refused=true;await s.api.syncPrealert(a.id,'alice');
 assert.equal((await s.api.prealertList('alice'))[0].state,'retryable');const original=s.sql.prepare("SELECT result FROM prealert_upload_steps WHERE document_id=? AND step='upload'").get(a.id).result;
 s.state.refused=false;assert.equal((await s.api.syncPrealert(a.id,'alice')).status,'synced');assert.deepEqual(s.counts(),{uploadCount:2,linkCount:1});
 const history=s.sql.prepare("SELECT result FROM prealert_upload_steps WHERE document_id=? AND step LIKE 'upload:rejected:%'").all(a.id);assert.equal(history.length,1);assert.equal(history[0].result,original);assert.equal(s.objects.size,1);
});
test('concurrent retry clicks claim one upload and one link',async()=>{
 const s=setup(),a=await s.api.createPrealert('alice',s.form());s.state.refused=true;await s.api.syncPrealert(a.id,'alice');s.state.refused=false;
 await Promise.all([s.api.syncPrealert(a.id,'alice'),s.api.syncPrealert(a.id,'alice')]);assert.deepEqual(s.counts(),{uploadCount:2,linkCount:1});assert.equal((await s.api.prealertList('alice'))[0].state,'synced');
});
test('retry first matches a later native upload by content instead of sending again',async()=>{
 const s=setup(),a=await s.api.createPrealert('alice',s.form());s.state.refused=true;await s.api.syncPrealert(a.id,'alice');s.state.refused=false;s.state.existing=[{id:77,entityId:12,size:[...s.objects.values()][0].byteLength,type:'PRA - Pre Alert'}];
 assert.equal((await s.api.syncPrealert(a.id,'alice')).matchedExisting,true);assert.deepEqual(s.counts(),{uploadCount:1,linkCount:0});
});
test('old unknown diagnostics are never reclassified as safe to retry',async()=>{
 const s=setup(),a=await s.api.createPrealert('alice',s.form());s.sql.prepare("INSERT INTO prealert_upload_steps(document_id,step,status,result) VALUES(?,'upload','unknown',?)").run(a.id,JSON.stringify({failure:{status:400,kind:'archive-unavailable'}}));
 assert.equal((await s.api.syncPrealert(a.id,'alice')).status,'pending');assert.deepEqual(s.counts(),{uploadCount:0,linkCount:0});
});

test('a failed PDF write retains the exact transport stage and never resends an ambiguous upload',async()=>{
 const s=setup(),a=await s.api.createPrealert('alice',s.form());s.state.transportFailure={stage:'write-request',bodyBytes:2271000,requestBytes:2271250,writtenBytes:65536,responseBytes:0,elapsedMs:140};
 await s.api.syncPrealert(a.id,'alice');const row=s.sql.prepare("SELECT status,result FROM prealert_upload_steps WHERE document_id=? AND step='upload'").get(a.id),detail=JSON.parse(row.result);
 assert.equal(row.status,'unknown');assert.equal(detail.progress.stage,'send-file');assert.equal(detail.progress.transport.stage,'write-request');assert.equal(detail.progress.transport.writtenBytes,65536);assert.equal(s.counts().linkCount,0);assert.doesNotMatch(row.result,/Bearer|fixture|%PDF/);
 s.state.transportFailure=null;await s.api.syncPrealert(a.id,'alice');assert.deepEqual(s.counts(),{uploadCount:1,linkCount:0});
});
test('HTTP rejection, JSON decoding and receipt validation are recorded as distinct failed stages',async()=>{
 for(const [response,stage,kind] of [[new Response('Too large',{status:413}),'read-result','http-rejected'],[new Response('private response body'),'parse-result','invalid-json'],[Response.json({res:{}}),'validate-result','response-schema']]){
  const s=setup(),a=await s.api.createPrealert('alice',s.form());s.state.uploadResponse=response;await s.api.syncPrealert(a.id,'alice');const row=s.sql.prepare("SELECT status,result FROM prealert_upload_steps WHERE document_id=? AND step='upload'").get(a.id),detail=JSON.parse(row.result);
  assert.equal(row.status,'unknown');assert.equal(detail.progress.stage,stage);assert.equal(detail.progress.httpStatus,response.status);assert.equal(detail.failure.kind,kind);assert.doesNotMatch(row.result,/private response body|Too large/);assert.equal(s.counts().linkCount,0);
 }
});
test('receipt persistence failure retains the received UID and never uploads or links a second time',async()=>{
 const s=setup(),a=await s.api.createPrealert('alice',s.form());s.state.failReceipt=true;await s.api.syncPrealert(a.id,'alice');const row=s.sql.prepare("SELECT status,result FROM prealert_upload_steps WHERE document_id=? AND step='upload'").get(a.id),detail=JSON.parse(row.result);
 assert.equal(row.status,'unknown');assert.equal(detail.progress.stage,'persist-result');assert.deepEqual(detail.receipt,{uid:'upload-1'});await s.api.syncPrealert(a.id,'alice');assert.deepEqual(s.counts(),{uploadCount:1,linkCount:0});
});
