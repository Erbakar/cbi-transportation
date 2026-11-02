import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {syncLocalRelay} from '../scripts/inttra-relay-config.mjs';
test('local tunnel update preserves keys, platform settings and credentials independently of production deployment',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cbi-relay-test-'));try{
 fs.mkdirSync(path.join(root,'.private/inttra-relay'),{recursive:true});const file=path.join(root,'.private/inttra-relay/secrets.json');fs.writeFileSync(file,JSON.stringify({INTTRA_RELAY_URL:'https://old.trycloudflare.com',INTTRA_RELAY_KEY:'fixture-only'}));
 const env='APP_USERNAME=fixture\nENCRYPTION_KEY=unchanged\nINTTRA_RELAY_URL=https://old.trycloudflare.com\nPLATFORM_CONTRACTS=unchanged\n';fs.writeFileSync(path.join(root,'.env.local'),env);
 syncLocalRelay(root,'https://new.trycloudflare.com');assert.equal(JSON.parse(fs.readFileSync(file)).INTTRA_RELAY_KEY,'fixture-only');assert.equal(fs.readFileSync(path.join(root,'.env.local'),'utf8'),env.replace('old.trycloudflare.com','new.trycloudflare.com'));assert.equal(fs.statSync(file).mode&0o777,0o600);
 assert.throws(()=>syncLocalRelay(root,'http://unsafe.example'));assert.throws(()=>syncLocalRelay(root,'https://new.trycloudflare.com\nAPP_USERNAME=other'));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
