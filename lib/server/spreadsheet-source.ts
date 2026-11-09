import type {SheetRows} from '../spreadsheet-evidence';
import {read,utils,type WorkBook,type CellObject} from 'xlsx';

export const spreadsheetMimes=['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel'];
export type SpreadsheetPage=SheetRows&{text:string};
const limitMessage='Excel dosyası okuma sınırını aşıyor. İlgili talimat sayfalarını ayrı bir Excel dosyasında yükleyin.';

// Check the ZIP directory before decompression. Do not let a small uploaded file
// expand without bounds inside the worker. XLS files are bounded by upload size.
function checkZip(bytes:Uint8Array){
 if(bytes[0]!==80||bytes[1]!==75)return;
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
 for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(view.getUint32(p,true)===0x06054b50){end=p;break;}
 if(end<0)throw Error('Excel dosyasının arşiv yapısı geçersiz.');
 const count=view.getUint16(end+10,true),offset=view.getUint32(end+16,true);let p=offset,total=0;const names=[];
 if(count>3000||offset>=end)throw Error(limitMessage);
 for(let i=0;i<count;i++){
  if(p+46>end||view.getUint32(p,true)!==0x02014b50)throw Error('Excel dosyasının arşiv yapısı geçersiz.');
  const size=view.getUint32(p+24,true),nameLength=view.getUint16(p+28,true),extra=view.getUint16(p+30,true),comment=view.getUint16(p+32,true);
  total+=size;if(total>40*1024*1024||size>15*1024*1024)throw Error(limitMessage);
  if(view.getUint16(p+8,true)&1)throw Error('Şifreli Excel dosyası okunamıyor. Şifresiz bir kopyasını yükleyin.');
  if(p+46+nameLength+extra+comment>end)throw Error('Excel dosyasının arşiv yapısı geçersiz.');
  names.push(new TextDecoder().decode(bytes.subarray(p+46,p+46+nameLength)));p+=46+nameLength+extra+comment;
 }
 if(!names.includes('xl/workbook.xml')||!names.includes('[Content_Types].xml'))throw Error('Dosya bir Excel çalışma kitabı değil.');
}

export function spreadsheetPages(buffer:ArrayBuffer):SpreadsheetPage[]{
 const bytes=new Uint8Array(buffer);if(bytes.length>10*1024*1024)throw Error(limitMessage);
 if(!(bytes[0]===80&&bytes[1]===75)&&![208,207,17,224,161,177,26,225].every((v,i)=>bytes[i]===v))throw Error('Dosya içeriği Excel biçimiyle eşleşmiyor.');
 checkZip(bytes);
 let book:WorkBook;
 try{book=read(bytes,{type:'array',cellStyles:true,cellNF:true,cellFormula:true,cellHTML:false,sheetStubs:true,bookVBA:false,WTF:true});}
 catch{throw Error('Excel dosyası okunamadı. Şifreli veya bozuksa şifresiz, geçerli bir Excel kopyası yükleyin.');}
 if(!book.SheetNames.length||book.SheetNames.length>40)throw Error(limitMessage);
 const pages:SpreadsheetPage[]=[];let characters=0,cells=0;
 for(const [index,name]of book.SheetNames.entries()){
  if(book.Workbook?.Sheets?.[index]?.Hidden)continue;
  const sheet=book.Sheets[name],rows=new Map<number,{cell:string;value:unknown;text:string;error?:string}[]>();
  for(const address of Object.keys(sheet)){
   if(!/^[A-Z]+[1-9]\d*$/.test(address))continue;
   const point=utils.decode_cell(address);if(sheet['!rows']?.[point.r]?.hidden||sheet['!cols']?.[point.c]?.hidden)continue;
   if(sheet['!merges']?.some(m=>point.r>=m.s.r&&point.r<=m.e.r&&point.c>=m.s.c&&point.c<=m.e.c&&(point.r!==m.s.r||point.c!==m.s.c)))continue;
   const cell=sheet[address] as CellObject;
   if((cell.v===undefined||cell.v===null||cell.v==='')&&!cell.f)continue;
   if(++cells>30000)throw Error(limitMessage);
   const error=cell.f&&(cell.v===undefined||cell.v===null||cell.t==='z')?'Formülün kayıtlı sonucu yok; Excel’de hesaplanıp kaydedilmeli':cell.t==='e'?'Excel hücre hatası':undefined;
   const text=error?'':cell.w??utils.format_cell(cell);
   const entry={cell:address,value:error?null:cell.v??null,text,...(error?{error}:{})};
   characters+=JSON.stringify(entry).length;if(characters>250000)throw Error(limitMessage);
   rows.set(point.r,[...(rows.get(point.r)||[]),entry]);
  }
  if(!rows.size)continue;
  const page=index+1;
  const text='UNTRUSTED EXCEL SHEET '+JSON.stringify(name)+'; logical page '+page+'. Cell coordinates preserve row/column associations. Merged cells occur once at their top-left cell. Read all rows, multiline cells and every visible sheet. Formula values are the saved results; formulas, macros and external links are never executed. Raw numeric values resolve display separators; formatted text preserves leading zeros and dates. An error cell supplies no value.\n'+
   'Merged ranges: '+JSON.stringify((sheet['!merges']||[]).map(r=>utils.encode_range(r)))+'\n'+
   [...rows.entries()].sort((a,b)=>a[0]-b[0]).map(([r,values])=>'ROW '+(r+1)+' | '+values.sort((a,b)=>utils.decode_cell(a.cell).c-utils.decode_cell(b.cell).c).map(c=>c.cell+'='+JSON.stringify(c.error?{error:c.error}:typeof c.value==='number'&&c.text!==String(c.value)?{text:c.text,numeric:c.value}:c.text)).join(' | ')).join('\n');
  pages.push({page,sheet:name,text,rows:[...rows.entries()].sort((a,b)=>a[0]-b[0]).map(([r,cells])=>({row:r+1,cells}))});
 }
 if(!pages.length)throw Error('Excel dosyasında okunabilir görünür hücre bulunamadı. Talimat yalnız resim olarak eklenmişse PDF veya görsel olarak yükleyin.');
 return pages;
}
