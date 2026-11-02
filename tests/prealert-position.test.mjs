import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {PDFDocument} from 'pdf-lib';
import {moduleAt,AppError} from './helpers/prealert-upload-fixture.mjs';
import {documentMime,MAX_DOCUMENT_BYTES,safeFilename} from '../lib/operations/documents.ts';

const ref='S.E.26.08.00568';
const evidence=(kind,value,page=1)=>({kind,value,proof:value,page,confidence:.99});
const ids=[evidence('hbl','1046266'),evidence('mbl','MEDUJE662971',2)];
async function fixture(){
 const pdf=await PDFDocument.create();pdf.addPage();pdf.addPage();const bytes=await pdf.save();
 const state={identifiers:ids,finishReason:'STOP',modelStatus:200,modelCalls:0,searches:[],lookups:[],cached:false,locked:false,wrongFinalMbl:false,wide:false,ignoreFilter:false};
 const positions=[{id:10,referenceNo:ref,masterBlNo:'MEDUJE662971'},{id:11,referenceNo:'S.E.26.08.00569',masterBlNo:'OTHER123'}];
 const goods=[{id:20,hblNo:'1046266',seaPosition:{id:10}},{id:21,hblNo:'1046267',seaPosition:{id:11}}];
 const get=async path=>{
  state.searches.push(path);const url=new URL(path,'https://fixture.test');
  if(url.pathname.endsWith('/searchTreeNode')){
   if(state.wide)return Array.from({length:21},(_,i)=>({id:i+1,context:'seaPosition'}));
   const query=JSON.parse(url.searchParams.get('query'));let rows,context;
   if(url.pathname.includes('/seaGood/')){rows=goods.filter(g=>state.ignoreFilter||g.hblNo===query.hblNo);context='seaGood';}
   else{rows=positions.filter(p=>state.ignoreFilter||p.masterBlNo===query.masterBlNo||p.referenceNo===query['referenceNo/LIKE']);context='seaPosition';}
   return rows.map(({id})=>({id,context}));
  }
  const id=Number(url.pathname.split('/').at(-1));return url.pathname.includes('/seaGood/')?goods.find(g=>g.id===id):positions.find(p=>p.id===id);
 };
 const api=moduleAt('lib/server/prealert-position.ts',{
  z,PDFDocument,AppError,documentMime,MAX_DOCUMENT_BYTES,safeFilename,
  runtime:()=>({GEMINI_API_KEY:'fixture',GEMINI_MODEL:'existing-project-model',BUCKET:{put:()=>assert.fail('Detection must not save/archive a document')}}),
  tmaxxWorkspaceClient:async owner=>{assert.equal(owner,'alice');return get;},
  lookupPrealertPosition:async(owner,reference)=>{assert.equal(owner,'alice');state.lookups.push(reference);const p=positions.find(p=>p.referenceNo===reference);return {cached:state.cached,position:{id:p.id,reference:p.referenceNo,mbl:state.wrongFinalMbl?'CHANGED':p.masterBlNo,locked:state.locked},loads:goods.filter(g=>g.seaPosition.id===p.id).map(g=>({hbl:g.hblNo}))};},
  fetch:async(url,options)=>{state.modelCalls++;state.modelRequest=JSON.parse(options.body);assert.ok(url.endsWith('/existing-project-model:generateContent'));return Response.json({candidates:[{finishReason:state.finishReason,content:{parts:[{text:JSON.stringify({identifiers:state.identifiers})}]}}]},{status:state.modelStatus});}
 },'prealertIdentifiers,matchPrealertPosition,detectPrealertPosition');
 const form=(filename='customer.pdf',data=bytes)=>{const f=new FormData();f.set('file',new File([data],filename,{type:'application/pdf'}));return f;};
 return {api,state,positions,goods,bytes,form};
}

