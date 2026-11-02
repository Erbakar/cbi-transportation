import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const rows=new Map();const sessions=new Map();
const database={prepare(sql){let args;return {bind(...a){args=a;return this},async first(){if(sql.includes('platform_credentials'))return rows.has(args[0])?{encrypted:rows.get(args[0])}:null;return null},async run(){if(sql.startsWith('INSERT INTO platform_credentials'))rows.set(args[0],args[1]);if(sql.startsWith('DELETE FROM platform_sessions'))sessions.delete(args[0]);return {meta:{changes:1}}}}},async batch(statements){return Promise.all(statements.map(s=>s.run()))}};
globalThis.__platformTest={env:{ENCRYPTION_KEY:'ab'.repeat(32),PLATFORM_CONTRACTS:'[]'},database};
let source=fs.readFileSync('lib/server/platforms.ts','utf8').replace("import {assertPlatformEnabled,platformEnabled} from './platform-policy';",'const platformEnabled=id=>!(globalThis.__platformTest.env.PAUSED_PLATFORMS||"").split(",").includes(id);const assertPlatformEnabled=id=>{if(!platformEnabled(id))throw new AppError("paused",409)};').replace("import {AppError,db,runtime} from './runtime';","class AppError extends Error {constructor(message:string,public status=400){super(message)}};const db=()=>globalThis.__platformTest.database;const runtime=()=>globalThis.__platformTest.env;");
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const api=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('paused platforms never attempt login or become active',async()=>{globalThis.__platformTest.env.PAUSED_PLATFORMS='tmaxx';let calls=0;const original=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw Error('No network expected')};try{const states=await api.connectionStates('alice');assert.equal(states[0].paused,true);assert.equal(states[0].connected,false);assert.equal(calls,0);await assert.rejects(api.platformSession({id:'tmaxx'},'alice'),/paused/);}finally{globalThis.fetch=original;delete globalThis.__platformTest.env.PAUSED_PLATFORMS;}});
test('credentials encrypted, owner isolated, omitted from public status; unavailable connector never active',async()=>{sessions.set('alice:tmaxx','old-token');await api.saveCredentials('alice','tmaxx','alice-user','example-private-password');assert.ok(!rows.get('alice:tmaxx').includes('example-private-password'));assert.equal(sessions.has('alice:tmaxx'),false);assert.deepEqual(await api.readCredentials('alice','tmaxx'),{username:'alice-user',password:'example-private-password'});assert.equal(await api.readCredentials('bob','tmaxx'),undefined);const states=await api.connectionStates('alice');assert.equal(states[0].connected,false);assert.equal(states[0].credentialsSaved,true);assert.ok(!JSON.stringify(states).includes('example-private-password'));await assert.rejects(api.saveCredentials('alice','unknown','user','pass'));});

test('corrupted dotenv credential placeholders fail before any platform request',async()=>{
 let calls=0;const original=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw Error('No network expected')};
 try{await assert.rejects(api.platformSession({id:'inttra',name:'INTTRA',authVerified:true,origin:'https://api.inttra.e2open.com',auth:{path:'/auth',tokenPath:'access_token',body:{username:':username',password:':password'}}},'alice'),/yer tutucu/);assert.equal(calls,0);}finally{globalThis.fetch=original;}
});


test('archive user relation matches the native contract and never copies credentials',()=>{
 const user={id:1,version:3,username:'private-user',password:'private-password',token:'private-token',firm:{id:20,version:2,name:'CBI TEST',firm:null,createDate:'date',copyId:null,textBackGroundColor:null,hints:null,apiKey:'private-key'}};
 const ref=api.archiveUserReference(user);assert.deepEqual(ref,{id:1,version:3,firm:{id:20,version:2,name:'CBI TEST',firm:null,createDate:'date',copyId:null,textBackGroundColor:null,hints:null}});assert.doesNotMatch(JSON.stringify(ref),/private|password|token|apiKey/);
 assert.equal(api.archiveUserReference({id:1}),undefined);assert.equal(api.archiveUserReference({...user,version:-1}),undefined);assert.equal(api.archiveUserReference({...user,firm:{id:0,version:2}}),undefined);
});
