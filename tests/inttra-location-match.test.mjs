import test from 'node:test';import assert from 'node:assert/strict';
import {matchInttraLocation} from '../lib/inttra-location-match.ts';
test('uses the exact country/port code when several countries share the same city name',()=>{
 const options=[['SAN ANTONIO, CHILE (CLSAI)','cl'],['SAN ANTONIO, TX, UNITED STATES (USSAT)','us'],['SAN ANTONIO, SPAIN (ESSAA)','es']];
 assert.equal(matchInttraLocation('SAN ANTONIO - CL - SAI','SAN ANTONIO',options),'cl');
 assert.equal(matchInttraLocation('SAN ANTONIO','SAN ANTONIO',options),'');
 assert.equal(matchInttraLocation('SAN ANTONIO - CL - SAI','SAN ANTONIO',options.slice(1)),'');
 assert.equal(matchInttraLocation('SAN ANTONIO - CL - SAI','SAN ANTONIO',[...options,options[0]]),'');
 assert.equal(matchInttraLocation('TEKIRDAG','TEKIRDAG',[['TEKIRDAG, TURKEY (TRTEK)','tr']]),'tr');
});
