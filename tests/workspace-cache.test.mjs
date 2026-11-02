import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function fixture(storage={}) {
 const sessionStorage={getItem:k=>storage[k]??null,setItem:(k,v)=>{storage[k]=v;},removeItem:k=>{delete storage[k];}};
 const proxy=new Proxy(sessionStorage,{ownKeys:()=>Object.keys(storage),getOwnPropertyDescriptor:()=>({enumerable:true,configurable:true})});
 const code=ts.transpile(fs.readFileSync('lib/workspace-cache.ts','utf8').replaceAll('export ',''),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None});
 return new Function('window','sessionStorage',code+';return {readDisplayCache,writeDisplayCache,clearDisplayCache,refreshDisplayCache};')({},proxy);
}
test('snapshots survive page reload, isolate owners and filter keys',()=>{
 const storage={},a=fixture(storage);a.writeDisplayCache('alice','list:false',[1]);const b=fixture(storage);
 assert.deepEqual(b.readDisplayCache('alice','list:false').value,[1]);assert.equal(b.readDisplayCache('bob','list:false'),null);assert.equal(b.readDisplayCache('alice','list:true'),null);
 b.clearDisplayCache();assert.equal(fixture(storage).readDisplayCache('alice','list:false'),null);
});
test('concurrent readers share one job; failed refresh retains last success',async()=>{
 const c=fixture();let calls=0,resolve;const loader=()=>{calls++;return new Promise(r=>resolve=r);};
 const a=c.refreshDisplayCache('a','x',loader),b=c.refreshDisplayCache('a','x',loader);await Promise.resolve();assert.equal(calls,1);resolve([3]);assert.deepEqual(await a,await b);
 await assert.rejects(c.refreshDisplayCache('a','x',async()=>{throw Error('offline');}));assert.deepEqual(c.readDisplayCache('a','x').value,[3]);
});
test('logout aborts work and late responses cannot restore cleared data',async()=>{
 const c=fixture();let resolve,signal;const job=c.refreshDisplayCache('a','x',s=>{signal=s;return new Promise(r=>resolve=r);});await Promise.resolve();c.clearDisplayCache();assert.equal(signal.aborted,true);resolve('private');await assert.rejects(job,/Oturum/);assert.equal(c.readDisplayCache('a','x'),null);
});
test('storage exceptions degrade to memory',()=>{const c=fixture(new Proxy({},{set(){throw Error('quota');}}));c.writeDisplayCache('a','x',[4]);assert.deepEqual(c.readDisplayCache('a','x').value,[4]);});
test('equal payload retains object identity while changed data replaces it',()=>{const c=fixture();c.writeDisplayCache('a','x',{rows:[1]});const first=c.readDisplayCache('a','x').value;c.writeDisplayCache('a','x',{rows:[1]});assert.equal(c.readDisplayCache('a','x').value,first);c.writeDisplayCache('a','x',{rows:[2]});assert.notEqual(c.readDisplayCache('a','x').value,first);});
