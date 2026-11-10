// In-memory SMTP submission server with STARTTLS; records the conversation, never uses the network.
export function fakeSmtp({password='secret',failAt='',rejectRecipient=''}={}){
 const log={commands:[],data:'',tls:false,closed:0};const enc=new TextEncoder(),dec=new TextDecoder();
 function socket(secure){
  let controller,pending='',inData=false;
  const readable=new ReadableStream({start(c){controller=c;}});
  const send=t=>controller.enqueue(enc.encode(t));
  const handle=line=>{
   if(inData){if(line==='.'){inData=false;if(failAt==='message-close'){controller.close();return;}send(failAt==='message'?'554 Rejected\r\n':'250 OK queued\r\n');}else log.data+=line+'\r\n';return;}
   log.commands.push(line.startsWith('AUTH PLAIN')?'AUTH PLAIN ***':line);
   if(line.startsWith('EHLO'))return send('250-mail.test\r\n'+(secure?'250-AUTH PLAIN LOGIN\r\n':'250-STARTTLS\r\n')+'250 HELP\r\n');
   if(line==='STARTTLS'){send('220 Ready to start TLS\r\n');return;}
   if(line.startsWith('AUTH PLAIN ')){const [,,pass]=atob(line.slice(11)).split('\u0000');return send(pass===password?'235 Authentication succeeded\r\n':'535 Incorrect authentication data\r\n');}
   if(line.startsWith('MAIL FROM'))return send('250 OK\r\n');
   if(line.startsWith('RCPT TO'))return send(rejectRecipient&&line.includes(rejectRecipient)?'550 No such user\r\n':'250 Accepted\r\n');
   if(line==='DATA'){inData=true;return send('354 Enter message\r\n');}
   if(line==='QUIT')return send('221 Bye\r\n');
   send('500 Unknown\r\n');
  };
  const writable=new WritableStream({write(b){pending+=dec.decode(b,{stream:true});let i;while((i=pending.indexOf('\r\n'))>=0){const l=pending.slice(0,i);pending=pending.slice(i+2);handle(l);}}});
  if(!secure)send('220 mail.test ESMTP\r\n');
  return {readable,writable,close(){log.closed++;},...(secure?{}:{startTls(){log.tls=true;return socket(true);}})};
 }
 return {socket:()=>socket(false),log};
}
