export function cleanSnapshot(value){
 if(!value||!['ready','login_required','unavailable'].includes(value.state))throw Error('Invalid browser state');
 if(value.state!=='ready')return {state:value.state,rows:[],total:null};
 if(!Array.isArray(value.rows)||value.rows.length>1000||!Number.isInteger(value.total)||value.total<0||value.total>100000)throw Error('Invalid list');
 const rows=value.rows.map(row=>{if(!Array.isArray(row)||row.length!==9||row.some(v=>typeof v!=='string'||v.length>250))throw Error('Invalid row');return row;});
 if(rows.length>value.total)throw Error('Invalid total');
 return {state:'ready',rows,total:value.total,complete:value.complete===true&&rows.length===value.total};
}
export function browserStatus(last,heartbeat,now=Date.now()){
 const extensionOnline=heartbeat>0&&now-heartbeat<90000;
 const fresh=last&&now-last.observedAt<120000;
 return {extensionOnline,connected:!!(extensionOnline&&fresh&&last.snapshot.state==='ready'),submissionEnabled:false,checkedAt:last?new Date(last.observedAt).toISOString():null,state:!extensionOnline?'extension_offline':!fresh?'not_checked':last.snapshot.state};
}
