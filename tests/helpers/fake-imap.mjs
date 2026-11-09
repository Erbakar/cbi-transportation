// In-memory IMAP server for tests. Records every client command; never touches the network.
export function fakeImap({messages=[],uidValidity=7,password='secret',greeting='* OK Dovecot ready.',chunk=0}={}){
 const commands=[];let controller;const enc=new TextEncoder(),dec=new TextDecoder();let pending='';
 const readable=new ReadableStream({start(c){controller=c;}});
 const send=text=>{const bytes=enc.encode(text);if(!chunk){controller.enqueue(bytes);return;}for(let i=0;i<bytes.length;i+=chunk)controller.enqueue(bytes.slice(i,i+chunk));};
 const uidNext=Math.max(0,...messages.map(m=>m.uid))+1;
 function respond(line){
  const [tag,...rest]=line.split(' '),cmd=rest.join(' ');commands.push(cmd);
  if(/^AUTHENTICATE PLAIN /.test(cmd)){const [,user,pass]=atob(cmd.slice(19)).split('\u0000');return send(pass===password?`${tag} OK Logged in as ${user}\r\n`:`${tag} NO [AUTHENTICATIONFAILED] Authentication failed.\r\n`);}
  if(/^EXAMINE /.test(cmd))return send(`* ${messages.length} EXISTS\r\n* OK [UIDVALIDITY ${uidValidity}] UIDs valid\r\n* OK [UIDNEXT ${uidNext}] Predicted next UID\r\n${tag} OK [READ-ONLY] Examine completed.\r\n`);
  if(/^UID SEARCH UID (\d+):\*$/.test(cmd)){const from=Number(cmd.match(/(\d+):/)[1]);const hits=messages.filter(m=>m.uid>=from).map(m=>m.uid);if(!hits.length&&messages.length)hits.push(Math.max(...messages.map(m=>m.uid)));return send(`* SEARCH${hits.map(u=>' '+u).join('')}\r\n${tag} OK Search completed.\r\n`);}
  if(/^UID SEARCH SINCE /.test(cmd))return send(`* SEARCH${messages.filter(m=>!m.old).map(m=>' '+m.uid).join('')}\r\n${tag} OK Search completed.\r\n`);
  if(/^UID FETCH /.test(cmd)){
   const uids=cmd.match(/^UID FETCH ([\d,]+) /)[1].split(',').map(Number);let out='';
   messages.filter(m=>uids.includes(m.uid)).forEach((m,i)=>{const header=enc.encode(m.header);out+=`* ${i+1} FETCH (UID ${m.uid} RFC822.SIZE ${m.size||1000} INTERNALDATE "${m.internal||'09-Nov-2026 10:15:00 +0300'}" FLAGS (${m.flags||''}) BODYSTRUCTURE ${m.structure||'("text" "plain" ("charset" "utf-8") NIL NIL "7bit" 10 1 NIL NIL NIL NIL)'} BODY[HEADER.FIELDS (FROM TO CC SUBJECT DATE MESSAGE-ID IN-REPLY-TO)] {${header.length}}\r\n${m.header})\r\n`;});
   return send(out+`${tag} OK Fetch completed.\r\n`);
  }
  if(cmd==='LOGOUT'){send(`* BYE Logging out\r\n${tag} OK Logout completed.\r\n`);return;}
  send(`${tag} BAD Unknown command\r\n`);
 }
 const writable=new WritableStream({write(bytes){pending+=dec.decode(bytes,{stream:true});let i;while((i=pending.indexOf('\r\n'))>=0){const line=pending.slice(0,i);pending=pending.slice(i+2);respond(line);}}});
 send(greeting+'\r\n');
 let closed=false;
 return {readable,writable,commands,close(){closed=true;},get closed(){return closed;}};
}
export const header=({from='Ali Veli <ali@example.com>',subject='Test',id='<1@example.com>',to='automation@cbitransport.com.tr',date='Mon, 09 Nov 2026 10:14:00 +0300'}={})=>`From: ${from}\r\nTo: ${to}\r\nSubject: ${subject}\r\nDate: ${date}\r\nMessage-ID: ${id}\r\n\r\n`;
