/**
 * Minimal SMTP submission client (port 587, STARTTLS, AUTH PLAIN) and a
 * plain-text reply builder. Used only for the missing-information replies.
 */
import {utf8Base64} from './imap';

export type SmtpSocket={readable:ReadableStream<Uint8Array>;writable:WritableStream<Uint8Array>;close():unknown;startTls?:()=>SmtpSocket};
export class SmtpError extends Error{code:string;phase:'before_data'|'after_data';constructor(code:string,phase:'before_data'|'after_data',message?:string){super(message||code);this.code=code;this.phase=phase;}}
const encoder=new TextEncoder(),decoder=new TextDecoder();

class Lines{
 private buffer='';private reader:ReadableStreamDefaultReader<Uint8Array>;
 constructor(stream:ReadableStream<Uint8Array>){this.reader=stream.getReader();}
 async reply(phase:SmtpError['phase']){
  const lines:string[]=[];
  for(;;){
   let i=this.buffer.indexOf('\r\n');
   while(i<0){const {value,done}=await this.reader.read();if(done)throw new SmtpError('connection_closed',phase);this.buffer+=decoder.decode(value,{stream:true});if(this.buffer.length>65536)throw new SmtpError('protocol_error',phase);i=this.buffer.indexOf('\r\n');}
   const line=this.buffer.slice(0,i);this.buffer=this.buffer.slice(i+2);lines.push(line);
   if(!/^\d{3}-/.test(line))return {code:Number(line.slice(0,3)),lines};
  }
 }
 release(){try{this.reader.releaseLock();}catch{/* Already released. */}}
 cancel(){void this.reader.cancel().catch(()=>{});}
}

/** Sends one message. Errors carry the phase: after DATA the outcome is unknown and must not be retried. */
export async function sendSmtp(socket:SmtpSocket,options:{host:string;user:string;password:string;from:string;recipients:string[];data:string}){
 let current=socket,lines=new Lines(current.readable),writer=current.writable.getWriter();let phase:SmtpError['phase']='before_data';
 const write=(s:string)=>writer.write(encoder.encode(s));
 const expect=async(code:number,step:string)=>{const r=await lines.reply(phase);if(r.code!==code)throw new SmtpError(step==='auth'&&r.code===535?'auth_failed':step+'_rejected',phase,r.lines.join(' ').slice(0,200));return r;};
 const ehlo=async()=>{await write('EHLO cbi-transportation.workers.dev\r\n');return (await expect(250,'ehlo')).lines.map(l=>l.slice(4).toUpperCase());};
 try{
  await expect(220,'greeting');
  let caps=await ehlo();
  if(current.startTls){
   if(!caps.includes('STARTTLS'))throw new SmtpError('starttls_unavailable',phase);
   await write('STARTTLS\r\n');await expect(220,'starttls');
   writer.releaseLock();lines.release();current=current.startTls();lines=new Lines(current.readable);writer=current.writable.getWriter();
   caps=await ehlo();
  }
  if(!caps.some(c=>/^AUTH\b.*\bPLAIN\b/.test(c)))throw new SmtpError('auth_unavailable',phase);
  await write('AUTH PLAIN '+utf8Base64('\u0000'+options.user+'\u0000'+options.password)+'\r\n');await expect(235,'auth');
  await write('MAIL FROM:<'+options.from+'>\r\n');await expect(250,'mail_from');
  for(const r of options.recipients){await write('RCPT TO:<'+r+'>\r\n');const reply=await lines.reply(phase);if(reply.code!==250&&reply.code!==251)throw new SmtpError('recipient_rejected',phase,reply.lines.join(' ').slice(0,200));}
  await write('DATA\r\n');await expect(354,'data');
  phase='after_data';
  // Dot-stuffing (RFC 5321 4.5.2) and a single terminating dot.
  await write(options.data.replace(/\r?\n/g,'\r\n').replace(/^\./gm,'..')+'\r\n.\r\n');await expect(250,'message');
  try{await write('QUIT\r\n');await lines.reply(phase);}catch{/* Delivered already. */}
 }finally{lines.cancel();try{writer.releaseLock();}catch{/* Released. */}try{current.close();}catch{/* Closed. */}}
}

export const validAddress=(value:string)=>/^[^\s@<>(),;:"[\]\\]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(value)&&value.length<=254;
function headerWord(value:string){return /^[\x20-\x7e]*$/.test(value)?value:'=?UTF-8?B?'+utf8Base64(value)+'?=';}
function wrap(base64:string){return base64.replace(/.{1,76}/g,'$&\r\n').trimEnd();}

/** RFC 5322 plain-text reply; Auto-Submitted marks it so well-behaved responders do not answer it. */
export function buildReply(o:{from:string;fromName:string;to:string[];cc:string[];subject:string;messageId:string;inReplyTo:string;references:string[];text:string;date?:Date}){
 const headers=[
  'From: '+headerWord(o.fromName)+' <'+o.from+'>','To: '+o.to.join(', '),...(o.cc.length?['Cc: '+o.cc.join(', ')]:[]),
  'Subject: '+headerWord(o.subject),'Date: '+(o.date||new Date()).toUTCString().replace('GMT','+0000'),'Message-ID: '+o.messageId,
  ...(o.inReplyTo?['In-Reply-To: '+o.inReplyTo]:[]),...(o.references.length?['References: '+o.references.slice(-20).join(' ')]:[]),
  'Auto-Submitted: auto-replied','X-Auto-Response-Suppress: All','MIME-Version: 1.0','Content-Type: text/plain; charset=utf-8','Content-Transfer-Encoding: base64',
 ];
 if(headers.some(h=>/[\r\n]/.test(h)))throw new Error('Invalid header');
 return headers.join('\r\n')+'\r\n\r\n'+wrap(utf8Base64(o.text.replace(/\r?\n/g,'\r\n')))+'\r\n';
}
