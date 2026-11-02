// Local-only import. Secrets and cookies must never be printed or persisted in logs.
import fs from 'node:fs';
const base='http://localhost:5174';
function readAccount(file){const text=fs.readFileSync(file,'utf8');const field=name=>text.split(/\r?\n/).find(line=>line.startsWith(name+':'))?.slice(name.length+1).trim();const username=field('Kullanıcı adı'),password=field('Şifre');if(!username||!password)throw Error('Required account fields are missing.');return {username,password};}
const file='.private/cma-cgm-giris-bilgileri.txt';
let cookie='';
async function call(path,method='GET',body){return fetch(base+path,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{Origin:base,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});}
try{
 const account=readAccount(file);
 const r=await call('/api/session','POST',readAccount('.private/ilk-giris.txt'));
 if(!r.ok)throw Error('Local application login failed.');
 cookie=r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
 const saved=await call('/api/carriers/cma-cgm','PUT',account);
 if(!saved.ok)throw Error('Encrypted account storage failed.');
 const status=await (await call('/api/carriers/cma-cgm')).json();
 if(status.credentialsSaved!==true)throw Error('Stored account could not be verified.');
 console.log(JSON.stringify({credentialsSaved:true,connected:status.connected,submissionEnabled:status.submissionEnabled}));
 const probe=await call('/api/carriers/cma-cgm','POST');
 console.log(JSON.stringify({probeStatus:probe.status,...await probe.json()}));
 for(const path of ['/api/records','/api/bookings']){const r=await call(path);console.log(JSON.stringify({path,status:r.status}));await r.body?.cancel();}
 // Keep the input until encrypted values have been independently verified.
}catch{console.error('CMA local import could not finish; private input retained.');process.exitCode=1;}
finally{if(cookie){const r=await call('/api/session','DELETE');console.log(JSON.stringify({logout:r.ok}));}}
