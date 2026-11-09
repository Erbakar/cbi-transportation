import test from 'node:test';import assert from 'node:assert/strict';import {completeSourceReading} from '../lib/source-completion.ts';
const f=v=>({value:v,source:'instruction, page 1: '+v,confidence:1});
const ex=()=>({fields:{shipperAddress:f('Street No.27, City / TURKEY'),consigneeName:f('Buyer')},actualParties:{shipper:{state:f('Wrong inferred region')}},documentType:'instruction',issues:[],containers:[{containerNumber:f('ABCU1234567')}],containerCount:1,cargoLineCount:1,cargoLines:[{containerNumber:f('ABCU1234567'),description:f('GOODS'),packageCount:f('39'),packageType:f('PALLETS'),grossWeightKg:f('22437'),netWeightKg:f('22047')}]});
test('focused reading fills omitted contacts, retains complementary quantities and leaves raw source untouched',()=>{
 const a=ex(),snapshot=JSON.stringify(a),b=ex();b.fields.shipperAddress=f('Street 27, City / TURKEY\nTEL: 123');b.actualParties.shipper={country:f('TURKEY')};b.cargoLines[0].description=f('ÜRÜNLER\nGOODS\nPRODUCT- 8302.41.50.00.00');delete b.cargoLines[0].netWeightKg;
 const r=completeSourceReading(a,b);assert.deepEqual(r.issues,[]);assert.match(r.fields.shipperAddress.value,/TEL/);assert.equal(r.cargoLines[0].netWeightKg.value,'22047');assert.equal(r.actualParties.shipper.state,undefined);assert.equal(JSON.stringify(a),snapshot);
});
test('contradictory printed identifiers are never silently cleared by completion',()=>{
 const a=ex(),b=ex();a.issues=['existing conflict'];b.fields.consigneeName=f('Different Buyer');const r=completeSourceReading(a,b);assert.ok(r.issues.includes('existing conflict'));assert.ok(r.issues.some(i=>i.includes('Different Buyer')));
});
test('a focused partial page cannot erase cargo belonging to another container',()=>{
 const a=ex();a.containers.push({containerNumber:f('DECU7654321')});a.containerCount=2;a.cargoLines.push({...a.cargoLines[0],containerNumber:f('DECU7654321')});a.cargoLineCount=2;const b=ex();const r=completeSourceReading(a,b);assert.equal(r.containers.length,2);assert.equal(r.cargoLines.length,2);assert.equal(r.cargoLines[1].containerNumber.value,'DECU7654321');
});

test('an incomplete second reading retains earlier components still present in the full address',()=>{
 const a=ex(),b=ex();a.actualParties.shipper={street:f('Street'),streetNumber:f('27'),country:f('TURKEY'),state:f('Unsupported')};b.actualParties.shipper={};
 const r=completeSourceReading(a,b);assert.equal(r.actualParties.shipper.street.value,'Street');assert.equal(r.actualParties.shipper.streetNumber.value,'27');assert.equal(r.actualParties.shipper.country.value,'TURKEY');assert.equal(r.actualParties.shipper.state,undefined);
});