test('PDF-only input reads evidence and finds one position, without any archive upload',async()=>{
 const s=await fixture(),result=await s.api.detectPrealertPosition('alice',s.form());
 assert.equal(result.status,'matched');assert.equal(result.snapshot.position.reference,ref);assert.deepEqual(result.evidence,[{kind:'hbl',value:'1046266',page:1},{kind:'mbl',value:'MEDUJE662971',page:2}]);
 assert.deepEqual(s.state.lookups,[ref]);assert.equal(s.state.modelCalls,1);
 assert.deepEqual(Buffer.from(s.state.modelRequest.contents[0].parts[0].inlineData.data,'base64'),Buffer.from(s.bytes));
 assert.ok(s.state.searches.every(path=>!path.includes('uploader')&&!path.includes('/document/')));
});
test('filename cannot select a position when the PDF has no usable identifiers',async()=>{
 const s=await fixture();s.state.identifiers=[];assert.equal((await s.api.detectPrealertPosition('alice',s.form('S.E.26.08.00568.pdf'))).status,'manual');assert.equal(s.state.searches.length,0);assert.doesNotMatch(JSON.stringify(s.state.modelRequest),/00568/);
});
test('all HBL/MBL evidence must agree, including multi-shipment PDFs',async()=>{
 const s=await fixture();assert.equal((await s.api.matchPrealertPosition('alice',[...ids,evidence('hbl','1046267')])).status,'manual');assert.equal(s.state.lookups.length,0);
});
test('a duplicate MBL across positions needs another agreeing identifier',async()=>{
 const s=await fixture();s.positions[1].masterBlNo='MEDUJE662971';
 assert.equal((await s.api.matchPrealertPosition('alice',[ids[1]])).status,'manual');
 assert.equal((await s.api.matchPrealertPosition('alice',ids)).snapshot.position.reference,ref);
});
test('search filters are never trusted without checking actual returned field values',async()=>{
 const s=await fixture();s.state.ignoreFilter=true;
 assert.equal((await s.api.matchPrealertPosition('alice',[evidence('mbl','DOESNOTEXIST')])).status,'manual');
 assert.equal((await s.api.matchPrealertPosition('alice',ids)).status,'matched');
});
test('low confidence, wrong page, missing proof or truncated position prevents auto-selection',async()=>{
 const s=await fixture();for(const bad of [{...ids[0],confidence:.8},{...ids[0],page:3},{...ids[0],proof:'different evidence'},evidence('position','00568')])assert.deepEqual(s.api.prealertIdentifiers({identifiers:[ids[1],bad]},2),[]);
 assert.throws(()=>s.api.prealertIdentifiers({identifiers:[{...ids[0],extra:'ignore safeguards'}]},2),e=>e.status===422);
});
test('repeated printed identifiers collapse, while explicit full position references are checked',async()=>{
 const s=await fixture();assert.equal(s.api.prealertIdentifiers({identifiers:[...ids,...ids]},2).length,2);
 const result=await s.api.matchPrealertPosition('alice',[evidence('position',ref),...ids]);assert.equal(result.status,'matched');
});
test('a fresh snapshot is required and locked, changed or overly broad matches stay manual',async()=>{
 for(const flag of ['cached','locked','wrongFinalMbl','wide']){const s=await fixture();s.state[flag]=true;assert.equal((await s.api.matchPrealertPosition('alice',ids)).status,'manual',flag);}
});
test('invalid and multiple PDFs fail before any model or ERP request',async()=>{
 const s=await fixture();const empty=new FormData(),multiple=s.form();multiple.append('file',multiple.get('file'));
 for(const form of [empty,multiple,s.form('fake.pdf','not a pdf'),s.form('broken.pdf','%PDF-1.7\nbroken')])await assert.rejects(s.api.detectPrealertPosition('alice',form),e=>e.status===422);
 assert.equal(s.state.modelCalls,0);assert.equal(s.state.searches.length,0);
});
test('model failures and incomplete results never query or update T-MAXX',async()=>{
 for(const [field,value] of [['finishReason','MAX_TOKENS'],['modelStatus',429]]){const s=await fixture();s.state[field]=value;await assert.rejects(s.api.detectPrealertPosition('alice',s.form()),e=>e.status===502);assert.equal(s.state.searches.length,0);}
});
test('position route preserves manual GET and protects PDF detection with auth and same-origin',async()=>{
 let authorized=true,validOrigin=true,forms=0,detected=0;
 const route=moduleAt('app/api/prealert/position/route.ts',{AppError,json:Response.json,errorResponse:e=>Response.json({error:e.message},{status:e.status||500}),sameOrigin:()=>{if(!validOrigin)throw new AppError('origin',403);},requireUser:async()=>{if(!authorized)throw new AppError('auth',401);return 'alice';},positionReference:z.string().regex(/^S\.E\./),lookupPrealertPosition:async(owner,reference)=>({owner,reference}),documentForm:async()=>{forms++;return new FormData();},detectPrealertPosition:async owner=>{detected++;return {owner,status:'manual'};}},'GET,POST');
 assert.deepEqual(await (await route.GET(new Request('https://app.test/api/prealert/position?reference='+ref))).json(),{owner:'alice',reference:ref});
 const request=()=>new Request('https://app.test/api/prealert/position',{method:'POST'});
 authorized=false;assert.equal((await route.POST(request())).status,401);authorized=true;validOrigin=false;assert.equal((await route.POST(request())).status,403);assert.equal(forms,0);assert.equal(detected,0);
 validOrigin=true;assert.equal((await route.POST(request())).status,200);assert.equal(detected,1);
});
