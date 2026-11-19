// T-MAXX pass-through for the platform gateway (VDS). The ERP address is fixed here:
// callers choose only method, path, headers and body, never the host.
import http from 'node:http';

export const TMAXX_ORIGIN={hostname:'95.216.243.19',port:8090};
const METHODS=new Set(['GET','HEAD','POST','PUT','DELETE','PATCH']);
const DROP=new Set(['host','connection','content-length','transfer-encoding','accept-encoding','keep-alive','upgrade','proxy-authorization','proxy-connection','te','trailer']);
const REQUEST_LIMIT=40*1024*1024,RESPONSE_LIMIT=16*1024*1024;

export class TmaxxGatewayError extends Error{constructor(message,status,forwarded){super(message);this.status=status;this.forwarded=forwarded;}}

/** Validates the caller's description of the ERP request. Throws before anything is sent. */
export function tmaxxTarget(headers){
 const method=String(headers['x-tmaxx-method']||'').toUpperCase(),path=String(headers['x-tmaxx-path']||'');
 if(!METHODS.has(method))throw new TmaxxGatewayError('Invalid method',400,false);
 if(!/^\/[\x21-\x7e]{0,4095}$/.test(path)||path.includes('#'))throw new TmaxxGatewayError('Invalid path',400,false);
 let forwarded={};
 if(headers['x-tmaxx-headers']){
  try{forwarded=JSON.parse(Buffer.from(String(headers['x-tmaxx-headers']),'base64').toString('utf8'));}catch{throw new TmaxxGatewayError('Invalid headers',400,false);}
  if(!forwarded||typeof forwarded!=='object'||Array.isArray(forwarded))throw new TmaxxGatewayError('Invalid headers',400,false);
 }
 const out={};
 for(const [name,value] of Object.entries(forwarded)){
  if(typeof value!=='string'||!/^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,128}$/.test(name)||/[\r\n\0]/.test(value)||value.length>16384)throw new TmaxxGatewayError('Invalid headers',400,false);
  if(!DROP.has(name.toLowerCase()))out[name]=value;
 }
 const timeout=/^\/api\/+uploader\//.test(path)?40000:25000;
 return {method,path,headers:out,timeout};
}

async function readBody(req){
 const chunks=[];let size=0;
 for await(const chunk of req){size+=chunk.length;if(size>REQUEST_LIMIT)throw new TmaxxGatewayError('Request too large',413,false);chunks.push(chunk);}
 return Buffer.concat(chunks);
}

/** Sends one request to T-MAXX. `forwarded` on an error says whether any byte may have reached it. */
export function sendToTmaxx(target,body,origin=TMAXX_ORIGIN){
 return new Promise((resolve,reject)=>{
  let wrote=false,settled=false;
  const fail=(message,status)=>{if(!settled){settled=true;reject(new TmaxxGatewayError(message,status,wrote));}};
  const request=http.request({...origin,method:target.method,path:target.path,headers:{...target.headers,Host:origin.hostname+':'+origin.port,Connection:'close','Accept-Encoding':'identity','Content-Length':String(body.length)},timeout:target.timeout},response=>{
   const chunks=[];let size=0;
   response.on('data',chunk=>{size+=chunk.length;if(size>RESPONSE_LIMIT){request.destroy();fail('ERP response too large',502);return;}chunks.push(chunk);});
   response.on('end',()=>{if(!settled){settled=true;resolve({status:response.statusCode||502,headers:response.headers,body:Buffer.concat(chunks)});}});
   response.on('error',()=>fail('ERP response failed',502));
  });
  request.on('socket',socket=>socket.on('connect',()=>{wrote=true;}));
  request.on('timeout',()=>{request.destroy();fail('ERP request timed out',504);});
  request.on('error',()=>fail('ERP connection failed',502));
  request.end(body);
 });
}

const PASS=new Set(['content-type','content-disposition','set-cookie','location','cache-control','last-modified','etag','x-content-type-options']);
/** Handles POST /tmaxx. Every T-MAXX answer carries `X-CBI-Gateway: tmaxx`; anything else did not come from T-MAXX. */
export async function handleTmaxx(req,res,origin=TMAXX_ORIGIN){
 try{
  const target=tmaxxTarget(req.headers);const body=await readBody(req);
  const answer=await sendToTmaxx(target,body,origin);
  const headers={'X-CBI-Gateway':'tmaxx','Content-Length':String(answer.body.length)};
  for(const [name,value] of Object.entries(answer.headers))if(PASS.has(name)&&value!==undefined)headers[name]=value;
  res.writeHead(answer.status,headers);res.end(target.method==='HEAD'?undefined:answer.body);
 }catch(error){
  const known=error instanceof TmaxxGatewayError;
  if(!known||error.forwarded)console.warn('T-MAXX gateway: '+(known?error.message:'unexpected failure'));
  if(res.headersSent){res.destroy();return;}
  // Only a failure after the connection opened is reported as "maybe forwarded"; callers must not resend writes then.
  res.writeHead(known?error.status:502,{'Content-Type':'application/json','X-CBI-Gateway':'tmaxx-error','X-CBI-Forwarded':known&&!error.forwarded?'no':'maybe'});
  res.end(JSON.stringify({error:'T-MAXX bağlantısı tamamlanamadı.'}));
 }
}
