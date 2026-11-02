import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveCountryOption} from '../lib/inttra-reference.ts';

const turkey={value:'101078',label:'TURKEY',code:'TR'};
const chile={value:'100218',label:'CHILE',code:'CL'};
const turkmenistan={value:'101083',label:'TURKMENISTAN',code:'TM'};
const options=[{value:'0',label:'Seçin'},turkey,chile,turkmenistan];

test('Turkish and English country names, ISO codes and stored IDs resolve to the live option',()=>{
 const before=structuredClone(options);
 for(const value of ['TÜRKİYE','Türkiye','tu\u0308rki\u0307ye','TURKIYE','TURKEY',' turkey ','TR','tr','TUR','101078'])assert.equal(resolveCountryOption(options,value),turkey,value);
 for(const value of ['CHILE','chile','CL','cl','100218'])assert.equal(resolveCountryOption(options,value),chile,value);
 assert.equal(resolveCountryOption(options,'TURKMENISTAN'),turkmenistan);
 assert.deepEqual(options,before);
});

test('country matching never guesses from similar names, addresses or missing options',()=>{
 for(const value of ['',null,undefined,'0','TURK','TURKISH','ISTANBUL / TÜRKİYE','101078x'])assert.equal(resolveCountryOption(options,value),null);
 assert.equal(resolveCountryOption([chile,turkmenistan],'TÜRKİYE'),null);
 assert.equal(resolveCountryOption([{value:'',label:'TURKEY',code:'TR'}],'TÜRKİYE'),null);
});

test('current IDs and renamed platform labels are used without hardcoded geography identifiers',()=>{
 const current={value:'NEW-PLATFORM-ID',label:'TÜRKİYE',code:'TR'};
 assert.equal(resolveCountryOption([current],'Turkey'),current);
 assert.equal(resolveCountryOption([current],'TR'),current);
 assert.equal(resolveCountryOption([{value:'country-id',label:'Turkey'}],'Türkiye')?.value,'country-id');
});

test('ambiguous country names remain blocked while explicit unique selections win',()=>{
 const duplicate={value:'different-id',label:'TURKIYE',code:'TR'};
 assert.equal(resolveCountryOption([...options,duplicate],'Türkiye'),null);
 assert.equal(resolveCountryOption([...options,duplicate],'TR'),null);
 assert.equal(resolveCountryOption([...options,duplicate],turkey.value),turkey);
 assert.equal(resolveCountryOption([turkey,{...turkey}],turkey.value),null);
});
