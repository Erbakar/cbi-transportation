import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
import {applyCargoLanguage} from '../lib/cargo-language.ts';import {cargoPrint} from '../lib/shipment-rules.ts';import {validate} from '../lib/domain.ts';
const uri=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const {applyManual,applyCargoTotals}=await import(uri(fs.readFileSync('lib/manual-extraction.ts','utf8')));
const f=value=>({value,source:'instruction, page 1: '+value,confidence:1});
const description='KAPI VE PENCERE AKSESUARLARI\nWINDOW AND DOOR ACCESSORRIES\nİSPANYOLETLER- 8302.41.50.00.00,\nKOLLAR- 8301.40.19.00.19,\nMENTEŞELER- 8302.10.00.00.19,\nİSPANYOLET KARŞILIKLARI- 8302.41.50.00.00';
const codes='8302.41.50.00.00, 8301.40.19.00.19, 8302.10.00.00.19, 8302.41.50.00.00';
const ex=()=>({fields:{description:f(description),packageCount:f('39'),packageType:f('PALLETS'),grossWeightKg:f('22437')},documentType:'instruction',issues:[],containerCount:1,cargoLineCount:1,containers:[{containerNumber:f('MSDU8764520'),containerType:f('40 HC')}],cargoLines:[{description:f(description),hsCode:f(codes),netWeightKg:f('22047'),packageCount:f('39'),packageType:f('PALLETS'),grossWeightKg:f('22437'),containerNumber:f('MSDU8764520')}]});
const m={fieldOverrides:{},partyOverrides:{},containerOverrides:[],cargoOverrides:[]};
test('bilingual instructions keep original evidence but print English, all dotted HS codes including duplicates, and net weight',()=>{
 const raw=ex(),before=JSON.stringify(raw),result=applyCargoLanguage(raw,[{index:0,status:'found',segments:['WINDOW AND DOOR ACCESSORRIES']}]);
 assert.equal(cargoPrint(result.cargoLines[0]).description,'WINDOW AND DOOR ACCESSORRIES\nHS CODE : '+codes+'\nNET WEIGHT: 22047 KG');assert.equal(cargoPrint(result.cargoLines[0]).hsCode,'830241');assert.equal(result.cargoLines[0].description.value,description);assert.equal(JSON.stringify(raw),before);assert.deepEqual(validate(result,[]),[]);
});
test('source selection rejects invented translations, foreign row text and incomplete index coverage',()=>{
 const raw=ex();raw.cargoLines[0].description=f('KAPI AKSESUARLARI');assert.throws(()=>applyCargoLanguage(raw,[{index:0,status:'found',segments:['DOOR ACCESSORIES']}]));assert.throws(()=>applyCargoLanguage(raw,[]));assert.throws(()=>applyCargoLanguage(raw,[{index:1,status:'found',segments:['KAPI AKSESUARLARI']}]));
});
test('missing English blocks submission and asks the user; adding English clears only that requirement',()=>{
 const raw=ex();raw.cargoLines[0].description=f('KAPI AKSESUARLARI');const missing=applyCargoLanguage(raw,[{index:0,status:'missing',segments:[]}]);assert.ok(validate(missing,[]).some(s=>s.includes('İngilizce mal tanımı')));assert.doesNotMatch(cargoPrint(missing.cargoLines[0]).description,/KAPI/);
 const printed=cargoPrint(missing.cargoLines[0]).description;
 const marksOnly=applyManual(missing,{...m,cargoOverrides:[{index:0,preparedDescription:true,fields:{description:printed,marksAndNumbers:'PO:123'}}]});assert.ok(validate(marksOnly,[]).some(s=>s.includes('İngilizce mal tanımı')));
 const edited=applyManual(missing,{...m,cargoOverrides:[{index:0,preparedDescription:true,englishDescriptionProvided:true,fields:{description:'DOOR ACCESSORIES\n'+printed}}]});assert.deepEqual(validate(edited,[]),[]);assert.equal(cargoPrint(edited.cargoLines[0]).description,'DOOR ACCESSORIES\n'+printed);
});
test('technical specifications, brands with diacritics and cargo references are retained independently per container',()=>{
 const raw=ex();raw.cargoLines[0].description=f('KONVEYÖR BANT\nBÖLL Conveyor Belt\n16 MPA - 130 mm3 Abrasion\nORDER NO: 1293\nREF: X9');const r=applyCargoLanguage(raw,[{index:0,status:'found',segments:['BÖLL Conveyor Belt','16 MPA - 130 mm3 Abrasion','ORDER NO: 1293','REF: X9']}]);const printed=cargoPrint(r.cargoLines[0]).description;assert.match(printed,/BÖLL Conveyor Belt\n16 MPA - 130 mm3 Abrasion\nORDER NO: 1293\nREF: X9/);assert.doesNotMatch(printed,/KONVEY/);
});
test('saved prepared descriptions and legacy frozen rows preserve their existing print contract',()=>{
 const r=ex().cargoLines[0],legacy=cargoPrint(r).description;assert.match(legacy,/KAPI VE PENCERE/);
 const prepared={...r,carrierDescription:f('WINDOW AND DOOR ACCESSORRIES'),description:{...f('USER ENGLISH\nHS CODE: 830241'),source:'Kullanıcı · Hazırlanmış mal açıklaması'}};assert.equal(cargoPrint(prepared).description,'USER ENGLISH\nHS CODE: 830241');
});
test('shipment-total mode keeps missing English blocking rather than silently dropping that product',()=>{
 const r=applyCargoLanguage(ex(),[{index:0,status:'missing',segments:[]}]);r.cargoLines.push({...r.cargoLines[0],carrierDescription:f('SECOND PRODUCT')});r.cargoLineCount=2;applyCargoTotals(r);assert.equal(r.cargoLines.length,1);assert.equal(r.cargoLines[0].carrierDescription.value,null);assert.ok(validate(r,[]).some(s=>s.includes('İngilizce')));
});
