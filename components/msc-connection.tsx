'use client';
import {OperationToast} from '@/components/operation-toast';
import {userMessage} from '@/lib/user-message';
import {useEffect,useRef,useState} from 'react';
import {useUnsavedWork} from '@/hooks/use-unsaved-work';
import type {MscState} from '@/lib/server/msc-connection';

/** myMSC account form and server-side sign-in check; nothing is submitted to MSC here. */
export function MscConnection({onChange}:{onChange?:()=>void}){
 const [state,setState]=useState<MscState|null>(null),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const inFlight=useRef(false);
 useUnsavedWork(busy||!!username||!!password);
 useEffect(()=>{let active=true;fetch('/api/carriers/msc',{cache:'no-store'}).then(async r=>{const d=await r.json() as MscState&{error?:string};if(!r.ok)throw Error(d.error||'Hesap durumu alınamadı.');if(active)setState(d);}).catch(()=>{if(active)setError('myMSC hesap durumu alınamadı.');});return ()=>{active=false;};},[]);
 async function action(method:'POST'|'PUT'){
  if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');
  try{const r=await fetch('/api/carriers/msc',{method,headers:{'Content-Type':'application/json'},...(method==='PUT'?{body:JSON.stringify({username,password})}:{})});const d=await r.json() as MscState&{error?:string};if(!r.ok)throw Error(d.error||'İşlem tamamlanamadı.');setState(d);if(method==='PUT'){setUsername('');setPassword('');}onChange?.();}
  catch(e){setError(userMessage(e));}finally{inFlight.current=false;setBusy(false);}
 }
 return <div className="site-msc-connection">
  <details><summary>{state?.credentialsSaved?'myMSC hesabını değiştir':'myMSC hesabını kaydet'}</summary>
   <form onSubmit={e=>{e.preventDefault();void action('PUT');}}><label>Kullanıcı adı (e-posta)<input autoComplete="off" required maxLength={256} value={username} disabled={busy} onChange={e=>setUsername(e.target.value)}/></label><label>Şifre<input type="password" autoComplete="off" required maxLength={1024} value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy}>Hesabı şifreli kaydet</button></form>
  </details>
  <button type="button" disabled={busy||!state?.credentialsSaved} onClick={()=>void action('POST')}>{busy?'Giriş deneniyor…':'Arka planda giriş yap'}</button>
  {state?.checkedAt&&<OperationToast tone={state.connected?'auto':'error'} message={userMessage(state.message)}/>}
  {error&&<OperationToast tone="error" message={userMessage(error)}/>}
 </div>;
}
