import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {cleanSnapshot,browserStatus} from '../scripts/cma-bridge/protocol.mjs';
test('bridge accepts bounded table rows and never accepts a submission result',()=>{
 const input={state:'ready',total:65,rows:[['ISB123','20-OCT-2026','Missing','TEST','3700','No VGM','','','']],cookie:'secret',accepted:true};
 const out=cleanSnapshot(input);assert.equal(out.rows.length,1);assert.equal(out.cookie,undefined);assert.equal(out.accepted,undefined);
 for(const v of [{state:'accepted'}, {state:'ready',total:0,rows:input.rows},{state:'ready',total:1,rows:[[1,2]]},{state:'ready',total:1,rows:[Array(9).fill('x'.repeat(251))]}])assert.throws(()=>cleanSnapshot(v));
});
test('stale results or an offline extension never appear connected',()=>{
 const now=200000,last={observedAt:199000,snapshot:{state:'ready'}};
 assert.equal(browserStatus(last,199000,now).connected,true);
 assert.equal(browserStatus(last,0,now).connected,false);
 assert.equal(browserStatus({...last,observedAt:1},199000,now).connected,false);
 assert.equal(browserStatus({observedAt:199000,snapshot:{state:'login_required'}},199000,now).connected,false);
 assert.equal(browserStatus(last,199000,now).submissionEnabled,false);
});
test('extension keeps narrow CMA and CBI hosts without cookies or debugger permissions',()=>{
 const m=JSON.parse(fs.readFileSync('browser/cma-bridge/manifest.json','utf8'));
 assert.deepEqual(m.permissions,['alarms']);assert.deepEqual(m.host_permissions,['http://127.0.0.1/*','https://www.cma-cgm.com/*','https://auth.cma-cgm.com/*','https://cbi-transportation.kadirerbakar.workers.dev/*']);
 assert.deepEqual(m.content_scripts[0].matches,['https://www.cma-cgm.com/ebusiness/vgm']);
 const worker=fs.readFileSync('browser/cma-bridge/worker.js','utf8');assert.ok(worker.includes('active:false'));assert.ok(!worker.includes('chrome.cookies'));assert.ok(!worker.includes('chrome.tabs.update'));
});
