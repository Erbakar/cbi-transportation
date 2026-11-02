import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveTmaxxPacking,tmaxxHblPortName,descriptionHasNetWeight} from '../lib/tmaxx-hbl-format.ts';
import {cargoPrint} from '../lib/shipment-rules.ts';

// Representative code/name pairs read from the native packingTypes select box.
const types=[{code:'PACKAGES',name:'PACKAGES'},{code:'PACKAGE',name:'PACKAGE'},{code:'PALLET',name:'Pallet'},{code:'PALLETS',name:'PALLETS'},{code:'COLLIES',name:'Koli'},{code:'BOXES',name:'BOXES'},{code:'PK',name:'PK'},{code:'KAP',name:'kap'}];
test('document packaging text resolves to an actual native selection code',()=>{
 for(const [input,expected]of[['PAKET','PACKAGES'],['paketler','PACKAGES'],['Package','PACKAGE'],['Packages','PACKAGES'],['PKG','PACKAGES'],['PK','PK'],['kap','KAP'],['KOLİ','COLLIES'],['koli','COLLIES'],['Pallet','PALLET'],['PALET','PALLETS'],['BOX','BOXES']])assert.equal(resolveTmaxxPacking(input,types),expected);
 assert.ok(!types.some(o=>o.code==='PAKET'));
});
test('unavailable or ambiguous packaging never falls back to a blank native dropdown',()=>{
 for(const [input,options]of[['PAKET',[]],['CRATE',types],['PAKET',types.filter(t=>t.code!=='PACKAGES')],['Container',[{code:'A',name:'Container'},{code:'B',name:'Container'}]]])assert.throws(()=>resolveTmaxxPacking(input,options));
});
test('HBL port text strips the exact native suffix and preserves the real name',()=>{
 for(const [input,expected]of[['TEKIRDAG - TR - TEK','TEKIRDAG'],['SAN ANTONIO - CL - SAI','SAN ANTONIO'],['PORT-SAID - EG - PSD','PORT-SAID'],['FOS-SUR-MER – FR – FOS','FOS-SUR-MER'],['SAN ANTONIO ','SAN ANTONIO'],['PORT - NORTH - EAST','PORT - NORTH - EAST'],['TEKIRDAG (TRTEK)','TEKIRDAG (TRTEK)']])assert.equal(tmaxxHblPortName(input),expected);
});
test('only an actual net weight in the description suppresses the separate field',()=>{
 for(const text of ['PVC\nNET WEIGHT: 21979.98 KG','Net Weight (kg): 21.979,98','NET WT. 10 KGS','NET AĞIRLIK: 10 KG','N.W.: 10 KG'])assert.equal(descriptionHasNetWeight(text),true,text);
 for(const text of ['PVC PROFILES','GROSS WEIGHT: 10 KG','NET WEIGHT: TO BE ADVISED','GROSS 10 KG / NET WEIGHT','INTERNET WEIGHT 10'])assert.equal(descriptionHasNetWeight(text),false,text);
});
test('weight detection uses the final description and preserves explicitly prepared text',()=>{
 const f=value=>({value,source:'Instruction',confidence:1}),row={description:f('PVC PROFILES'),netWeightKg:f('10'),hsCode:f('391620000000'),marksAndNumbers:f('ORDER NO: 1297')};
 const source=JSON.stringify(row),description=cargoPrint(row).description;
 assert.match(description,/ORDER NO: 1297/);assert.match(description,/391620000000/);assert.match(description,/NET WEIGHT: 10 KG/);assert.equal(descriptionHasNetWeight(description),true);assert.equal(JSON.stringify(row),source);
 row.description=f('PVC PROFILES\nNET WEIGHT: 10 KG');assert.equal((cargoPrint(row).description.match(/NET WEIGHT/g)||[]).length,1);
 row.description={...f('PVC PROFILES'),source:'Kullanıcı · Hazırlanmış mal açıklaması'};assert.equal(descriptionHasNetWeight(cargoPrint(row).description),false);assert.equal(row.netWeightKg.value,'10');
});
