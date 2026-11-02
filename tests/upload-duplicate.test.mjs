import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {normalizeTmaxxReference} from '../lib/tmaxx-reference.ts';

const digest=async value=>createHash('sha256').update(typeof value==='string'?value:Buffer.from(value)).digest('hex');
function moduleAt(path,deps,names){
  const source=fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
  return new Function(...Object.keys(deps),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText+';return {'+names+'}')(...Object.values(deps));
}
function setup(t){
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  for(const name of fs.readdirSync('drizzle').filter(n=>/^000[0-4]_.*\.sql$/.test(n)).sort())sql.exec(fs.readFileSync('drizzle/'+name,'utf8'));
  sql.exec('CREATE TABLE platform_steps(record_id TEXT,step TEXT,status TEXT)');
  const objects=new Map();let writes=0;
  const run=(query,args)=>{writes++;return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}}};
  const db=()=>({
    prepare(query){return {bind(...args){return {query,args,first:async()=>sql.prepare(query).get(...args)||null,all:async()=>({results:sql.prepare(query).all(...args)}),run:async()=>run(query,args)}}}},
    async batch(commands){sql.exec('BEGIN');try{const results=commands.map(c=>run(c.query,c.args));sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}
  });
  class AppError extends Error{constructor(message,status=400){super(message);this.status=status}}
  const owned=async(id,owner)=>{const row=sql.prepare("SELECT * FROM records WHERE id=? AND owner=? AND status<>'deleted'").get(id,owner);if(!row)throw new AppError('Missing record',404);return row};
  const {findSameDocumentSet}=moduleAt('lib/server/record-upload.ts',{db},'findSameDocumentSet');
  const route=moduleAt('app/api/records/route.ts',{
    normalizeTmaxxReference,findSameDocumentSet,emptyManual:{},requireUser:async req=>req.headers.get('x-test-user')||'a',sameOrigin:()=>{},limitedForm:req=>req.formData(),
    AppError,db,digest,errorResponse:e=>Response.json({error:e.message},{status:e.status||500}),json:(data,status=200)=>Response.json(data,{status}),owned,
    view:async row=>({...row,manual:JSON.parse(row.manual||'{}')}),detectFile:()=> 'application/pdf',
    runtime:()=>({BUCKET:{put:async(key,bytes)=>objects.set(key,bytes),delete:async key=>objects.delete(key)}}),
    allTargets:()=>[{id:'tmaxx',kind:'HBL'},{id:'inttra',kind:'MBL'}]
  },'POST');
  const upload=(files=['a','b'],roles=['instruction','instruction'],options={})=>{
    const form=new FormData();files.forEach((content,index)=>form.append('files',new File(['%PDF-1.7\n'+content],options.names?.[index]||content+'.pdf',{type:'application/pdf'})));
    form.set('roles',JSON.stringify(roles));form.set('tmaxxReference',options.reference||'S.E.26.10.00754');if(options.recordId)form.set('recordId',options.recordId);
    return route.POST(new Request('https://test/api/records',{method:'POST',headers:{'x-test-user':options.owner||'a'},body:form}));
  };
  const snapshot=()=>JSON.stringify(['records','record_documents','revisions','deliveries'].map(table=>sql.prepare('SELECT * FROM '+table+' ORDER BY id').all()));
  return {sql,upload,objects,snapshot,writes:()=>writes};
}

test('role, filename and order changes reopen the saved draft without modifying entered information',async t=>{
  const f=setup(t);const first=await f.upload();assert.equal(first.status,201);const {record}=await first.json();
  const manual={...record.manual,bookingNumber:'EBKG19125349',blReference:'MEDUJX351995',houseBills:[{number:'1046445',postcode:'34537'},{number:'1046446',postcode:'34537'}]};
  f.sql.prepare("UPDATE records SET status='ready',manual=?,extraction=?,issues='[]' WHERE id=?").run(JSON.stringify(manual),'{"source":"preserved"}',record.id);
  const before=f.snapshot(),writes=f.writes(),objects=f.objects.size;
  for(const [files,roles] of [[['a','b'],['instruction','mbl-parties']],[['b','a'],['mbl-parties','instruction']],[['a','b'],['instruction','instruction']]]){
    const response=await f.upload(files,roles,{names:['renamed-first.pdf','renamed-second.pdf'],reference:'se261000754'});assert.equal(response.status,200);
    const result=await response.json();assert.equal(result.duplicate,true);assert.equal(result.record.id,record.id);assert.equal(result.record.status,'ready');assert.deepEqual(result.record.manual,manual);
  }
  assert.equal(f.snapshot(),before);assert.equal(f.writes(),writes);assert.equal(f.objects.size,objects);
});

test('legacy mixed-role fingerprint still matches after source roles were corrected in place',async t=>{
  const f=setup(t);const {record}=await (await f.upload(['a','b'],['instruction','mbl-parties'])).json();
  f.sql.prepare("UPDATE record_documents SET role='instruction' WHERE record_id=?").run(record.id);
  const before=f.snapshot();const result=await (await f.upload()).json();assert.equal(result.duplicate,true);assert.equal(result.record.id,record.id);assert.equal(f.snapshot(),before);
});

test('same content under another reference is rejected even when document roles differ',async t=>{
  const f=setup(t);await f.upload();const before=f.snapshot();
  const response=await f.upload(['a','b'],['instruction','mbl-parties'],{reference:'se261009999'});
  assert.equal(response.status,409);assert.match((await response.json()).error,/başka bir referans/);assert.equal(f.snapshot(),before);
});

test('different document sets sharing a reference are not silently merged',async t=>{
  const f=setup(t);await f.upload();
  for(const files of [['a'],['a','c'],['a','b','c']]){
    const response=await f.upload(files,files.map(()=> 'instruction'));assert.equal(response.status,201);assert.equal((await response.json()).duplicate,false);
  }
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM records').get().n,4);
});

test('duplicate lookup respects ownership and ignores logically deleted records',async t=>{
  const f=setup(t);const {record}=await (await f.upload(['a','b'],['instruction','mbl-parties'])).json();
  assert.equal((await f.upload(undefined,undefined,{owner:'b'})).status,201);
  f.sql.prepare("UPDATE records SET status='deleted',hash=? WHERE id=?").run('deleted:'+record.id,record.id);
  const response=await f.upload();assert.equal(response.status,201);assert.notEqual((await response.json()).record.id,record.id);
});

test('only the current document revision participates in duplicate detection',async t=>{
  const f=setup(t);const {record}=await (await f.upload(['a','b'],['instruction','mbl-parties'])).json();
  assert.equal((await f.upload(['c','d'],['instruction','instruction'],{recordId:record.id})).status,201);
  const response=await f.upload();assert.equal(response.status,201);assert.notEqual((await response.json()).record.id,record.id);
});

test('explicit document replacement can still revise source roles on the same record',async t=>{
  const f=setup(t);const {record}=await (await f.upload()).json();
  const response=await f.upload(['a','b'],['instruction','mbl-parties'],{recordId:record.id});assert.equal(response.status,201);
  const result=await response.json();assert.equal(result.duplicate,false);assert.equal(result.record.id,record.id);assert.equal(result.record.revision,2);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM records').get().n,1);assert.equal(f.sql.prepare('SELECT role FROM record_documents WHERE record_id=? AND revision=2 ORDER BY filename DESC').get(record.id).role,'mbl-parties');
});
