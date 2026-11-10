/**
 * Minimal read-only IMAP4rev1 client for the automation mailbox.
 * Only EXAMINE (read-only select), UID SEARCH and UID FETCH with BODY.PEEK are
 * issued, so messages are never marked as read, moved, flagged or deleted.
 */
export type ImapConnection={readable:ReadableStream<Uint8Array>;writable:WritableStream<Uint8Array>;close?:()=>unknown};
export type ImapMailbox={uidValidity:number;uidNext:number;exists:number};
export type MailHeader={uid:number;size:number;internalDate:string;seen:boolean;attachments:number;messageId:string;fromName:string;fromAddress:string;to:string;cc:string;replyTo:string;subject:string;sentAt:string;inReplyTo:string;references:string;automated:boolean};
export type ImapErrorCode='auth_failed'|'protocol_error'|'connection_closed'|'timeout'|'command_failed';
export class ImapError extends Error{code:ImapErrorCode;constructor(code:ImapErrorCode,message?:string){super(message||code);this.code=code;}}
type Response={text:string;literals:Uint8Array[]};

const MAX_BUFFER=16*1024*1024,encoder=new TextEncoder(),latin=new TextDecoder('latin1');
const HEADER_FIELDS='FROM TO CC REPLY-TO SUBJECT DATE MESSAGE-ID IN-REPLY-TO REFERENCES AUTO-SUBMITTED PRECEDENCE LIST-ID X-AUTOREPLY X-AUTORESPOND';

class Reader{
 private buffer=new Uint8Array(0);private reader:ReadableStreamDefaultReader<Uint8Array>;
 constructor(stream:ReadableStream<Uint8Array>){this.reader=stream.getReader();}
 private async fill(){
  const {value,done}=await this.reader.read();if(done)throw new ImapError('connection_closed');
  if(this.buffer.length+value.length>MAX_BUFFER)throw new ImapError('protocol_error','IMAP response too large');
  const next=new Uint8Array(this.buffer.length+value.length);next.set(this.buffer);next.set(value,this.buffer.length);this.buffer=next;
 }
 async line(){
  for(;;){
   const end=this.buffer.findIndex((b,i)=>b===10&&this.buffer[i-1]===13);
   if(end>=0){const line=latin.decode(this.buffer.subarray(0,end-1));this.buffer=this.buffer.slice(end+1);return line;}
   await this.fill();
  }
 }
 async bytes(n:number){while(this.buffer.length<n)await this.fill();const out=this.buffer.slice(0,n);this.buffer=this.buffer.slice(n);return out;}
 cancel(){void this.reader.cancel().catch(()=>{});}
}

/** Reads one full server response, resolving `{n}` literals into byte arrays. */
async function readResponse(reader:Reader):Promise<Response>{
 let text='';const literals:Uint8Array[]=[];
 for(;;){
  const line=await reader.line(),literal=line.match(/\{(\d+)\+?\}$/);
  if(!literal){text+=line;return {text,literals};}
  const size=Number(literal[1]);if(size>MAX_BUFFER)throw new ImapError('protocol_error','IMAP literal too large');
  text+=line.slice(0,-literal[0].length)+'\u0000'+literals.length+'\u0000';literals.push(await reader.bytes(size));
 }
}

export function utf8Base64(value:string){let binary='';for(const b of encoder.encode(value))binary+=String.fromCharCode(b);return btoa(binary);}

