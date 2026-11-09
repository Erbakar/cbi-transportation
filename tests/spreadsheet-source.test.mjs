import test from 'node:test';import assert from 'node:assert/strict';import * as XLSX from 'xlsx';
import {spreadsheetPages} from '../lib/server/spreadsheet-source.ts';
const bytes=(sheets,bookType='xlsx',properties)=>{const wb=XLSX.utils.book_new();for(const [name,ws] of sheets)XLSX.utils.book_append_sheet(wb,ws,name);if(properties)wb.Workbook=properties;return XLSX.write(wb,{type:'array',bookType,cellStyles:true});};
test('XLSX and legacy XLS preserve Turkish multiline cells, explicit zeros and identifier formatting',()=>{
 for(const type of ['xlsx','biff8']){
  const ws=XLSX.utils.aoa_to_sheet([['MAL TANIMI','KAPI VE PENCERE\nWINDOW AND DOOR'],['NET KG',22047],['ZIP','00123'],['ZERO',0]]);ws.C3={t:'n',v:42,z:'000000'};ws['!ref']='A1:C4';
  const pages=spreadsheetPages(bytes([['TALİMAT',ws]],type));assert.equal(pages.length,1);assert.equal(pages[0].sheet,'TALİMAT');
  for(const value of ['KAPI VE PENCERE\\nWINDOW AND DOOR','22047','00123','000042','B4="0"'])assert.ok(pages[0].text.includes(value));
 }
});
test('all visible sheets retain their source indices while hidden data is excluded',()=>{
 const visible=XLSX.utils.aoa_to_sheet([['Visible','OLD COLUMN'],['OLD ROW'],['End']]);visible['!rows']=[{}, {hidden:true}];visible['!cols']=[{}, {hidden:true}];
 const pages=spreadsheetPages(bytes([['A',visible],['Old',XLSX.utils.aoa_to_sheet([['HIDDEN SHEET']])],['TALİMAT',XLSX.utils.aoa_to_sheet([['Current']])]],'xlsx',{Sheets:[{Hidden:0},{Hidden:1},{Hidden:0}]}));
 assert.deepEqual(pages.map(p=>p.page),[1,3]);assert.ok(!JSON.stringify(pages).includes('OLD'));assert.ok(!JSON.stringify(pages).includes('HIDDEN SHEET'));
});
test('merged cells are not multiplied; formulas use saved results and unresolved formulas have no invented value',()=>{
 const ws=XLSX.utils.aoa_to_sheet([['TOTAL PALLETS',39],['MERGED']]);ws['!merges']=[XLSX.utils.decode_range('A2:C2')];ws.A3={t:'n',f:'1+2',v:3};ws.B3={t:'n',f:'SUM(A1:A2)'};ws.C3={t:'e',v:7};ws['!ref']='A1:C3';
 const text=spreadsheetPages(bytes([['Data',ws]]))[0].text;
 assert.equal((text.match(/A2=/g)||[]).length,1);assert.ok(text.includes('A2:C2'));assert.ok(text.includes('A3="3"'));assert.ok(text.includes('Formülün kayıtlı sonucu yok'));assert.ok(text.includes('Excel hücre hatası'));assert.ok(!text.includes('SUM('));
});
test('non-workbooks and oversized archives fail explicitly without partial extraction',()=>{
 assert.throws(()=>spreadsheetPages(new TextEncoder().encode('Not an Excel workbook').buffer));
 const data=new Uint8Array(bytes([['Data',XLSX.utils.aoa_to_sheet([['test']])]]));const view=new DataView(data.buffer);let p=0;while(p<data.length-46&&view.getUint32(p,true)!==0x02014b50)p++;view.setUint32(p+24,50*1024*1024,true);assert.throws(()=>spreadsheetPages(data.buffer),/sınır/);
});
