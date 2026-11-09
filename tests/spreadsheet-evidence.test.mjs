import test from 'node:test';import assert from 'node:assert/strict';
import {spreadsheetTextEvidence,applySpreadsheetText} from '../lib/spreadsheet-evidence.ts';
const page=(rows)=>({page:3,sheet:'TALİMAT',rows:rows.map((r,i)=>({row:i+1,cells:r.map((text,j)=>({cell:String.fromCharCode(65+j)+(i+1),text,value:text}))}))});
test('labelled instruction cells preserve bilingual cargo, repeated HS labels and full contacts without using broker as notify',()=>{
 const p=page([['KONŞİMENTO TALİMATI'],['GÖNDERİCİ FİRMA ÜNVAN VE ADRESİ','EXPORTER\nStreet 12\nCity, TURKEY\nTEL: 123'],['ALICI FİRMA ÜNVAN VE ADRESİ','BUYER\nStreet 5\nCHILE\nRUTE NO: 123-4'],['MAL TANIMI TÜRKÇE - ENGLISH','PARÇALAR\nPARTS'],['GTIP CODE','A- 8302.41.50.00.00\nB- 8302.41.50.00.00'],['GÜMRÜKÇÜ','BROKER\nContact']]);
 const f=spreadsheetTextEvidence(p,'source.xlsx');assert.equal(f.shipperName.value,'EXPORTER');assert.equal(f.shipperAddress.value,'Street 12\nCity, TURKEY\nTEL: 123');assert.match(f.consigneeAddress.value,/RUTE NO/);assert.equal(f.description.value,'PARÇALAR\nPARTS\nA- 8302.41.50.00.00\nB- 8302.41.50.00.00');assert.equal(f.hsCode.value,'8302.41.50.00.00, 8302.41.50.00.00');assert.equal(f.notifyName,undefined);assert.match(f.description.source,/page 3: TALİMAT!B4/);
});
test('noninstruction and ambiguous repeated labels are left to semantic extraction and conflict checks',()=>{
 assert.deepEqual(spreadsheetTextEvidence(page([['INVOICE'],['SHIPPER','A\nStreet']]),'a.xlsx'),{});
 const f=spreadsheetTextEvidence(page([['SHIPPING INSTRUCTIONS'],['SHIPPER','A\nStreet'],['SHIPPER','B\nOther Street']]),'a.xlsx');assert.equal(f.shipperName,undefined);assert.equal(f.shipperAddress,undefined);
});
test('exact sheet text updates only a uniquely associated combined cargo group',()=>{
 const f={description:{value:'ALL GOODS',source:'source.xlsx, page 1: ALL GOODS',confidence:1}},c={containerNumber:{value:'ABCU1234567'}};
 const a={fields:{},containers:[c],cargoLines:[{...c}]},r=applySpreadsheetText(a,f);assert.equal(r.cargoLines[0].description.value,'ALL GOODS');assert.equal(a.cargoLines[0].description,undefined);
 for(const b of [{...a,cargoLines:[{...c},{...c}]},{...a,cargoLines:[{containerNumber:{value:'OTHER'}}]}])assert.equal(applySpreadsheetText(b,f).cargoLines[0].description,undefined);
});
