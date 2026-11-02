import {connect} from 'cloudflare:sockets';
import {Buffer} from 'node:buffer';

export type TmaxxTransportProgress={stage:string;bodyBytes:number;requestBytes:number;writtenBytes:number;responseBytes:number;elapsedMs:number;status?:number};

// Read a complete HTTP message, not just until TCP closes. A server may reject an
// upload before consuming its body, then reset the connection with bytes unread.
async function readResponse(socket:ReturnType<typeof connect>,limit:number,progress:TmaxxTransportProgress,method:string){
 const reader=socket.readable.getReader(),chunks:Buffer[]=[];
 let pending=Buffer.alloc(0),mode='headers',remaining=0,status=0,headers=new Headers(),interim=0;
 const finish=()=>{headers.delete('transfer-encoding');headers.delete('content-length');return new Response(method==='HEAD'||[204,304].includes(status)?null:Buffer.concat(chunks),{status,headers});};
 try{
  while(true){
   if(mode==='headers'){
    const split=pending.indexOf('\r\n\r\n');
    if(split>=0){
     const lines=pending.subarray(0,split).toString('latin1').split('\r\n');
     status=Number(lines.shift()?.match(/^HTTP\/1\.[01] (\d{3})(?: |$)/)?.[1]);
     if(status<100||status>599||!status)throw new Error('Invalid ERP status');
     headers=new Headers();for(const line of lines){const colon=line.indexOf(':');if(colon<=0)throw new Error('Invalid ERP header');headers.append(line.slice(0,colon),line.slice(colon+1).trim());}
     pending=pending.subarray(split+4);
     if(status<200){if(status===101||++interim>8)throw new Error('Invalid ERP interim response');continue;}
     progress.status=status;
     if(method==='HEAD'||[204,304].includes(status))return finish();
     const encoding=headers.get('transfer-encoding'),length=headers.get('content-length');
     if(encoding){if(encoding.toLowerCase()!=='chunked')throw new Error('Invalid ERP transfer encoding');mode='chunk-size';}
     else if(length!==null){if(!/^\d+$/.test(length)||!Number.isSafeInteger(Number(length)))throw new Error('Invalid ERP content length');remaining=Number(length);if(remaining>limit)throw new Error('ERP response too large');mode='length';}
     else mode='eof';
     continue;
    }
   }else if(mode==='length'||mode==='chunk-body'){
    const count=Math.min(remaining,pending.length);if(count){chunks.push(pending.subarray(0,count));pending=pending.subarray(count);remaining-=count;}
    if(!remaining){if(mode==='length')return finish();mode='chunk-end';continue;}
   }else if(mode==='chunk-size'){
    const end=pending.indexOf('\r\n');
    if(end>=0){const hex=pending.subarray(0,end).toString('ascii').split(';')[0];if(!/^[0-9a-f]+$/i.test(hex))throw new Error('Invalid ERP chunk');remaining=parseInt(hex,16);if(!Number.isSafeInteger(remaining)||remaining>limit)throw new Error('ERP response too large');pending=pending.subarray(end+2);mode=remaining?'chunk-body':'trailers';continue;}
   }else if(mode==='chunk-end'){
    if(pending.length>=2){if(pending.subarray(0,2).toString()!=='\r\n')throw new Error('Invalid ERP chunk');pending=pending.subarray(2);mode='chunk-size';continue;}
   }else if(mode==='trailers'){
    // Ignore trailer values, but require their terminating blank line.
    const end=pending.indexOf('\r\n');if(end>=0){if(!end)return finish();pending=pending.subarray(end+2);continue;}
   }else if(pending.length){chunks.push(pending);pending=Buffer.alloc(0);}
   const {value,done}=await reader.read();
   if(done){if(mode==='eof')return finish();throw new Error('Incomplete ERP response');}
   progress.responseBytes+=value.length;if(progress.responseBytes>limit)throw new Error('ERP response too large');
   pending=pending.length?Buffer.concat([pending,Buffer.from(value)]):Buffer.from(value);
  }
 }finally{reader.releaseLock();}
}