export async function openImap(connection:ImapConnection,credentials:{user:string;password:string}){
 const reader=new Reader(connection.readable),writer=connection.writable.getWriter();let counter=0;
 const send=(line:string)=>writer.write(encoder.encode(line+'\r\n'));
 async function command(line:string,failure:ImapErrorCode='command_failed'){
  const tag='c'+(++counter);await send(tag+' '+line);const untagged:Response[]=[];
  for(;;){
   const response=await readResponse(reader);
   if(response.text.startsWith(tag+' ')){
    if(!/^\S+ OK/i.test(response.text))throw new ImapError(failure,response.text.slice(tag.length+1,200).replace(/\u0000\d+\u0000/g,''));
    return untagged;
   }
   if(response.text.startsWith('+'))throw new ImapError('protocol_error','Unexpected continuation');
   untagged.push(response);
  }
 }
 const greeting=await readResponse(reader);
 if(!/^\* (OK|PREAUTH)/i.test(greeting.text))throw new ImapError('protocol_error','Unexpected IMAP greeting');
 // SASL PLAIN with an initial response; the password never appears in any error text.
 await command('AUTHENTICATE PLAIN '+utf8Base64('\u0000'+credentials.user+'\u0000'+credentials.password),'auth_failed');
 return {
  async examine(mailbox='INBOX'):Promise<ImapMailbox>{
   const lines=await command('EXAMINE '+quote(mailbox));
   const find=(pattern:RegExp)=>Number(lines.map(l=>l.text.match(pattern)?.[1]).find(Boolean)||0);
   const uidValidity=find(/\[UIDVALIDITY (\d+)\]/i);if(!uidValidity)throw new ImapError('protocol_error','Missing UIDVALIDITY');
   return {uidValidity,uidNext:find(/\[UIDNEXT (\d+)\]/i),exists:find(/^\* (\d+) EXISTS/i)};
  },
  async search(criteria:string){
   const lines=await command('UID SEARCH '+criteria);
   return lines.flatMap(l=>/^\* SEARCH\b/i.test(l.text)?l.text.slice(8).trim().split(/\s+/).filter(Boolean).map(Number):[]).filter(n=>Number.isSafeInteger(n)&&n>0).sort((a,b)=>a-b);
  },
  async headers(uids:number[]):Promise<MailHeader[]>{
   if(!uids.length)return [];
   const lines=await command('UID FETCH '+uids.join(',')+' (UID RFC822.SIZE INTERNALDATE FLAGS BODYSTRUCTURE BODY.PEEK[HEADER.FIELDS ('+HEADER_FIELDS+')])');
   return lines.filter(l=>/^\* \d+ FETCH /i.test(l.text)).map(parseFetch).filter((m):m is MailHeader=>Boolean(m)).sort((a,b)=>a.uid-b.uid);
  },
  /** Whole raw message with BODY.PEEK (never sets \\Seen); refuses oversized mail before download. */
  async message(uid:number,maxBytes:number):Promise<Uint8Array|null>{
   const sizes=await command('UID FETCH '+uid+' (UID RFC822.SIZE)');
   const size=Number(sizes.map(l=>l.text.match(/RFC822\.SIZE (\d+)/i)?.[1]).find(Boolean)||0);
   if(!size)return null;if(size>maxBytes)throw new ImapError('command_failed','message_too_large');
   const lines=await command('UID FETCH '+uid+' (UID BODY.PEEK[])');
   for(const l of lines){const m=l.text.match(/BODY\[\] \u0000(\d+)\u0000/i);if(m&&Number(l.text.match(/\bUID (\d+)/i)?.[1])===uid)return l.literals[Number(m[1])];}
   return null;
  },
  async logout(){try{await command('LOGOUT');}catch{/* Server may close first. */}finally{reader.cancel();try{await writer.close();}catch{/* Already closed. */}}},
  abort(){reader.cancel();void writer.abort().catch(()=>{});},
 };
}

