// Isolated read-only search. Never accepts a caller-supplied URL or SI payload.
export function historyCriteria(from,to){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(to))||Date.parse(to)<Date.parse(from)||Date.parse(to)-Date.parse(from)>31*86400000)throw Error('Invalid history range');
 return {searchcriteria:{dtTimeOffset:'',dtTime:'',selSelectBy:'',txtFrom:from,txtTo:to,carrierselect:'',vessel:'',selVoyage:'',siRequestor:'',partner:'',companyName:'',txtSearchby:'',selNumOfRows:'25',fromLocationId:'',toLocationId:'',fromLocation:'',toLocation:'',page:'0'}};
}
export async function readInttraHistory({cookie,from,to},request=fetch){
 if(typeof cookie!=='string'||!cookie||cookie.length>65536||/[\r\n]/.test(cookie))throw Error('Invalid session');
 const body=encodeURIComponent(JSON.stringify(historyCriteria(from,to)));
 const r=await request('https://ship.inttra.e2open.com/siact/submitSearch',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json;charset=UTF-8',Origin:'https://ship.inttra.e2open.com',Referer:'https://ship.inttra.e2open.com/siact/searchSi'},body,redirect:'manual',signal:AbortSignal.timeout(25000)});
 if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw Error('History unavailable');
 const rows=await r.json();if(!Array.isArray(rows)||rows.length>1000)throw Error('Invalid history response');
 return {rows,complete:rows.length<100&&rows.every(r=>Number(r.totalRecordCount)<=rows.length)};
}
