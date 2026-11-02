import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,moduleAt,AppError} from './helpers/prealert-upload-fixture.mjs';

function fixture(){
 const s=setup(),clock={value:1_000_000},probe={down:false,count:0,hook:null};
 class Clock extends Date{constructor(...args){super(...(args.length?args:[clock.value]));}static now(){return clock.value;}}
 const env={PREALERT_QUEUE_ENABLED:'true',PREALERT_QUEUE_KEY:'a'.repeat(64)};
 const queue=moduleAt('lib/server/prealert-queue.ts',{AppError,db:s.db,runtime:()=>env,Date:Clock,syncPrealert:s.api.syncPrealert,readTmaxxArchiveFile:async()=>{probe.count++;if(probe.hook)await probe.hook();if(probe.down)throw new AppError('Archive unavailable',503);}},'enqueuePrealert,runPrealertQueue,requirePrealertQueueKey,queueDelay');
 function canary(){s.sql.prepare("INSERT INTO prealert_uploads(id,owner,position_id,position_reference,filename,size,hash,object_key,type_id,state,remote_id,created_at,updated_at) VALUES('canary','alice',99,'S.E.OLD','old.pdf',10,'old','old',8,'synced',99,'old','old')").run();}
 const row=id=>s.sql.prepare('SELECT * FROM prealert_queue WHERE document_id=?').get(id);
 const advance=()=>{clock.value=Math.max(clock.value+1,...s.sql.prepare('SELECT next_at FROM prealert_queue').all().map(r=>r.next_at),s.sql.prepare('SELECT next_at FROM prealert_queue_control').get().next_at);};
 return {...s,...queue,clock,probe,env,canary,row,advance};
}
test('enqueue is durable and immediate, without any remote PDF write; unauthorized owner rejected',async()=>{
 const s=fixture(),a=await s.api.createPrealert('alice',s.form());await s.enqueuePrealert(a.id,'alice');
 assert.equal(s.row(a.id).state,'queued');assert.deepEqual(s.counts(),{uploadCount:0,linkCount:0});
 await assert.rejects(s.enqueuePrealert(a.id,'bob'));assert.equal(s.objects.size,1);
});
test('archive outage probes only, preserves PDF, and applies a shared bounded backoff',async()=>{
 const s=fixture(),a=await s.api.createPrealert('alice',s.form());s.canary();s.probe.down=true;
 assert.equal((await s.runPrealertQueue()).status,'waiting');assert.equal(s.probe.count,1);
 assert.deepEqual(s.counts(),{uploadCount:0,linkCount:0});assert.equal(s.row(a.id).next_at,s.clock.value+300000);
 await s.enqueuePrealert(a.id,'alice');await s.runPrealertQueue();assert.equal(s.probe.count,1);
 s.advance();await s.runPrealertQueue();assert.equal(s.row(a.id).next_at,s.clock.value+600000);
 assert.equal(s.queueDelay(1000),1800000);assert.equal((await s.api.prealertFile(a.id,'alice')).filename,'prealert.pdf');
});
test('archive recovery automatically transfers once and verifies bytes without another user action',async()=>{
 const s=fixture(),a=await s.api.createPrealert('alice',s.form());s.canary();s.probe.down=true;await s.runPrealertQueue();
 s.probe.down=false;s.advance();assert.equal((await s.runPrealertQueue()).status,'complete');
 assert.equal(s.row(a.id).state,'complete');assert.deepEqual(s.counts(),{uploadCount:1,linkCount:1});
 assert.equal((await s.runPrealertQueue()).status,'idle');await s.enqueuePrealert(a.id,'alice');await s.runPrealertQueue();
 assert.deepEqual(s.counts(),{uploadCount:1,linkCount:1});
});
test('duplicate uploads, enqueue clicks and overlapping scheduler ticks produce one remote document',async()=>{
 const s=fixture(),[a,b]=await Promise.all([s.api.createPrealert('alice',s.form()),s.api.createPrealert('alice',s.form())]);assert.equal(a.id,b.id);
 await Promise.all([s.enqueuePrealert(a.id,'alice'),s.enqueuePrealert(b.id,'alice')]);
 await Promise.all([s.runPrealertQueue(),s.runPrealertQueue()]);assert.deepEqual(s.counts(),{uploadCount:1,linkCount:1});
 assert.equal(s.sql.prepare('SELECT count(*) n FROM prealert_queue').get().n,1);
});
test('known rejected 560-style attempt resumes while preserving earlier diagnostics and original file',async()=>{
 const s=fixture(),a=await s.api.createPrealert('alice',s.form());s.state.refused=true;await s.api.syncPrealert(a.id,'alice');
 s.sql.prepare("INSERT INTO prealert_upload_steps VALUES(?,'upload:original-unknown','unknown',NULL)").run(a.id);
 const rejected=s.sql.prepare("SELECT result FROM prealert_upload_steps WHERE document_id=? AND step='upload'").get(a.id).result;
 s.state.refused=false;assert.equal((await s.runPrealertQueue()).status,'complete');assert.deepEqual(s.counts(),{uploadCount:2,linkCount:1});
 assert.equal(s.sql.prepare("SELECT result FROM prealert_upload_steps WHERE step LIKE 'upload:rejected:%'").get().result,rejected);
 assert.equal(s.sql.prepare("SELECT status FROM prealert_upload_steps WHERE step='upload:original-unknown'").get().status,'unknown');
});
test('lost upload response is never resent; a later native matching file is reconciled automatically',async()=>{
 const s=fixture(),a=await s.api.createPrealert('alice',s.form());s.state.failUpload=true;await s.runPrealertQueue();
 assert.equal(s.row(a.id).state,'review');s.state.failUpload=false;s.advance();await s.runPrealertQueue();
 assert.deepEqual(s.counts(),{uploadCount:1,linkCount:0});
 s.state.existing=[{id:77,entityId:12,size:[...s.objects.values()][0].byteLength,type:'PRA - Pre Alert'}];s.advance();
 assert.equal((await s.runPrealertQueue()).status,'complete');assert.deepEqual(s.counts(),{uploadCount:1,linkCount:0});
});
test('lost link response does not create a second document even after repeated queue execution',async()=>{
 const s=fixture(),a=await s.api.createPrealert('alice',s.form());s.state.failLink=true;await s.runPrealertQueue();
 assert.equal(s.row(a.id).state,'review');s.state.failLink=false;
 for(let i=0;i<3;i++){s.advance();await s.runPrealertQueue();}
 assert.deepEqual(s.counts(),{uploadCount:1,linkCount:1});
});
test('expired worker lease with a sending journal resumes only reconciliation',async()=>{
 const s=fixture(),a=await s.api.createPrealert('alice',s.form());await s.enqueuePrealert(a.id,'alice');
 s.sql.prepare("UPDATE prealert_queue SET state='processing',lease='dead'").run();
 s.sql.prepare("UPDATE prealert_queue_control SET lease='dead',lease_until=?").run(s.clock.value-1);
 s.sql.prepare("INSERT INTO prealert_upload_steps VALUES(?,'upload','sending',NULL)").run(a.id);
 assert.equal((await s.runPrealertQueue()).status,'review');assert.deepEqual(s.counts(),{uploadCount:0,linkCount:0});
});
test('active worker lease and outage cooldown cannot be bypassed by manual enqueue',async()=>{
 const s=fixture(),a=await s.api.createPrealert('alice',s.form());await s.enqueuePrealert(a.id,'alice');
 s.sql.prepare("UPDATE prealert_queue SET state='processing',lease='active'").run();s.sql.prepare("UPDATE prealert_queue_control SET lease='active',lease_until=?").run(s.clock.value+600000);
 await s.enqueuePrealert(a.id,'alice');assert.equal(s.row(a.id).lease,'active');await s.runPrealertQueue();assert.deepEqual(s.counts(),{uploadCount:0,linkCount:0});
});
test('a worker that loses its lease before upload cannot write or clear the new lease',async()=>{
 const s=fixture(),a=await s.api.createPrealert('alice',s.form());s.canary();
 s.probe.hook=()=>s.sql.prepare("UPDATE prealert_queue_control SET lease='replacement',lease_until=?").run(s.clock.value+600000);
 await s.runPrealertQueue();assert.deepEqual(s.counts(),{uploadCount:0,linkCount:0});
 assert.equal(s.sql.prepare('SELECT lease FROM prealert_queue_control').get().lease,'replacement');assert.notEqual(s.row(a.id).state,'complete');
});
test('lease deadline before link leaves upload receipt reusable without another upload',async()=>{
 const s=fixture(),a=await s.api.createPrealert('alice',s.form());let writes=0;
 await s.api.syncPrealert(a.id,'alice',{beforeWrite:async()=>{if(++writes===2)throw new AppError('deadline',503);}});
 assert.deepEqual(s.counts(),{uploadCount:1,linkCount:0});assert.equal((await s.runPrealertQueue()).status,'complete');
 assert.deepEqual(s.counts(),{uploadCount:1,linkCount:1});
});
test('explicit read-only reconciliation also forbids upload when the journal is missing',async()=>{
 const s=fixture(),a=await s.api.createPrealert('alice',s.form());await s.api.syncPrealert(a.id,'alice',{readOnly:true});assert.deepEqual(s.counts(),{uploadCount:0,linkCount:0});
});
test('completed upload/link are only re-read after a verification failure',async()=>{
 const s=fixture(),a=await s.api.createPrealert('alice',s.form());s.state.wrongFile=true;await s.runPrealertQueue();assert.notEqual(s.row(a.id).state,'complete');
 s.state.wrongFile=false;s.advance();assert.equal((await s.runPrealertQueue()).status,'complete');assert.deepEqual(s.counts(),{uploadCount:1,linkCount:1});
});
test('scheduler endpoint requires its own secret; disabled queue does not touch the ERP',async()=>{
 const s=fixture();for(const value of ['',s.env.PREALERT_QUEUE_KEY,'Bearer bad','Bearer '+s.env.PREALERT_QUEUE_KEY+'x'])assert.throws(()=>s.requirePrealertQueueKey(new Request('https://local',{headers:{Authorization:value}})));
 s.requirePrealertQueueKey(new Request('https://local',{headers:{Authorization:'Bearer '+s.env.PREALERT_QUEUE_KEY}}));
 s.env.PREALERT_QUEUE_ENABLED='false';assert.equal((await s.runPrealertQueue()).status,'disabled');assert.deepEqual(s.counts(),{uploadCount:0,linkCount:0});
});
test('a PDF can be saved after target selection even if the entire ERP becomes unavailable',async()=>{
 const s=fixture();await s.api.lookupPrealertPosition('alice','S.E.TEST');s.state.offline=true;
 const snapshot=await s.api.lookupPrealertPosition('alice','S.E.TEST');assert.equal(snapshot.cached,true);
 const a=await s.api.createPrealert('alice',s.form());await s.enqueuePrealert(a.id,'alice');
 assert.equal(s.objects.size,1);assert.equal((await s.api.prealertFile(a.id,'alice')).filename,'prealert.pdf');
 await s.runPrealertQueue();assert.deepEqual(s.counts(),{uploadCount:0,linkCount:0});
 s.state.offline=false;s.advance();assert.equal((await s.runPrealertQueue()).status,'complete');
});
test('cached targets are owner-scoped and a newly locked position cannot be uploaded',async()=>{
 const s=fixture();await s.api.lookupPrealertPosition('alice','S.E.TEST');s.state.offline=true;
 await assert.rejects(s.api.createPrealert('bob',s.form()));
 const a=await s.api.createPrealert('alice',s.form());s.state.offline=false;s.state.locked=true;
 await s.runPrealertQueue();assert.deepEqual(s.counts(),{uploadCount:0,linkCount:0});assert.notEqual(s.row(a.id).state,'complete');
});
test('duplicate upload during a full outage uses the same saved source and queue job',async()=>{
 const s=fixture(),a=await s.api.createPrealert('alice',s.form());await s.enqueuePrealert(a.id,'alice');s.state.offline=true;
 const b=await s.api.createPrealert('alice',s.form());await s.enqueuePrealert(b.id,'alice');assert.equal(b.id,a.id);assert.equal(b.duplicate,true);assert.equal(s.objects.size,1);
});
test('different documents are processed one per tick and cannot race across scheduler invocations',async()=>{
 const s=fixture(),a=await s.api.createPrealert('alice',s.form()),form=s.form();form.set('file',new File(['%PDF-1.7\nsecond'],'second.pdf'));
 const b=await s.api.createPrealert('alice',form);await Promise.all([s.runPrealertQueue(),s.runPrealertQueue()]);assert.equal(s.counts().uploadCount,1);
 assert.equal(s.sql.prepare("SELECT count(*) n FROM prealert_queue WHERE state='complete'").get().n,1);
 assert.notEqual(a.id,b.id);
});
