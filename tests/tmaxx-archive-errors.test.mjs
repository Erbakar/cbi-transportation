import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
class AppError extends Error{constructor(message,status){super(message);this.status=status;}}
function client(status,body,contentType='application/json'){let source=fs.readFileSync('lib/server/platforms.ts','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'').replace("(await import('./tmaxx-transport')).tmaxxRequest",'transport').replace("await import('../tmaxx-values')",'({tmaxxBusinessError:()=>undefined})');source=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;return new Function('AppError','transport','runtime',source+';return fetchJson;')(AppError,async()=>new Response(body,{status,headers:contentType?{'Content-Type':contentType}:{}}),()=>({}));}
test('archive connection failure is a safe service-unavailable error rather than a generic 500',async()=>{const fetchJson=client(400,'Timed out after 30000 ms MongoSocketOpenException 127.0.0.1:27017 Connection refused');await assert.rejects(fetchJson('http://95.216.243.19:8090/api/uploader/getByID/file',{method:'GET'}),e=>e.status===503&&/arşiv servisine/.test(e.message)&&!/127\.0|27017|Mongo/.test(e.message));});
test('ordinary API failures are not misclassified as archive failures',async()=>{const fetchJson=client(400,'Mongo connection refused');await assert.rejects(fetchJson('http://95.216.243.19:8090/api//sea/seaPosition/1',{method:'GET'}),e=>e.status===502&&/HTTP 400/.test(e.message));});
test('successful archive JSON is returned unchanged',async()=>{const data={obj:{_id:'file',fileSize:5,file:{data:'JVBERi0='}}};const fetchJson=client(200,JSON.stringify(data));assert.deepEqual((await fetchJson('http://95.216.243.19:8090/api/uploader/getByID/file',{method:'GET'})).data,data);});

test('ERP 401 carries a refresh signal while preserving the application session',async()=>{const fetchJson=client(401,'Unauthorized');await assert.rejects(fetchJson('http://95.216.243.19:8090/api//sea/seaPosition/1',{method:'GET'}),e=>e.platformStatus===401&&e.status===502);});

test('an empty successful HBL lookup means no waybill even without a content type',async()=>{
 const endpoint='http://95.216.243.19:8090/api//sea/def/seaGoodWaybill/getBySeaGoodId?goodId=123';
 const fetchJson=client(200,null,null);
 assert.equal((await fetchJson(endpoint,{method:'GET'})).data,null);
 await assert.rejects(fetchJson(endpoint,{method:'POST'}),/JSON/);
 await assert.rejects(fetchJson('http://95.216.243.19:8090/api//sea/seaGood/123',{method:'GET'}),/JSON/);
 await assert.rejects(client(200,'<html>Login</html>','text/html')(endpoint,{method:'GET'}),/JSON/);
 await assert.rejects(client(401,null,null)(endpoint,{method:'GET'}),e=>e.platformStatus===401);
});
