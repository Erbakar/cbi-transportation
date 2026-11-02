import test from 'node:test';import assert from 'node:assert/strict';
import {cmaSubmissionEvidence} from '../lib/cma-submission-evidence.ts';
const p={booking:'ISB2086617',container:'TRHU3971713',signature:'Ozan Kaman',vgmKg:'7950'};
const row=['ISB2086617','','SUBMITTED','TRHU3971713','2100','No VGM','OZAN KAMAN','16-OCT-2026 01:17 PM',''];
const check=rows=>cmaSubmissionEvidence(rows,p,'2026-10-16T12:00:00Z');
test('pending carrier receipt reconciles without claiming integrated weight',()=>assert.match(check([row]),/bekleniyor/));
test('missing, old, wrong signer, duplicate rows or wrong integrated mass never reconcile',()=>{
 for(const [i,value] of [[2,'MISSING'],[0,'other'],[3,'other'],[6,'Someone else'],[7,'15-OCT-2026 01:17 PM']]){const r=[...row];r[i]=value;assert.equal(check([r]),null);}
 assert.equal(check([row,row]),null);const r=[...row];r[2]='INTEGRATED';r[5]='7,000.00 KGM';assert.equal(check([r]),null);r[5]='7,950.00 KGM';assert.match(check([r]),/işlendi/);
});
