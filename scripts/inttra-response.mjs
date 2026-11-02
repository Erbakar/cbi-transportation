import JSON5 from 'json5';
export async function readInttraResponse(response,path){
 const type=response.headers.get('content-type')||'';
 const amendment=/^\/siact\/amend\?siId=\d{1,15}&originalSiId=\d{1,15}$/.test(path);
 if(!/\bjson\b/i.test(type)&&!(amendment&&/^text\/plain\b/i.test(type)))throw Error('Unexpected INTTRA response type');
 const charset=type.match(/charset\s*=\s*["']?([^;\s"']+)/i)?.[1]||'utf-8';
 if(!/^(utf-8|utf8|iso-8859-1|windows-1252)$/i.test(charset))throw Error('Unsupported INTTRA response encoding');
 const raw=new TextDecoder(charset,{fatal:true}).decode(await response.arrayBuffer());
 const data=path==='/siact/geographySi'?JSON5.parse(raw):JSON.parse(raw);
 if(amendment&&(!data?.ShipmentInstruction||typeof data.ShipmentInstruction!=='object'))throw Error('Invalid INTTRA amendment response');
 return data;
}