// Only the explicitly configured legacy ERP endpoint may use plain TCP.
export async function tmaxxRequest(endpoint:string,options:RequestInit,trace?:TmaxxTransportProgress):Promise<Response>{
 const u=new URL(endpoint);if(u.origin!=='http://95.216.243.19:8090')throw new Error('Unsupported platform address');
 const started=Date.now(),progress=trace||{stage:'connect',bodyBytes:0,requestBytes:0,writtenBytes:0,responseBytes:0,elapsedMs:0};
 Object.assign(progress,{stage:'connect',bodyBytes:0,requestBytes:0,writtenBytes:0,responseBytes:0,elapsedMs:0});delete progress.status;
 const archive=/^\/api\/+uploader\//.test(u.pathname);
 // Archive upload/file responses contain base64; keep the ordinary ERP cap.
 const archiveFile=/^\/api\/+uploader\/(?:upload\/?|getByID\/[^/]+)$/.test(u.pathname),limit=(archiveFile?16:8)*1024*1024;
 let socket:ReturnType<typeof connect>|undefined,timer:ReturnType<typeof setTimeout>|undefined;
 const close=()=>{void socket?.close().catch(()=>{});};
 try{
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{close();reject(new Error('ERP request timed out'));},archive?40000:25000);});
  return await Promise.race([deadline,(async()=>{
   socket=connect({hostname:u.hostname,port:8090},{allowHalfOpen:false,secureTransport:'off'});
   void socket.closed.catch(()=>{});
   await socket.opened;progress.stage='encode-request';
   const body=typeof options.body==='string'?Buffer.from(options.body):options.body instanceof ArrayBuffer?Buffer.from(options.body):ArrayBuffer.isView(options.body)?Buffer.from(options.body.buffer,options.body.byteOffset,options.body.byteLength):Buffer.alloc(0);
   if(options.body!=null&&typeof options.body!=='string'&&!(options.body instanceof ArrayBuffer)&&!ArrayBuffer.isView(options.body))throw new Error('Unsupported ERP request body');
   const headers=new Headers(options.headers);headers.set('Host',u.host);headers.set('Connection','close');headers.set('Accept-Encoding','identity');headers.set('Content-Length',String(body.length));
   const method=options.method||'GET',request=`${method} ${u.pathname+u.search} HTTP/1.1\r\n`+Array.from(headers).map(([k,v])=>`${k}: ${v}\r\n`).join('')+'\r\n';
   const encoded=Buffer.concat([Buffer.from(request),body]);progress.bodyBytes=body.length;progress.requestBytes=encoded.length;progress.stage='write-request';
   let rejected=false;
   // Read while writing: otherwise an early HTTP rejection is lost when a large
   // write throws. Neither a socket failure nor a partial response is retried.
   const reading=readResponse(socket,limit,progress,method).then(response=>{if(!response.ok){rejected=true;close();}return {response};},error=>{close();return {error};});
   const writing=(async()=>{const writer=socket!.writable.getWriter();try{for(let offset=0;offset<encoded.length&&!rejected;offset+=64*1024){const bytes=encoded.subarray(offset,offset+64*1024);await writer.write(bytes);progress.writtenBytes+=bytes.length;}return {error:undefined};}catch(error){return {error};}finally{writer.releaseLock();}})();
   const sent=await writing;progress.stage=sent.error?'write-request':'read-response';
   const received=await reading;
   if('response' in received&&(!received.response.ok||progress.writtenBytes===encoded.length)){progress.stage='complete';progress.elapsedMs=Date.now()-started;return received.response;}
   if('error' in received){if(sent.error&&!progress.responseBytes)throw sent.error;progress.stage='read-response';throw received.error;}
   if(sent.error)throw sent.error;
   throw new Error('Incomplete ERP request');
  })()]);
 }catch(error){progress.elapsedMs=Date.now()-started;const failure=error instanceof Error?error:new Error('ERP transport failed');throw Object.assign(failure,{transport:{...progress}});}
 finally{if(timer)clearTimeout(timer);close();}
}
