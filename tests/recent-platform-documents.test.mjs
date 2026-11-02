import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import {z} from 'zod';
const source=fs.readFileSync('lib/server/recent-platform-documents.ts','utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
function fixture(get){const code=ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None});return new Function('z','AppError','tmaxxWorkspaceClient',code+';return {inRecentMonth,recentPlatformDocuments};')(z,Error,async()=>get);}
test('30-day window uses Istanbul for timezone-less timestamps and excludes future/old records',()=>{const {inRecentMonth}=fixture(()=>{});const now=Date.parse('2026-10-15T10:00:00Z');assert.equal(inRecentMonth('2026-09-15T13:00:00',now),true);assert.equal(inRecentMonth('2026-09-15T12:59:59',now),false);assert.equal(inRecentMonth('2026-10-15T13:00:01',now),false);assert.equal(inRecentMonth('bad',now),false);});
test('archive date search includes older positions without a 150-position scan',async()=>{
 const calls=[];const get=async p=>{calls.push(p);if(p.includes('docType/search'))return [];if(p.endsWith('seaPosition/1'))return{id:1,referenceNo:'S.E.26.01.1'};return[{id:3,entityid:1,sourceType:'SeaPosition',createDate:'2026-10-14T15:00:00',fileName:'real.pdf',reference:'abc',type:{code:'PRA',name:'Pre Alert'}}];};
 const r=await fixture(get).recentPlatformDocuments('owner',1,Date.parse('2026-10-15T10:00:00Z'));assert.equal(r.documents.length,1);assert.equal(r.documents[0].kind,'Pre-alert');assert.match(r.documents[0].download,/reference=S.E.26.01.1&id=3/);assert.equal(r.next,2);assert.equal(r.failures.length,0);assert.ok(calls.every(p=>!p.includes('seaPosition/search')&&!p.includes('upload')));
});
test('full source pages are expanded rather than silently truncated',async()=>{
 const calls=[];const docs=Array.from({length:201},(_,i)=>({id:i+1,entityid:1,sourceType:'SeaPosition',createDate:'2026-10-14T15:00:00',fileName:'real.pdf',reference:'abc',type:null}));
 const get=async p=>{if(p.includes('docType'))return [];if(p.endsWith('seaPosition/1'))return{id:1,referenceNo:'S.E.26.01.1'};const limit=Number(new URL('http://test'+p).searchParams.get('limit'));calls.push(limit);return docs.slice(0,limit);};
 const r=await fixture(get).recentPlatformDocuments('owner',1,Date.parse('2026-10-15T10:00:00Z'));assert.equal(r.documents.length,201);assert.equal(r.nextDocumentOffset,null);assert.deepEqual(calls,[200,400]);
});
test('wrong entity is a visible failure and unrelated archive types are excluded',async()=>{
 const get=async p=>p.includes('docType')?[]:p.endsWith('seaPosition/1')?{id:99,referenceNo:'wrong'}:[{id:3,entityid:1,sourceType:'SeaPosition',createDate:'2026-10-14T15:00:00',fileName:'bad.pdf',reference:'abc',type:null}];
 const r=await fixture(get).recentPlatformDocuments('owner',1,Date.parse('2026-10-15T10:00:00Z'));assert.deepEqual(r.failures,[3]);assert.equal(r.documents.length,0);
});

test('entity reads stay bounded and document pages cover the whole day',async()=>{let calls=0;const docs=Array.from({length:45},(_,i)=>({id:i+1,entityid:i+1,sourceType:'SeaPosition',createDate:'2026-10-14T15:00:00',fileName:'real.pdf',reference:'abc',type:null}));const get=async p=>{calls++;if(p.includes('docType'))return [];if(p.includes('searchByOrderAndLimit'))return docs;const id=Number(p.split('/').pop());return{id,referenceNo:'S.E.'+id};};const f=fixture(get);let start=0,ids=[];do{calls=0;const r=await f.recentPlatformDocuments('owner',1,Date.parse('2026-10-15T10:00:00Z'),start);ids.push(...r.documents.map(d=>d.id));assert.ok(calls<=22);start=r.nextDocumentOffset;if(start!==null)assert.equal(r.next,1);else assert.equal(r.next,2);}while(start!==null);assert.equal(new Set(ids).size,45);});
