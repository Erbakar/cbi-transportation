import test from 'node:test';import assert from 'node:assert/strict';
import {readInttraResponse} from '../scripts/inttra-response.mjs';
const path='/siact/amend?siId=548509629&originalSiId=548509629';
test('amend plain JSON uses declared encoding, not UTF8 replacement characters',async()=>{
 const body=Buffer.from(JSON.stringify({ShipmentInstruction:{CompanyName:'KAUÇUK TÜRK'}}),'latin1');
 const data=await readInttraResponse(new Response(body,{headers:{'content-type':'text/plain;charset=ISO-8859-1'}}),path);
 assert.equal(data.ShipmentInstruction.CompanyName,'KAUÇUK TÜRK');
});
test('plain response exception does not accept HTML or expand to final submission',async()=>{
 await assert.rejects(readInttraResponse(new Response('<html>login</html>',{headers:{'content-type':'text/plain'}}),path));
 await assert.rejects(readInttraResponse(new Response('{}',{headers:{'content-type':'text/plain'}}),'/siact/submit'));
 await assert.rejects(readInttraResponse(new Response('{}',{headers:{'content-type':'text/plain'}}),path));
});
