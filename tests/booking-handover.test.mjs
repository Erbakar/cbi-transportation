import test from 'node:test';
import assert from 'node:assert/strict';
import {bookingSchema,emptyBooking,assessBooking,referenceKey} from '../lib/operations/booking.ts';
const complete={salesReference:'Q.26.1',customer:'Test müşteri',shipper:'Test yükleyici',loadPort:'TRAMB',dischargePort:'DEHAM',equipmentType:'40HC',equipmentCount:1,incoterm:'FOB',freightPayment:'prepaid',assignee:'Operasyon',sourceReference:'Test devir e-postası',notes:''};
test('incomplete draft can be stored without pretending it is confirmed',()=>{const draft=bookingSchema.parse({...emptyBooking,salesReference:'Q.26.2'});assert.equal(assessBooking(draft).status,'incomplete');assert.ok(assessBooking(draft).missing.some(x=>x.key==='equipmentCount'))});
test('complete draft awaits review, never confirmation or transfer',()=>{assert.deepEqual(assessBooking(bookingSchema.parse(complete)),{status:'review',missing:[]})});
test('invalid equipment count and unexpected workflow fields are rejected',()=>{for(const count of [-1,1.5,1000,NaN])assert.equal(bookingSchema.safeParse({...complete,equipmentCount:count}).success,false);assert.equal(bookingSchema.safeParse({...complete,status:'confirmed'}).success,false)});
test('reference and source whitespace are normalized before completeness checks',()=>{assert.equal(referenceKey(' q.26.1 '),referenceKey('Q.26.1'));const d=bookingSchema.parse({...complete,sourceReference:'   '});assert.equal(assessBooking(d).status,'incomplete');assert.equal(bookingSchema.safeParse({...complete,salesReference:'  '}).success,false)});
test('unsupported release/payment assumptions cannot enter the pilot draft',()=>{assert.equal(bookingSchema.safeParse({...complete,freightPayment:'automatic'}).success,false)});
