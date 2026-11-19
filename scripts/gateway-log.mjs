// Request log line for the platform gateway (journald). Only fixed endpoint names, the T-MAXX
// method and path without its query, the status and the duration are written.
const ENDPOINTS=new Set(['/health','/auth','/request','/document','/vgm-access','/history','/pdf-pages','/booking-check','/tmaxx','/msc/login']);
export function requestLogLine(req,status,ms,finished=true){
 const endpoint=ENDPOINTS.has(req.url)?req.url:'other';
 let detail='';
 if(endpoint==='/tmaxx'){
  const method=String(req.headers['x-tmaxx-method']||'').toUpperCase().replace(/[^A-Z]/g,'').slice(0,7);
  const path=String(req.headers['x-tmaxx-path']||'').split('?')[0].replace(/[^\x21-\x7e]/g,'').slice(0,120);
  detail=' '+(method||'-')+' '+(path||'-');
 }
 return `${req.method} ${endpoint}${detail} ${status}${finished?'':' aborted'} ${ms}ms`;
}
