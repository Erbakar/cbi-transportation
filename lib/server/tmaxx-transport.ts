import {connect} from 'cloudflare:sockets';
import {Buffer} from 'node:buffer';
// Only the explicitly configured legacy ERP endpoint may use plain TCP.
export async function tmaxxRequest(endpoint:string,options:RequestInit):Promise<Response>{
 const u=new URL(endpoint);if(u.origin!=='http://95.216.243.19:8090')throw new Error('Unsupported platform address');
 const socket=connect({hostname:u.hostname,port:8090},{allowHalfOpen:false,secureTransport:'off'});
 const timeout=setTimeout(()=>{void socket.close().catch(()=>{})},25000);
 try{
  await socket.opened;const body=typeof options.body==='string'?options.body:'';
  const headers=new Headers(options.headers);headers.set('Host',u.host);headers.set('Connection','close');headers.set('Accept-Encoding','identity');headers.set('Content-Length',String(Buffer.byteLength(body)));
  const request=`${options.method||'GET'} ${u.pathname+u.search} HTTP/1.1\r\n`+Array.from(headers).map(([k,v])=>`${k}: ${v}\r\n`).join('')+'\r\n'+body;
  const writer=socket.writable.getWriter();await writer.write(Buffer.from(request));writer.releaseLock();
  const reader=socket.readable.getReader();const chunks:Buffer[]=[];let size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>8*1024*1024)throw new Error('ERP response too large');chunks.push(Buffer.from(value))}
  const raw=Buffer.concat(chunks);const split=raw.indexOf('\r\n\r\n');if(split<0)throw new Error('Incomplete ERP response');
  const lines=raw.subarray(0,split).toString('latin1').split('\r\n');const status=Number(lines.shift()?.match(/^HTTP\/1\.[01] (\d{3}) /)?.[1]);if(!status)throw new Error('Invalid ERP status');
  const resultHeaders=new Headers();for(const line of lines){const colon=line.indexOf(':');if(colon>0)resultHeaders.append(line.slice(0,colon),line.slice(colon+1).trim())}
  let data=raw.subarray(split+4);
  if(resultHeaders.get('transfer-encoding')?.toLowerCase()==='chunked'){
   const decoded:Buffer[]=[];let p=0;while(true){const e=data.indexOf('\r\n',p);if(e<0)throw new Error('Incomplete ERP chunk');const hex=data.subarray(p,e).toString().split(';')[0];if(!/^[0-9a-f]+$/i.test(hex))throw new Error('Invalid ERP chunk');const n=parseInt(hex,16);p=e+2;if(!n)break;if(p+n+2>data.length||data.subarray(p+n,p+n+2).toString()!=='\r\n')throw new Error('Incomplete ERP chunk');decoded.push(data.subarray(p,p+n));p+=n+2}data=Buffer.concat(decoded);
  }else if(resultHeaders.has('content-length')&&Number(resultHeaders.get('content-length'))!==data.length)throw new Error('Incomplete ERP body');
  resultHeaders.delete('transfer-encoding');resultHeaders.delete('content-length');return new Response([204,304].includes(status)?null:data,{status,headers:resultHeaders});
 }finally{clearTimeout(timeout);await socket.close().catch(()=>{})}
}
