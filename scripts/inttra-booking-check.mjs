// Read-only Booking 3.0 lookup used when the legacy SI review returns 10136.
// Both destinations and request shapes come from INTTRA's booking application.
const base='https://api.inttra.e2open.com';
const key=value=>typeof value==='string'?value.trim().toUpperCase():'';
const sameSet=(a,b)=>a.length===b.length&&new Set(a).size===a.length&&[...a].sort().every((v,i)=>v===[...b].sort()[i]);
const id=value=>typeof value==='string'&&/^\d{1,15}$/.test(value);
const reference=value=>typeof value==='string'&&/^[A-Z0-9][A-Z0-9._/-]{0,99}$/i.test(value);
const unverified=reason=>({status:'unverified',reason});

async function json(response){
 if(!response.ok)throw Error('Booking lookup unavailable');
 const reader=response.body?.getReader();if(!reader)throw Error('Missing booking response');
 const chunks=[];let size=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>4*1024*1024)throw Error('Booking response limit');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function checkInttraBooking(input,request=fetch){
 const {token,bookingNumber,carrierId,companyId,blReference,containerNumbers}=input||{};
 if(typeof token!=='string'||!token||token.length>16384||/[\r\n]/.test(token))throw Error('Invalid booking session');
 if(!reference(bookingNumber)||!reference(blReference)||!id(carrierId)||!id(companyId)||!Array.isArray(containerNumbers)||!containerNumbers.length||containerNumbers.length>200||containerNumbers.some(n=>typeof n!=='string'||!/^[A-Z]{4}\d{7}$/i.test(n)))return unverified('unsupported-input');
 const headers={'Content-Type':'application/json',Cookie:'TOKEN='+encodeURIComponent(token)};
 // One budget covers both requests; a slow secondary check never delays forever.
 const signal=AbortSignal.timeout(25000);
 const search=await json(await request(base+'/booking/search/simple',{method:'POST',headers,body:JSON.stringify({from:0,size:50,query:bookingNumber,sort:[]}),redirect:'manual',signal}));
 if(!Array.isArray(search?.results)||!Number.isSafeInteger(search.total)||search.total!==search.results.length)return unverified('incomplete-search');
 const matches=search.results.filter(row=>key(row.carrierReferenceNumber)===key(bookingNumber)&&row.carrierId===carrierId);
 if(matches.length!==1)return unverified('no-unique-match');
 const match=matches[0];
 if(match.state!=='Confirmed'||!id(match.inttraReferenceNumber)||!Array.isArray(match.companyIds)||!match.companyIds.includes(companyId))return unverified('not-confirmed-for-company');
 const versions=await json(await request(base+'/booking/'+match.inttraReferenceNumber,{method:'GET',headers,redirect:'manual',signal}));
 if(!Array.isArray(versions)||!versions.length||versions.length>1000)return unverified('invalid-detail');
 // EDI confirmations can all have version=1. Use the audit timestamp, not version.
 const dated=versions.map(row=>({row,time:Date.parse(row.audit?.lastModifiedDateUtc||row.audit?.createdDateUtc)}));
 if(dated.some(v=>!Number.isFinite(v.time)))return unverified('unknown-version-order');
 dated.sort((a,b)=>b.time-a.time);
 if(dated.length>1&&dated[0].time===dated[1].time)return unverified('ambiguous-latest-version');
 const latest=dated[0].row,p=latest.payload;
 if(latest.inttraReferenceNumber!==match.inttraReferenceNumber||latest.carrierId!==carrierId||key(latest.carrierReferenceNumber)!==key(bookingNumber)||latest.state!=='CONFIRM'||latest.payloadType!=='ConfirmPending'||p?.bookingState!=='CONFIRM'||p.bookingResponseType!=='Accepted')return unverified('detail-not-confirmed');
 if(![latest.bookerId,latest.shipperId,latest.forwarderId].includes(companyId))return unverified('company-mismatch');
 const refs=Array.isArray(p.references)?p.references:[];
 const bookingRefs=refs.filter(r=>r.referenceType==='BookingNumber').map(r=>key(r.referenceValue));
 if(!bookingRefs.length||bookingRefs.some(v=>v!==key(bookingNumber))||!refs.some(r=>r.referenceType==='BillOfLadingNumber'&&key(r.referenceValue)===key(blReference)))return unverified('reference-mismatch');
 const containers=Array.isArray(p.equipments)?p.equipments.map(e=>key(e.identifierValue)):[];
 if(!sameSet(containers,containerNumbers.map(key)))return unverified('container-mismatch');
 return {status:'verified',source:'inttra-booking',bookingNumber,carrierId,companyId,blReference,containerNumbers,inttraReference:match.inttraReferenceNumber,confirmedAt:new Date(dated[0].time).toISOString(),checkedAt:new Date().toISOString()};
}
