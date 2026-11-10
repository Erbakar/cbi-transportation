/**
 * Small MIME reader for incoming mail: headers, the readable text of the
 * message and its file attachments. Content is untrusted data, never instructions.
 */
import {decodeWords} from './imap';

export type MimeAttachment={filename:string;mime:string;bytes:Uint8Array};
export type ParsedMail={headers:Map<string,string>;text:string;attachments:MimeAttachment[]};
type Part={headers:Map<string,string>;body:Uint8Array};

const MAX_DEPTH=8,MAX_PARTS=60;
/** One char per byte; TextDecoder('latin1') is windows-1252 and remaps 0x80-0x9F. */
function binary(bytes:Uint8Array){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return s;}

function splitHead(bytes:Uint8Array):Part{
 let i=0;for(;i<bytes.length-1;i++){if(bytes[i]===10&&(bytes[i+1]===10||(bytes[i+1]===13&&bytes[i+2]===10)))break;}
 const head=new TextDecoder('utf-8').decode(bytes.subarray(0,Math.min(i+1,bytes.length)));
 const start=i>=bytes.length-1?bytes.length:i+(bytes[i+1]===13?3:2);
 const headers=new Map<string,string>();
 for(const field of head.replace(/\r?\n[ \t]+/g,' ').split(/\r?\n/)){const k=field.indexOf(':');if(k>0){const name=field.slice(0,k).trim().toLowerCase();headers.set(name,(headers.has(name)?headers.get(name)+', ':'')+field.slice(k+1).trim());}}
 return {headers,body:bytes.subarray(start)};
}

/** Header parameter, including RFC 2231 (filename*=utf-8''...) and continuations. */
export function headerParam(value:string,name:string){
 const plain=value.match(new RegExp(`(?:^|;)\\s*${name}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*"|[^;]*)`,'i'));
 const ext=[...value.matchAll(new RegExp(`(?:^|;)\\s*${name}\\*(\\d+)?\\*?\\s*=\\s*("[^"]*"|[^;]*)`,'gi'))].sort((a,b)=>Number(a[1]||0)-Number(b[1]||0));
 if(ext.length){
  const joined=ext.map(m=>m[2].replace(/^"|"$/g,'')).join('');const match=joined.match(/^([^']*)'[^']*'(.*)$/);
  if(match){try{const bytes=Uint8Array.from(match[2].replace(/%([0-9A-F]{2})/gi,(_,h)=>String.fromCharCode(parseInt(h,16))),c=>c.charCodeAt(0));return new TextDecoder(match[1]||'utf-8').decode(bytes);}catch{/* Fall back to plain. */}}
  return joined;
 }
 if(!plain)return '';
 return decodeWords(plain[1].trim().replace(/^"|"$/g,'').replace(/\\(.)/g,'$1'));
}

function decodeTransfer(body:Uint8Array,encoding:string){
 const e=encoding.toLowerCase().trim();
 if(e==='base64'){const clean=binary(body).replace(/[^A-Za-z0-9+/=]/g,'');try{return Uint8Array.from(atob(clean.slice(0,clean.length-clean.length%4)),c=>c.charCodeAt(0));}catch{return new Uint8Array();}}
 if(e==='quoted-printable'){
  const s=binary(body).replace(/=\r?\n/g,'');const out:number[]=[];
  for(let i=0;i<s.length;i++){if(s[i]==='='&&/^[0-9A-Fa-f]{2}$/.test(s.slice(i+1,i+3))){out.push(parseInt(s.slice(i+1,i+3),16));i+=2;}else out.push(s.charCodeAt(i)&255);}
  return Uint8Array.from(out);
 }
 return body;
}

function text(bytes:Uint8Array,charset:string){try{return new TextDecoder(charset||'utf-8').decode(bytes);}catch{return new TextDecoder('utf-8').decode(bytes);}}
export function htmlToText(html:string){
 return html.replace(/<(script|style|head)[\s\S]*?<\/\1>/gi,'').replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi,'\n').replace(/<[^>]+>/g,'')
  .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
  .replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}

function boundarySplit(body:Uint8Array,boundary:string){
 const raw=binary(body),marker='--'+boundary,parts:Uint8Array[]=[];let pos=raw.indexOf(marker);
 while(pos>=0){
  const lineEnd=raw.indexOf('\n',pos);if(lineEnd<0||raw.startsWith(marker+'--',pos))break;
  const next=raw.indexOf('\n'+marker,lineEnd);const end=next<0?raw.length:next;
  parts.push(body.subarray(lineEnd+1,raw[end-1]==='\r'?end-1:end));pos=next<0?-1:next+1;
 }
 return parts;
}

export function parseMail(raw:Uint8Array):ParsedMail{
 const root=splitHead(raw),plain:string[]=[],html:string[]=[],attachments:MimeAttachment[]=[];let count=0;
 const walk=(part:Part,depth:number)=>{
  if(depth>MAX_DEPTH||++count>MAX_PARTS)return;
  const type=part.headers.get('content-type')||'text/plain',mime=type.split(';')[0].trim().toLowerCase();
  const disposition=part.headers.get('content-disposition')||'';
  if(mime.startsWith('multipart/')){const b=headerParam(type,'boundary');if(b)for(const p of boundarySplit(part.body,b))walk(splitHead(p),depth+1);return;}
  const body=decodeTransfer(part.body,part.headers.get('content-transfer-encoding')||'7bit');
  const filename=headerParam(disposition,'filename')||headerParam(type,'name');
  if(mime==='message/rfc822'&&!filename){walk(splitHead(body),depth+1);return;}
  if(filename||/^\s*attachment/i.test(disposition)){attachments.push({filename:(filename||'ek').replace(/[\\/\u0000-\u001f]/g,'_').slice(0,180),mime,bytes:body});return;}
  if(mime==='text/plain')plain.push(text(body,headerParam(type,'charset')));
  else if(mime==='text/html')html.push(htmlToText(text(body,headerParam(type,'charset'))));
 };
 walk(root,0);
 return {headers:root.headers,text:(plain.length?plain:html).join('\n\n').replace(/\r\n/g,'\n').trim(),attachments};
}

/** Keeps only the new part of a reply: drops quoted lines and the original message block. */
export function replyText(body:string){
 const lines=body.replace(/\r\n/g,'\n').split('\n'),kept:string[]=[];
 for(const line of lines){
  if(/^\s*>/.test(line))continue;
  if(/^\s*(-{2,}\s*(Original Message|Orijinal İleti|Özgün İleti)|_{5,})/i.test(line)||/^\s*(On|Am|Le)\s.+\b(wrote|schrieb|a écrit):\s*$/i.test(line)||/\btarihinde\b.*\byazdı:\s*$/i.test(line)||/^\s*(From|Kimden|Gönderen):\s.+/i.test(line)&&kept.length)break;
  kept.push(line);
 }
 return kept.join('\n').replace(/\n{3,}/g,'\n\n').trim();
}
