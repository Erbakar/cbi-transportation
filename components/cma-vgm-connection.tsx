'use client';
import {OperationToast} from '@/components/operation-toast';
import {userMessage} from '@/lib/user-message';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {useUnsavedWork} from '@/hooks/use-unsaved-work';
type State={credentialsSaved:boolean;connected:boolean;submissionEnabled:boolean;message:string};
export function CmaVgmConnection({disabled=false}:{disabled?:boolean}){
 const [state,setState]=useState<State|null>(null),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const inFlight=useRef(false);
 const [backgroundMessage,setBackgroundMessage]=useState('');
 async function background(){if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');setBackgroundMessage('Şirket hesabı arka planda kontrol ediliyor…');try{const r=await fetch('/api/carriers/cma-cgm/agent-connection',{method:'POST'});const first=await r.json() as {error?:string};if(!r.ok)throw Error(first.error||'Bağlantı başlatılamadı.');const until=Date.now()+120000;while(Date.now()<until){await new Promise(r=>setTimeout(r,3000));const result=await fetch('/api/carriers/cma-cgm/agent-connection',{cache:'no-store'});const d=await result.json() as {connected:boolean;state:string;message:string;error?:string};if(!result.ok)throw Error(d.error||'Bağlantı durumu alınamadı.');if(d.connected){setBackgroundMessage(d.message);return;}if(d.state==='blocked')throw Error(d.message);}throw Error('Arka plan bağlantısı yanıt vermedi. Chrome ve güncel CBI eklentisini kontrol edin.');}catch(e){setError(userMessage(e));setBackgroundMessage('');}finally{setBusy(false);inFlight.current=false;}}
 useUnsavedWork(busy||!!username||!!password);
 useEffect(()=>{let active=true;fetch('/api/carriers/cma-cgm',{cache:'no-store'}).then(async r=>{const d=await r.json() as State&{error?:string};if(!r.ok)throw Error(d.error||'Hesap durumu alınamadı.');if(active)setState(d);}).catch(()=>{if(active)setError('CMA CGM hesap durumu alınamadı.');});return ()=>{active=false;};},[]);
 async function action(method:'POST'|'PUT'){
  if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');
  try{const r=await fetch('/api/carriers/cma-cgm',{method,headers:{'Content-Type':'application/json'},...(method==='PUT'?{body:JSON.stringify({username,password})}:{})});const d=await r.json() as State&{error?:string};if(!r.ok)throw Error(d.error||'İşlem tamamlanamadı.');setState(d);if(method==='PUT'){setUsername('');setPassword('');}}
  catch(e){setError(userMessage(e));}finally{inFlight.current=false;setBusy(false);}
 }
 return <section className="schedule-panel"><h2>CMA CGM · VGM bağlantısı</h2><p><Link href="/#site-hub">Açık Chrome oturumuyla bağlantıyı ve VGM listesini ana sayfadan kontrol edin →</Link></p><p>{state?.message||'Hesap durumu yükleniyor…'}</p>
 <details><summary>{state?.credentialsSaved?'Şirket hesabını değiştir':'Şirket hesabını kaydet'}</summary>
 <form onSubmit={e=>{e.preventDefault();void action('PUT');}}><label>Kullanıcı adı<input autoComplete="off" required maxLength={256} value={username} disabled={busy||disabled} onChange={e=>setUsername(e.target.value)}/></label><label>Şifre<input type="password" autoComplete="off" required maxLength={1024} value={password} disabled={busy||disabled} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy||disabled}>Hesabı şifreli kaydet</button></form></details>
 <button disabled={busy||disabled||!state?.credentialsSaved} onClick={()=>void background()}>Arka planda bağlantıyı kur</button>{backgroundMessage&&<OperationToast tone="auto" message={userMessage(backgroundMessage)}/>}
 <button disabled={busy||disabled||!state?.credentialsSaved} onClick={()=>void action('POST')}>{busy?'Kontrol ediliyor…':'Sunucudan erişimi kontrol et'}</button>
 {error&&<OperationToast tone="error" message={userMessage(error)}/>}<p>Bağlantı, kayıtlı şirket hesabını kontrol eder; gerekirse otomatik giriş dener. Armatör ek güvenlik doğrulaması isterse işlem durur. VGM gönderimi aşağıdaki ayrı bölümden onaylanır.</p></section>;
}
