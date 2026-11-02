'use client';
import {OperationToast} from '@/components/operation-toast';
import {userMessage} from '@/lib/user-message';
import {useState} from 'react';
export function InttraVgmAccess({bookingId,disabled=false}:{bookingId:string;disabled?:boolean}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 async function check(){setBusy(true);setMessage('');setError('');try{const r=await fetch('/api/bookings/'+bookingId+'/vgm/inttra',{cache:'no-store'}),d=await r.json() as {message:string;error?:string};if(!r.ok)throw new Error(d.error||'INTTRA erişimi kontrol edilemedi.');setMessage(d.message);}catch(e){setError(userMessage(e));}finally{setBusy(false);}}
 return <section className="schedule-panel"><h2>INTTRA eVGM</h2><p>INTTRA kullanan armatörler için ayrı erişim kontrolüdür. VGM, konşimento gönderiminden ayrı doğrulanır.</p><button disabled={busy||disabled} onClick={()=>void check()}>{busy?'Hesap kontrol ediliyor…':'INTTRA VGM erişimini kontrol et'}</button>{message&&<OperationToast tone="auto" message={message}/>}{error&&<OperationToast tone="error" message={userMessage(error)}/>}<p>Otomatik VGM gönderimi henüz açık değildir. Veri paketi indirmek gönderim veya armatör kabulü sayılmaz.</p></section>;
}
