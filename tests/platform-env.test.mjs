import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {loadEnv} from 'vite';
test('local Vite configuration preserves escaped credential and field placeholders',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cbi-env-'));
 try{
  const contracts=[{auth:{body:{username:'$credential:username',password:'$credential:password'}},create:{body:{booking:'$field:bookingNumber'}}}];
  fs.writeFileSync(path.join(root,'.env.local'),'CBI_TEST_CONTRACTS='+JSON.stringify(contracts).replaceAll('$','\\$')+'\n');
  const env=loadEnv('development',root,'CBI_TEST_');assert.deepEqual(JSON.parse(env.CBI_TEST_CONTRACTS),contracts);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
