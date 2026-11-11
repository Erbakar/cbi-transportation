'use client';
import {OperationToast} from '@/components/operation-toast';
import {userMessage} from '@/lib/user-message';
import {useEffect,useRef,useState} from 'react';
import {useUnsavedWork} from '@/hooks/use-unsaved-work';
import type {MscState} from '@/lib/server/msc-connection';

/** myMSC account form and server-side sign-in check; nothing is submitted to MSC here. */
export function MscConnection({onChange}:{onChange?:()=>void}){
 const [state,setState]=useState<MscState|null>(null),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[open,setOpen]=useState(false);
 const inFlight=useRef(false);
 useUnsavedWork(busy||!!username||!!password);
 useEffect(()=>{let active=true;fetch('/api/carriers/msc',{cache:'no-store'}).then(async r=>{const d=await r.json() as MscState&{error?:string};if(!r.ok)throw Error(d.error||'Hesap durumu alınamadı.');if(active)setState(d);}).catch(()=>{if(active)setError('myMSC hesap durumu alınamadı.');});return ()=>{active=false;};},[]);
 async function action(method:'POST'|'PUT'){
  if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');
  try{const r=await fetch('/api/carriers/msc',{method,headers:{'Content-Type':'application/json'},...(method==='PUT'?{body:JSON.stringify({username,password})}:{})});const d=await r.json() as MscState&{error?:string};if(!r.ok)throw Error(d.error||'İşlem tamamlanamadı.');setState(d);if(method==='PUT'){setUsername('');setPassword('');setOpen(false);}onChange?.();}
  catch(e){setError(userMessage(e));}finally{inFlight.current=false;setBusy(false);}
 }
 const editing=!state?.credentialsSaved||open;
 return <div className="site-msc-connection">
  {editing?<form className="site-msc-form" onSubmit={e=>{e.preventDefault();void action('PUT');}}>
   <p className="site-msc-title">{state?.credentialsSaved?'myMSC hesabını değiştir':'myMSC şirket hesabı'}</p>
   <label><span>E-posta</span><input type="email" autoComplete="off" required maxLength={256} placeholder="ornek@cbitransport.com" value={username} disabled={busy} onChange={e=>setUsername(e.target.value)}/></label>
   <label><span>Şifre</span><input type="password" autoComplete="new-password" required maxLength={1024} placeholder="••••••••" value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/></label>
   <div className="site-msc-buttons"><button className="site-msc-primary" disabled={busy}>{busy?'Kaydediliyor…':'Hesabı şifreli kaydet'}</button>{state?.credentialsSaved&&<button type="button" className="site-msc-link" disabled={busy} onClick={()=>{setOpen(false);setUsername('');setPassword('');}}>Vazgeç</button>}</div>
  </form>:<div className="site-msc-buttons"><button type="button" className="site-msc-primary" disabled={busy} onClick={()=>void action('POST')}>{busy?'Giriş deneniyor…':'Arka planda giriş yap'}</button><button type="button" className="site-msc-link" disabled={busy} onClick={()=>setOpen(true)}>Hesabı değiştir</button></div>}
  {state?.checkedAt&&<OperationToast tone={state.connected?'auto':'error'} message={userMessage(state.message)}/>}
  {error&&<OperationToast tone="error" message={userMessage(error)}/>}
 </div>;
}
