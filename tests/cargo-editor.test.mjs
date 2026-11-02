import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {createRequire} from 'node:module';import {renderToStaticMarkup} from 'react-dom/server';import {createElement} from 'react';
const require=createRequire(import.meta.url);
const result=await build({entryPoints:['components/cargo-editor.tsx'],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic'});
const compiled={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(require,compiled,compiled.exports);const {CargoEditor}=compiled.exports;
const f=value=>({value,source:'document',confidence:1});
test('editable cargo description contains full codes, references and net weight without a separate HS entry or second preview',()=>{
 const html=renderToStaticMarkup(createElement(CargoEditor,{rows:[{description:f('PVC PROFILE'),hsCode:f('39.16.20.00.00.00, 39.25.90.80.00.00'),marksAndNumbers:f('ORDER NO: 1293'),netWeightKg:f('100')}],manual:{cargoOverrides:[]},disabled:false,showAll:true,onChange:()=>{}}));
 const description=html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)[1];assert.match(description,/PVC PROFILE/);assert.match(description,/391620000000, 392590800000/);assert.match(description,/ORDER NO: 1293/);assert.match(description,/NET WEIGHT: 100 KG/);assert.doesNotMatch(html,/HS \/ HTS kodu|cargo-preview/);
});

test('cargo correction updates heading, matching status and platform row options together',()=>{
 const html=renderToStaticMarkup(createElement(CargoEditor,{rows:[{containerNumber:f('WRONG')}],containers:[{containerNumber:f('ARKU8360679')}],manual:{cargoOverrides:[{index:0,fields:{containerNumber:'ARKU8360679'}}],tmaxxPackOptions:[{id:12,containerNumber:'ARKU8360679',description:'Correct pack',quantity:1,grossWeight:10},{id:13,containerNumber:'WRONG',description:'Wrong pack',quantity:1,grossWeight:10}]},disabled:false,showAll:true,onChange:()=>{}}));
 assert.match(html,/1\/1 mal kalemi konteynerle eşleşti/);assert.match(html,/<h4>ARKU8360679<\/h4>/);assert.match(html,/Correct pack/);assert.doesNotMatch(html,/Wrong pack/);assert.match(html,/Mal kalemi 1 konteyneri/);
});