function quote(value:string){if(/[\r\n\u0000]/.test(value))throw new ImapError('protocol_error','Invalid mailbox name');return '"'+value.replace(/[\\"]/g,'\\$&')+'"';}

export function parseFetch(response:Response):MailHeader|null{
 const text=response.text,uid=Number(text.match(/\bUID (\d+)/i)?.[1]);
 if(!uid)return null;
 const literal=text.match(/BODY\[HEADER\.FIELDS [^\]]*\] \u0000(\d+)\u0000/i),raw=literal?decodeBytes(response.literals[Number(literal[1])],'utf-8'):'';
 const headers=parseHeaderBlock(raw),from=parseAddress(headers.get('from')||'');
 const structure=text.match(/BODYSTRUCTURE (\(.*)$/i)?.[1]||'';
 const date=headers.get('date')||'',sent=date?new Date(date.replace(/\s*\([^)]*\)\s*$/,'')):null;
 const internal=text.match(/INTERNALDATE "([^"]+)"/i)?.[1]||'';
 return {
  uid,size:Number(text.match(/RFC822\.SIZE (\d+)/i)?.[1]||0),internalDate:imapDate(internal),
  seen:/FLAGS \([^)]*\\Seen/i.test(text),attachments:Math.max((structure.match(/"attachment"/gi)||[]).length,(structure.match(/\("application" "/gi)||[]).length),
  messageId:clip(headers.get('message-id')||'',300),fromName:clip(from.name,200),fromAddress:clip(from.address,200),
  to:clip(headers.get('to')||'',1000),cc:clip(headers.get('cc')||'',1000),replyTo:clip(parseAddress(headers.get('reply-to')||'').address,200),subject:clip(headers.get('subject')||'',500),
  sentAt:sent&&!Number.isNaN(sent.getTime())?sent.toISOString():'',inReplyTo:clip(headers.get('in-reply-to')||'',300),references:clip(headers.get('references')||'',3000),
  automated:automatedMail(headers,from.address),
 };
}

/** RFC 3834 and common vendor markers: auto-replies, bounces and lists must never get an automatic answer. */
export function automatedMail(headers:Map<string,string>,from:string){
 const auto=(headers.get('auto-submitted')||'').toLowerCase();
 return Boolean(auto&&auto!=='no')||/^(bulk|junk|list|auto_reply)$/i.test(headers.get('precedence')||'')||headers.has('list-id')||headers.has('x-autoreply')||headers.has('x-autorespond')
  ||/^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounce[s]?)([+@.-]|$)/i.test(from)||/^(otomatik yanıt|automatic reply|auto(matic)?[- ]?reply|out of office|ofis dışında|undeliver|delivery status notification|returned mail)/i.test(headers.get('subject')||'');
}
const clip=(value:string,max:number)=>value.length>max?value.slice(0,max):value;
const MONTHS=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
/** IMAP INTERNALDATE: "09-Nov-2026 23:08:41 +0300" -> ISO string. */
export function imapDate(value:string){
 const m=value.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4}) (\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/);
 const month=m?MONTHS.indexOf(m[2].toLowerCase()):-1;if(!m||month<0)return '';
 const offset=(m[7]==='-'?-1:1)*(Number(m[8])*60+Number(m[9]));
 return new Date(Date.UTC(Number(m[3]),month,Number(m[1]),Number(m[4]),Number(m[5]),Number(m[6]))-offset*60000).toISOString();
}

export function parseHeaderBlock(raw:string){
 const headers=new Map<string,string>();
 for(const field of raw.replace(/\r?\n[ \t]+/g,' ').split(/\r?\n/)){
  const i=field.indexOf(':');if(i<=0)continue;const name=field.slice(0,i).trim().toLowerCase();
  if(!headers.has(name))headers.set(name,decodeWords(field.slice(i+1).trim()));
 }
 return headers;
}

export function parseAddress(value:string){
 const angle=value.match(/^\s*"?(.*?)"?\s*<([^>]+)>/);
 if(angle)return {name:angle[1].replace(/\\(.)/g,'$1').trim(),address:angle[2].trim().toLowerCase()};
 const bare=value.match(/[^\s<>,;"]+@[^\s<>,;"]+/)?.[0]||'';
 return {name:'',address:bare.toLowerCase()};
}

function decodeBytes(bytes:Uint8Array|undefined,charset:string){
 if(!bytes)return '';
 try{return new TextDecoder(charset.toLowerCase(),{fatal:charset.toLowerCase()==='utf-8'}).decode(bytes);}
 catch{try{return new TextDecoder('windows-1254').decode(bytes);}catch{return latin.decode(bytes);}}
}

/** RFC 2047 encoded words (B and Q), common for Turkish subjects and names. */
export function decodeWords(value:string){
 return value.replace(/(=\?[^?]+\?[BbQq]\?[^?]*\?=)\s+(?==\?)/g,'$1').replace(/=\?([^?*]+)(?:\*[^?]*)?\?([BbQq])\?([^?]*)\?=/g,(whole,charset:string,encoding:string,text:string)=>{
  try{
   let bytes:Uint8Array;
   if(encoding.toUpperCase()==='B'){const binary=atob(text);bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));}
   else{const s=text.replace(/_/g,' ');const out:number[]=[];for(let i=0;i<s.length;i++){if(s[i]==='='&&/^[0-9A-Fa-f]{2}$/.test(s.slice(i+1,i+3))){out.push(parseInt(s.slice(i+1,i+3),16));i+=2;}else out.push(s.charCodeAt(i));}bytes=Uint8Array.from(out);}
   return decodeBytes(bytes,charset);
  }catch{return whole;}
 });
}
